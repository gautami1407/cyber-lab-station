import { WebSocket, WebSocketServer, type WebSocket as WebSocketClient } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { randomBytes, verify } from "node:crypto";
import { config } from "./config.js";
import { touchSession } from "./services/auth.js";
import { prisma } from "./prisma.js";
import { audit } from "./services/audit.js";

const clients = new Map<string, Set<WebSocketClient>>();
const agents = new Map<string, WebSocketClient>();
const heartbeatTimes = new Map<string, number>();
type ScreenTransfer = { transferId: string; operationId: string; pairedDeviceId: string; userId: string; byteLength: number; receivedBytes: number; nextSequence: number; totalChunks: number; timeout: NodeJS.Timeout };
const screenTransfers = new Map<string, ScreenTransfer>();
let staleTimer: NodeJS.Timeout | undefined;

function cookieValue(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  staleTimer = setInterval(() => void cleanupStaleAgents(), Math.max(config.agentHeartbeatIntervalMs, 1000));
  server.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/agent-ws") return handleAgentUpgrade(request, socket, head, url.searchParams.get("pairedDeviceId"));
    if (url.pathname !== "/api/ws") return;
    const sessionId = cookieValue(request, config.cookieName);
    if (!sessionId) return reject(socket);
    const session = await touchSession(sessionId).catch(() => null);
    if (!session) return reject(socket);
    wss.handleUpgrade(request, socket, head, (client) => {
      const userClients = clients.get(session.user.id) ?? new Set<WebSocketClient>();
      userClients.add(client);
      clients.set(session.user.id, userClients);
      client.send(JSON.stringify({ type: "CONNECTED", data: { userId: session.user.id } }));
      client.on("close", () => {
        userClients.delete(client);
        if (userClients.size === 0) clients.delete(session.user.id);
      });
      client.on("error", () => client.close());
    });
  });
  return wss;
}

function reject(socket: NodeJS.WritableStream) {
  socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
  socket.end();
}

export function publishUserEvent(userId: string, type: string, data: unknown) {
  const payload = JSON.stringify({ type, data });
  for (const client of clients.get(userId) ?? []) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

export function closeRealtime() {
  if (staleTimer) clearInterval(staleTimer);
  staleTimer = undefined;
  for (const userClients of clients.values()) for (const client of userClients) client.close();
  for (const agent of agents.values()) agent.close();
  clients.clear();
  agents.clear();
  heartbeatTimes.clear();
  for (const transfer of screenTransfers.values()) clearTimeout(transfer.timeout);
  screenTransfers.clear();
}

async function handleAgentUpgrade(request: IncomingMessage, socket: NodeJS.WritableStream, head: Buffer, pairedDeviceId: string | null) {
  if (!pairedDeviceId) return reject(socket);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const challenge = randomBytes(32).toString("base64url");
  wss.handleUpgrade(request, socket as never, head, (client) => {
    let authenticated = false;
    client.send(JSON.stringify({ type: "AGENT_CHALLENGE", nonce: challenge }));
    client.on("message", async (raw) => {
      try {
        const message = JSON.parse(String(raw)) as { type: string; publicKey?: string; signature?: string; operationId?: string; status?: string; data?: unknown; reason?: string };
        if (!authenticated && message.type === "AGENT_AUTH" && message.publicKey && message.signature) {
          const paired = await prisma.pairedDevice.findFirst({ where: { id: pairedDeviceId, status: "PAIRED" } });
          if (!paired || paired.publicKey !== message.publicKey || !verify(null, Buffer.from(challenge), paired.publicKey, Buffer.from(message.signature, "base64"))) return client.close(1008, "Agent authentication failed");
          authenticated = true;
          heartbeatTimes.set(pairedDeviceId, 0);
          agents.set(pairedDeviceId, client);
          await prisma.pairedDevice.update({ where: { id: pairedDeviceId }, data: { connectionStatus: "CONNECTED", lastSeen: new Date() } });
          await audit({ userId: paired.userId, action: "AGENT_CONNECTED", success: true, target: pairedDeviceId });
          client.send(JSON.stringify({ type: "AGENT_AUTHENTICATED", pairedDeviceId }));
          return;
        }
        if (authenticated && message.type === "HEARTBEAT") {
          const timestamp = Date.parse(String((message as { timestamp?: string }).timestamp ?? ""));
          const now = Date.now();
          const previous = heartbeatTimes.get(pairedDeviceId) ?? 0;
          if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > config.agentHeartbeatTimeoutMs || now - previous < Math.max(1000, config.agentHeartbeatIntervalMs / 2)) {
            client.send(JSON.stringify({ type: "HEARTBEAT_ACK", accepted: false, reason: "Invalid or excessive heartbeat." }));
            return;
          }
          heartbeatTimes.set(pairedDeviceId, now);
          await prisma.pairedDevice.update({ where: { id: pairedDeviceId }, data: { lastSeen: new Date(now), lastHeartbeat: new Date(now), connectionStatus: "CONNECTED" } });
          client.send(JSON.stringify({ type: "HEARTBEAT_ACK", accepted: true, timestamp: new Date(now).toISOString() }));
          return;
        }
        if (authenticated && message.type === "SCREEN_START") {
          const operationId = String((message as { operationId?: string }).operationId ?? "");
          const transferId = String((message as { transferId?: string }).transferId ?? "");
          const byteLength = Number((message as { byteLength?: number }).byteLength);
          const totalChunks = Number((message as { totalChunks?: number }).totalChunks);
          const operation = await prisma.remoteOperation.findFirst({ where: { id: operationId, pairedDeviceId, operation: "SCREEN_CAPTURE", status: "QUEUED" }, include: { user: true } });
          if (!operation || !transferId || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > config.screenCaptureMaxBytes || !Number.isSafeInteger(totalChunks) || totalChunks < 1 || totalChunks > Math.ceil(config.screenCaptureMaxBytes / config.screenCaptureChunkBytes)) return client.close(1008, "Invalid screen transfer");
          const timeout = setTimeout(() => void failScreenTransfer(transferId, "Capture timeout"), config.screenCaptureTimeoutMs);
          screenTransfers.set(transferId, { transferId, operationId, pairedDeviceId, userId: operation.userId, byteLength, receivedBytes: 0, nextSequence: 0, totalChunks, timeout });
          publishUserEvent(operation.userId, "SCREEN_START", { operationId, transferId, metadata: (message as { metadata?: unknown }).metadata });
          return;
        }
        if (authenticated && message.type === "SCREEN_CHUNK") {
          const transferId = String((message as { transferId?: string }).transferId ?? "");
          const transfer = screenTransfers.get(transferId);
          const sequence = Number((message as { sequence?: number }).sequence);
          const data = String((message as { data?: string }).data ?? "");
          if (!transfer || transfer.pairedDeviceId !== pairedDeviceId || sequence !== transfer.nextSequence || data.length > Math.ceil(config.screenCaptureChunkBytes * 4 / 3) + 32) return client.close(1008, "Invalid screen chunk");
          const chunk = Buffer.from(data, "base64");
          if (chunk.length < 1 || transfer.receivedBytes + chunk.length > transfer.byteLength) return client.close(1008, "Invalid screen chunk size");
          transfer.receivedBytes += chunk.length;
          transfer.nextSequence += 1;
          publishUserEvent(transfer.userId, "SCREEN_CHUNK", { operationId: transfer.operationId, transferId, sequence, data });
          return;
        }
        if (authenticated && message.type === "SCREEN_END") {
          const transferId = String((message as { transferId?: string }).transferId ?? "");
          const transfer = screenTransfers.get(transferId);
          if (!transfer || transfer.pairedDeviceId !== pairedDeviceId || transfer.receivedBytes !== transfer.byteLength || transfer.nextSequence !== transfer.totalChunks) return client.close(1008, "Invalid screen completion");
          clearTimeout(transfer.timeout);
          screenTransfers.delete(transferId);
          const metadata = (message as { metadata?: Record<string, unknown> }).metadata ?? {};
          await prisma.remoteOperation.update({ where: { id: transfer.operationId }, data: { status: "COMPLETED", resultJson: metadata as never } });
          await audit({ userId: transfer.userId, action: "SCREEN_CAPTURE_COMPLETED", success: true, target: transfer.operationId, metadata: { byteLength: transfer.byteLength, ...metadata } });
          publishUserEvent(transfer.userId, "SCREEN_END", { operationId: transfer.operationId, transferId, metadata });
          return;
        }
        if (!authenticated || message.type !== "REMOTE_RESULT" || !message.operationId) return client.close(1008, "Invalid agent message");
        const status = message.status ?? "FAILED";
        if (!["COMPLETED", "FAILED", "UNSUPPORTED"].includes(status)) return client.close(1008, "Invalid operation status");
        const operation = await prisma.remoteOperation.findFirst({ where: { id: message.operationId, pairedDeviceId } });
        if (!operation) return client.close(1008, "Operation is not owned by this agent");
        await prisma.remoteOperation.update({ where: { id: operation.id }, data: { status, reason: message.reason ?? null, resultJson: message.data as never } });
      } catch { client.close(1008, "Invalid agent payload"); }
    });
    client.on("close", () => {
      if (agents.get(pairedDeviceId) === client) agents.delete(pairedDeviceId);
      heartbeatTimes.delete(pairedDeviceId);
      void cleanupAgent(pairedDeviceId, "Agent disconnected").catch(() => undefined);
    });
    client.on("error", () => client.close());
  });
}

async function cleanupAgent(pairedDeviceId: string, reason: string) {
  const paired = await prisma.pairedDevice.findUnique({ where: { id: pairedDeviceId } });
  if (!paired) return;
  await prisma.pairedDevice.updateMany({ where: { id: pairedDeviceId }, data: { connectionStatus: "DISCONNECTED", lastSeen: new Date() } });
  await prisma.remoteSession.updateMany({ where: { pairedDeviceId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } });
  const operations = await prisma.remoteOperation.updateMany({ where: { pairedDeviceId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "FAILED", reason } });
  if (operations.count > 0) await audit({ userId: paired.userId, action: "REMOTE_OPERATION_FAILED", success: false, target: pairedDeviceId, metadata: { reason, count: operations.count } });
  for (const transfer of [...screenTransfers.values()]) if (transfer.pairedDeviceId === pairedDeviceId) await failScreenTransfer(transfer.transferId, reason);
  await audit({ userId: paired.userId, action: reason === "Agent heartbeat timeout" ? "AGENT_HEARTBEAT_TIMEOUT" : "AGENT_DISCONNECTED", success: false, target: pairedDeviceId, metadata: { reason } }).catch(() => undefined);
}

async function failScreenTransfer(transferId: string, reason: string) {
  const transfer = screenTransfers.get(transferId);
  if (!transfer) return;
  clearTimeout(transfer.timeout);
  screenTransfers.delete(transferId);
  await prisma.remoteOperation.update({ where: { id: transfer.operationId }, data: { status: "FAILED", reason } }).catch(() => undefined);
  await audit({ userId: transfer.userId, action: "SCREEN_CAPTURE_FAILED", success: false, target: transfer.operationId, metadata: { reason } }).catch(() => undefined);
  publishUserEvent(transfer.userId, "SCREEN_FAILED", { operationId: transfer.operationId, transferId, reason });
}

export async function cleanupStaleAgents(now = Date.now()) {
  const cutoff = now - config.agentHeartbeatTimeoutMs;
  for (const [pairedDeviceId, lastHeartbeat] of heartbeatTimes) {
    if (lastHeartbeat <= cutoff) {
      agents.get(pairedDeviceId)?.close(4000, "Heartbeat timeout");
      heartbeatTimes.delete(pairedDeviceId);
      await cleanupAgent(pairedDeviceId, "Agent heartbeat timeout");
    }
  }
}

export function sendAgentOperation(pairedDeviceId: string, operationId: string, sessionId: string, operation: string) {
  const agent = agents.get(pairedDeviceId);
  if (!agent || agent.readyState !== WebSocket.OPEN) return false;
  agent.send(JSON.stringify({ type: "REMOTE_OPERATION", operationId, sessionId, operation, timestamp: new Date().toISOString() }));
  return true;
}

export function disconnectAgent(pairedDeviceId: string, reason = "Pairing revoked") {
  agents.get(pairedDeviceId)?.close(4001, reason);
  agents.delete(pairedDeviceId);
  heartbeatTimes.delete(pairedDeviceId);
}
