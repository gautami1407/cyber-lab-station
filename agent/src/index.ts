import { randomUUID, sign } from "node:crypto";
import os from "node:os";
import { WebSocket } from "ws";
import { Monitor } from "node-screenshots";
import { loadOrCreateIdentity } from "./identity.js";

const serverUrl = process.env.NETLINK_SERVER_URL ?? "ws://127.0.0.1:4000";
const pairedDeviceId = process.env.NETLINK_PAIRED_DEVICE_ID;
const statePath = process.env.NETLINK_AGENT_STATE ?? "./netlink-agent-state.json";
if (!pairedDeviceId) throw new Error("NETLINK_PAIRED_DEVICE_ID is required after pairing approval.");

const state = loadOrCreateIdentity(statePath);
console.log(`Agent ${state.agentId} identity loaded. Submit this public key for pairing:\n${state.publicKey}`);
const socket = new WebSocket(`${serverUrl.replace(/^http/, "ws")}/api/agent-ws?pairedDeviceId=${encodeURIComponent(pairedDeviceId)}`);
let heartbeatTimer: NodeJS.Timeout | undefined;
const heartbeatIntervalMs = Math.max(Number(process.env.NETLINK_AGENT_HEARTBEAT_INTERVAL_MS ?? 10_000), 1_000);
const screenMaxBytes = Math.max(Number(process.env.SCREEN_CAPTURE_MAX_BYTES ?? 2 * 1024 * 1024), 64 * 1024);
const screenChunkBytes = Math.max(Number(process.env.SCREEN_CAPTURE_CHUNK_BYTES ?? 8 * 1024), 1024);
let screenCaptureInFlight = false;
socket.on("open", () => console.log("NetLink agent connected; awaiting authentication challenge."));
socket.on("message", (raw) => {
  const message = JSON.parse(String(raw)) as { type: string; nonce?: string; operationId?: string; operation?: string };
  if (message.type === "AGENT_CHALLENGE" && message.nonce) {
    const signature = sign(null, Buffer.from(message.nonce), state.privateKey).toString("base64");
    socket.send(JSON.stringify({ type: "AGENT_AUTH", agentId: state.agentId, publicKey: state.publicKey, signature }));
    return;
  }
  if (message.type === "AGENT_AUTHENTICATED") {
    heartbeatTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() }));
    }, heartbeatIntervalMs);
    return;
  }
  if (message.type === "REMOTE_OPERATION" && message.operationId) {
    if (message.operation === "GET_SYSTEM_INFO") {
      socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId: message.operationId, status: "COMPLETED", data: { platform: process.platform, release: os.release(), hostname: os.hostname(), cpus: os.cpus().length, memoryBytes: os.totalmem(), uptimeSeconds: os.uptime(), interfaces: os.networkInterfaces() } }));
    } else if (message.operation === "SCREEN_CAPTURE") {
      void captureScreen(message.operationId);
    } else {
      socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId: message.operationId, status: "UNSUPPORTED", reason: "This agent build does not support that operation." }));
    }
  }
});

async function captureScreen(operationId: string) {
  if (screenCaptureInFlight) {
    socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId, status: "FAILED", reason: "A screen capture is already in progress." }));
    return;
  }
  screenCaptureInFlight = true;
  try {
    const monitor = Monitor.all().find((item) => item.isPrimary()) ?? Monitor.all()[0];
    if (!monitor) throw new Error("No monitor is available for capture.");
    const image = await monitor.captureImage();
    const bytes = await image.toPng();
    if (bytes.length > screenMaxBytes) throw new Error("Screen capture exceeds the configured size limit.");
    const transferId = randomUUID();
    const totalChunks = Math.ceil(bytes.length / screenChunkBytes);
    const metadata = { width: image.width, height: image.height, format: "png", byteLength: bytes.length, totalChunks, capturedAt: new Date().toISOString(), platform: process.platform };
    socket.send(JSON.stringify({ type: "SCREEN_START", operationId, transferId, byteLength: bytes.length, totalChunks, metadata }));
    for (let sequence = 0; sequence < totalChunks; sequence += 1) {
      const chunk = bytes.subarray(sequence * screenChunkBytes, Math.min(bytes.length, (sequence + 1) * screenChunkBytes));
      socket.send(JSON.stringify({ type: "SCREEN_CHUNK", operationId, transferId, sequence, data: chunk.toString("base64") }));
    }
    socket.send(JSON.stringify({ type: "SCREEN_END", operationId, transferId, metadata }));
  } catch (error) {
    socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId, status: "FAILED", reason: error instanceof Error ? error.message : "Screen capture failed." }));
  } finally {
    screenCaptureInFlight = false;
  }
}
socket.on("close", () => { if (heartbeatTimer) clearInterval(heartbeatTimer); console.log("NetLink agent disconnected."); });
socket.on("error", (error) => console.error(`NetLink agent connection error: ${error.message}`));
