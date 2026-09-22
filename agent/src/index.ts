import { randomUUID, sign } from "node:crypto";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";
import { Monitor } from "node-screenshots";
import { loadOrCreateIdentity } from "./identity.js";

export function getStreamFrameMetadata(frameBytes: Buffer, chunkByteLimit: number) {
  const payload = frameBytes.toString("base64");
  const totalBytes = frameBytes.length;
  let chunkSize = Math.min(chunkByteLimit, 8 * 1024);
  let chunks: string[] = [];
  for (let start = 0; start < payload.length; start += chunkSize) {
    chunks.push(payload.slice(start, start + chunkSize));
  }
  while (chunks.some((chunk) => Buffer.byteLength(JSON.stringify({ type: "SCREEN_STREAM_CHUNK", payload: chunk }), "utf8") > 16 * 1024)) {
    chunkSize = Math.max(1024, Math.floor(chunkSize * 0.8));
    chunks = [];
    for (let start = 0; start < payload.length; start += chunkSize) {
      chunks.push(payload.slice(start, start + chunkSize));
    }
    if (chunkSize <= 1024) break;
  }
  return { payload, totalBytes, totalChunks: chunks.length, chunkSize };
}

const serverUrl = process.env.NETLINK_SERVER_URL ?? "ws://127.0.0.1:4000";
const statePath = process.env.NETLINK_AGENT_STATE ?? "./netlink-agent-state.json";
const pairedDeviceId = process.env.NETLINK_PAIRED_DEVICE_ID;
const transportLimitBytes = 16 * 1024;
const heartbeatIntervalMs = Math.max(Number(process.env.NETLINK_AGENT_HEARTBEAT_INTERVAL_MS ?? 10_000), 1_000);
const screenMaxBytes = Math.max(Number(process.env.SCREEN_CAPTURE_MAX_BYTES ?? 2 * 1024 * 1024), 64 * 1024);
const screenChunkBytes = Math.max(Number(process.env.SCREEN_CAPTURE_CHUNK_BYTES ?? 8 * 1024), 1024);
const streamFps = Math.max(Number(process.env.SCREEN_STREAM_FPS ?? 5), 1);
const streamMaxFrameBytes = Math.max(Number(process.env.SCREEN_STREAM_MAX_FRAME_BYTES ?? 512 * 1024), 64 * 1024);
const streamChunkBytes = Math.max(Number(process.env.SCREEN_STREAM_CHUNK_BYTES ?? 8 * 1024), 1024);
let socket: WebSocket | undefined;
let state: ReturnType<typeof loadOrCreateIdentity> | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
let screenCaptureInFlight = false;
const activeStreams = new Map<string, { operationId: string; streamId: string; frameNumber: number; timer: NodeJS.Timeout; requestStop: boolean; active: boolean; capturing: boolean }>();

function safeSend(message: Record<string, unknown>) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  const json = JSON.stringify(message);
  if (Buffer.byteLength(json, "utf8") > transportLimitBytes) {
    return false;
  }
  socket.send(json);
  return true;
}

function splitFrameIntoChunks(frameBytes: Buffer) {
  const payload = frameBytes.toString("base64");
  let chunkSize = Math.min(streamChunkBytes, 8 * 1024);
  let chunks: string[] = [];
  for (let start = 0; start < payload.length; start += chunkSize) {
    chunks.push(payload.slice(start, start + chunkSize));
  }
  while (chunks.some((chunk) => Buffer.byteLength(JSON.stringify({ type: "SCREEN_STREAM_CHUNK", payload: chunk }), "utf8") > transportLimitBytes)) {
    chunkSize = Math.max(1024, Math.floor(chunkSize * 0.8));
    chunks = [];
    for (let start = 0; start < payload.length; start += chunkSize) {
      chunks.push(payload.slice(start, start + chunkSize));
    }
    if (chunkSize <= 1024) break;
  }
  return { payload, totalChunks: chunks.length, chunkSize };
}

async function captureWindowsScreen() {
  const monitor = Monitor.all().find((item) => Boolean(item.isPrimary)) ?? Monitor.all()[0];
  if (!monitor) throw new Error("No monitor is available for capture.");
  const image = await monitor.captureImage();
  const bytes = await image.toPng();
  if (bytes.length > streamMaxFrameBytes) throw new Error("Stream frame exceeds the configured size limit.");
  return { bytes, width: image.width, height: image.height };
}

function startAgent() {
  if (!pairedDeviceId) throw new Error("NETLINK_PAIRED_DEVICE_ID is required after pairing approval.");
  state = loadOrCreateIdentity(statePath);
  console.log(`Agent ${state.agentId} identity loaded. Submit this public key for pairing:\n${state.publicKey}`);
  socket = new WebSocket(`${serverUrl.replace(/^http/, "ws")}/api/agent-ws?pairedDeviceId=${encodeURIComponent(pairedDeviceId)}`);

  socket.on("open", () => console.log("NetLink agent connected; awaiting authentication challenge."));
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw)) as { type: string; nonce?: string; operationId?: string; operation?: string; streamId?: string };
    if (message.type === "AGENT_CHALLENGE" && message.nonce && state) {
      const signature = sign(null, Buffer.from(message.nonce), state.privateKey).toString("base64");
      socket?.send(JSON.stringify({ type: "AGENT_AUTH", agentId: state.agentId, publicKey: state.publicKey, signature }));
      return;
    }
    if (message.type === "AGENT_AUTHENTICATED") {
      heartbeatTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() }));
      }, heartbeatIntervalMs);
      return;
    }
    if (message.type === "REMOTE_OPERATION" && message.operationId) {
      if (message.operation === "GET_SYSTEM_INFO") {
        socket?.send(JSON.stringify({ type: "REMOTE_RESULT", operationId: message.operationId, status: "COMPLETED", data: { platform: process.platform, release: os.release(), hostname: os.hostname(), cpus: os.cpus().length, memoryBytes: os.totalmem(), uptimeSeconds: os.uptime(), interfaces: os.networkInterfaces() } }));
      } else if (message.operation === "SCREEN_CAPTURE") {
        void captureScreen(message.operationId);
      } else if (message.operation === "SCREEN_STREAM") {
        void startStream(message.operationId, message.streamId);
      } else if (message.operation === "SCREEN_STREAM_STOP") {
        stopStream(message.operationId, message.streamId);
      } else {
        socket?.send(JSON.stringify({ type: "REMOTE_RESULT", operationId: message.operationId, status: "UNSUPPORTED", reason: "This agent build does not support that operation." }));
      }
    }
  });

  socket.on("close", (code, reason) => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    for (const stream of activeStreams.values()) clearInterval(stream.timer);
    activeStreams.clear();
    console.error(`NetLink agent disconnected. code=${code} reason=${reason.toString() || "<none>"}`);
  });
  socket.on("error", (error) => console.error(`NetLink agent connection error: ${error.message}`));
}

async function captureScreen(operationId: string) {
  if (!socket) return;
  if (screenCaptureInFlight) {
    socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId, status: "FAILED", reason: "A screen capture is already in progress." }));
    return;
  }
  screenCaptureInFlight = true;
  try {
    const monitor = Monitor.all().find((item) => Boolean(item.isPrimary)) ?? Monitor.all()[0];
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

async function captureStreamFrame(streamId: string, operationId: string) {
  const active = activeStreams.get(streamId);
  if (!active || !active.active || active.capturing || !socket) return;
  active.capturing = true;
  try {
    const capture = await captureWindowsScreen();
    const frameId = `${streamId}-${randomUUID()}`;
    const chunkPlan = getStreamFrameMetadata(capture.bytes, streamChunkBytes);
    console.log(`Stream frame ${frameId}: bytes=${chunkPlan.totalBytes} chunks=${chunkPlan.totalChunks} chunkSize=${chunkPlan.chunkSize}`);
    const startEvent = { type: "SCREEN_STREAM_FRAME_START", operationId, streamId, frameId, totalChunks: chunkPlan.totalChunks, width: capture.width, height: capture.height, mimeType: "image/png", totalBytes: chunkPlan.totalBytes };
    if (!safeSend(startEvent)) {
      stopStream(operationId, streamId);
      return;
    }
    for (let chunkIndex = 0; chunkIndex < chunkPlan.totalChunks; chunkIndex += 1) {
      const chunk = chunkPlan.payload.slice(chunkIndex * (chunkPlan.chunkSize ?? streamChunkBytes), Math.min(chunkPlan.payload.length, (chunkIndex + 1) * (chunkPlan.chunkSize ?? streamChunkBytes)));
      const chunkMessage = { type: "SCREEN_STREAM_CHUNK", operationId, streamId, frameId, chunkIndex, totalChunks: chunkPlan.totalChunks, payload: chunk };
      if (!safeSend(chunkMessage)) {
        stopStream(operationId, streamId);
        return;
      }
    }
    const endMessage = { type: "SCREEN_STREAM_FRAME_END", operationId, streamId, frameId, totalChunks: chunkPlan.totalChunks };
    if (!safeSend(endMessage)) {
      stopStream(operationId, streamId);
      return;
    }
    const current = activeStreams.get(streamId);
    if (current && current.active) current.frameNumber += 1;
  } catch (error) {
    safeSend({ type: "REMOTE_RESULT", operationId, status: "FAILED", reason: error instanceof Error ? error.message : "Stream frame failed." });
    stopStream(operationId, streamId);
  } finally {
    const current = activeStreams.get(streamId);
    if (current) current.capturing = false;
  }
}

async function startStream(operationId: string, requestedStreamId?: string) {
  if (!socket) return;
  const streamId = requestedStreamId ?? randomUUID();
  if (activeStreams.has(streamId)) {
    const previous = activeStreams.get(streamId)!;
    if (previous.operationId === operationId || previous.active) {
      socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId, status: "FAILED", reason: "A screen stream is already active for this streamId." }));
      return;
    }
  }
  const metadata = { width: 0, height: 0, mimeType: "image/png", fps: streamFps, streamId };
  const timer = setInterval(() => {
    const current = activeStreams.get(streamId);
    if (current && current.active && current.operationId === operationId) void captureStreamFrame(streamId, operationId);
  }, Math.max(1000 / streamFps, 200));
  activeStreams.set(streamId, { operationId, streamId, frameNumber: 0, timer, requestStop: false, active: true, capturing: false });
  socket.send(JSON.stringify({ type: "SCREEN_STREAM_START", operationId, streamId, metadata }));
  await captureStreamFrame(streamId, operationId);
}

function stopStream(operationId: string, requestedStreamId?: string) {
  if (!socket) return;
  const streamId = requestedStreamId ?? [...activeStreams.keys()].find((candidate) => activeStreams.get(candidate)?.operationId === operationId);
  const current = streamId ? activeStreams.get(streamId) : undefined;
  if (!current || (requestedStreamId && current.streamId !== requestedStreamId) || current.operationId !== operationId) {
    socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId, status: "FAILED", reason: "No active stream matches this operation." }));
    return;
  }
  current.requestStop = true;
  current.active = false;
  clearInterval(current.timer);
  socket.send(JSON.stringify({ type: "SCREEN_STREAM_STOPPED", operationId, streamId: current.streamId, metadata: { frameCount: current.frameNumber } }));
  if (streamId) activeStreams.delete(streamId);
}

const isDirectScriptExecution = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isDirectScriptExecution) startAgent();
