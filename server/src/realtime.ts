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
export type ScreenStreamStatus = "STARTING" | "STREAMING" | "STOPPING" | "STOPPED" | "FAILED";
export type ScreenStreamRecord = {
  streamId: string;
  operationId: string;
  pairedDeviceId: string;
  userId: string;
  sessionId: string;
  status: ScreenStreamStatus;
  createdAt: number;
  lastFrameAt: number;
  lastChunkAt: number;
  currentFrameId: string;
  currentFrameBytes: number;
  currentChunkIndex: number;
  pendingFrames: Array<{ frameId: string; createdAt: number; width?: number; height?: number; mimeType?: string; totalBytes?: number; payload?: string }>;
  framesCaptured: number;
  framesDelivered: number;
  framesDropped: number;
  timeout?: NodeJS.Timeout;
};
type StreamFrame = { streamId: string; operationId: string; pairedDeviceId: string; frameId: string; totalChunks: number; chunks: Map<number, string>; width: number; height: number; mimeType: string; totalBytes: number; receivedBytes: number; isComplete: boolean };
const screenTransfers = new Map<string, ScreenTransfer>();
const screenStreams = new Map<string, ScreenStreamRecord>();
const streamFrames = new Map<string, StreamFrame>();
let staleTimer: NodeJS.Timeout | undefined;

export function createScreenStreamState(input: { streamId: string; userId: string; pairedDeviceId: string; sessionId: string; operationId: string }): ScreenStreamRecord {
  return {
    streamId: input.streamId,
    operationId: input.operationId,
    pairedDeviceId: input.pairedDeviceId,
    userId: input.userId,
    sessionId: input.sessionId,
    status: "STARTING",
    createdAt: Date.now(),
    lastFrameAt: 0,
    lastChunkAt: 0,
    currentFrameId: "",
    currentFrameBytes: 0,
    currentChunkIndex: 0,
    pendingFrames: [],
    framesCaptured: 0,
    framesDelivered: 0,
    framesDropped: 0,
  };
}

export function registerScreenStreamState(input: { streamId: string; userId: string; pairedDeviceId: string; sessionId: string; operationId: string }): ScreenStreamRecord {
  const existing = getActiveScreenStreamForSession(input.pairedDeviceId, input.sessionId);
  if (existing && existing.status !== "STOPPED" && existing.status !== "FAILED") {
    return existing;
  }

  const activeStreams = [...screenStreams.values()].filter((stream) => stream.userId === input.userId && stream.status !== "STOPPED" && stream.status !== "FAILED").length;
  if (activeStreams >= Math.max(1, config.screenStreamMaxConcurrentStreams)) {
    throw new Error("The maximum active screen streams has been reached.");
  }

  const stream = createScreenStreamState(input);
  const timeout = setTimeout(() => void failScreenStream(stream.streamId, "Stream timeout"), config.screenStreamTimeoutMs);
  stream.timeout = timeout;
  screenStreams.set(stream.streamId, stream);
  return stream;
}

export function transitionScreenStreamState(stream: ScreenStreamRecord, nextStatus: string): ScreenStreamRecord {
  const allowedTransitions: Record<ScreenStreamStatus, ScreenStreamStatus[]> = {
    STARTING: ["STARTING", "STREAMING", "FAILED", "STOPPED"],
    STREAMING: ["STREAMING", "STOPPING", "FAILED", "STOPPED"],
    STOPPING: ["STOPPED", "FAILED"],
    STOPPED: ["FAILED"],
    FAILED: ["FAILED"],
  };
  const current = stream.status;
  const next = nextStatus as ScreenStreamStatus;
  if (!allowedTransitions[current]?.includes(next)) {
    throw new Error(`Invalid stream transition: ${current} -> ${nextStatus}`);
  }
  stream.status = next;
  return stream;
}

export function enforceScreenStreamBackpressure(stream: ScreenStreamRecord, frame: { frameId: string; createdAt: number; width?: number; height?: number; mimeType?: string; totalBytes?: number; payload?: string }): void {
  const maxPending = Math.max(1, Math.min(config.screenStreamMaxPendingFrames, 256));
  const queue = stream.pendingFrames;
  if (queue.length >= maxPending) {
    const overflow = queue.length - maxPending + 1;
    for (let index = 0; index < overflow; index += 1) queue.shift();
    stream.framesDropped += overflow;
  }
  queue.push({ ...frame, createdAt: frame.createdAt || Date.now() });
  if (queue.length > maxPending) {
    const excess = queue.length - maxPending;
    for (let index = 0; index < excess; index += 1) queue.shift();
    stream.framesDropped += excess;
  }
  if (queue.length > maxPending) {
    queue.splice(0, queue.length - maxPending);
  }
}

export function reconstructScreenStreamPayload(input: { totalChunks: number; chunks: Map<number, string> | Record<number, string>; totalBytes?: number }): string {
  if (!Number.isInteger(input.totalChunks) || input.totalChunks < 1) return "";
  const orderedChunks = Array.from({ length: input.totalChunks }, (_, index) => {
    if (input.chunks instanceof Map) return input.chunks.get(index) ?? "";
    return input.chunks[index] ?? "";
  });
  const payload = orderedChunks.join("");
  if (input.totalBytes !== undefined && Number.isFinite(input.totalBytes) && input.totalBytes > 0) {
    const decodedLength = Buffer.from(payload, "base64").length;
    if (decodedLength > input.totalBytes) return payload.slice(0, Math.max(0, Math.floor((payload.length * input.totalBytes) / Math.max(decodedLength, 1))));
  }
  return payload;
}

export function getActiveScreenStreamForSession(pairedDeviceId: string, sessionId: string): ScreenStreamRecord | undefined {
  for (const stream of screenStreams.values()) {
    if (stream.pairedDeviceId === pairedDeviceId && stream.sessionId === sessionId && stream.status !== "STOPPED" && stream.status !== "FAILED") return stream;
  }
  return undefined;
}

export function validateScreenStreamOwnership(stream: ScreenStreamRecord | undefined, userId: string, pairedDeviceId: string, sessionId: string): boolean {
  return Boolean(stream && stream.userId === userId && stream.pairedDeviceId === pairedDeviceId && stream.sessionId === sessionId && stream.status !== "STOPPED" && stream.status !== "FAILED");
}

export function validateScreenStreamFrame(stream: ScreenStreamRecord | undefined, input: { streamId: string; frameId: string; pairedDeviceId?: string; sessionId?: string; userId?: string; chunkIndex?: number; totalChunks?: number; payload?: string; totalBytes?: number }, agentPairedDeviceId: string): { ok: boolean; reason?: string } {
  if (!stream) return { ok: false, reason: "unknown streamId" };
  if (stream.streamId !== input.streamId) return { ok: false, reason: "unknown streamId" };
  if (input.pairedDeviceId && input.pairedDeviceId !== stream.pairedDeviceId) return { ok: false, reason: "wrong pairedDeviceId" };
  if (input.sessionId && input.sessionId !== stream.sessionId) return { ok: false, reason: "wrong sessionId" };
  if (input.userId && input.userId !== stream.userId) return { ok: false, reason: "wrong userId" };
  if (stream.pairedDeviceId !== agentPairedDeviceId) return { ok: false, reason: "wrong authenticated agent" };
  if (!input.frameId || input.frameId.length === 0) return { ok: false, reason: "unknown frameId" };
  if (!Number.isInteger(input.chunkIndex) || input.chunkIndex! < 0) return { ok: false, reason: "invalid chunkIndex" };
  if (!Number.isInteger(input.totalChunks) || input.totalChunks! < 1) return { ok: false, reason: "invalid totalChunks" };
  if (input.chunkIndex! >= input.totalChunks!) return { ok: false, reason: "invalid chunkIndex" };
  if (!input.payload || input.payload.length === 0) return { ok: false, reason: "malformed payload" };
  if (input.payload.length > config.screenStreamChunkBytes) return { ok: false, reason: "oversized chunk" };
  if (input.totalBytes !== undefined && input.totalBytes > config.screenStreamMaxFrameBytes) return { ok: false, reason: "oversized frame" };
  return { ok: true };
}

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
  const nodeSocket = socket as NodeJS.Socket & { destroyed?: boolean; writableEnded?: boolean };
  if (nodeSocket.destroyed || nodeSocket.writableEnded) return;
  try {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
  } catch {
    // Ignore reset/disconnect races during unauthorized upgrade rejections.
  }
  try {
    socket.end();
  } catch {
    // Ignore already-closed sockets during upgrade rejection.
  }
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
  for (const stream of screenStreams.values()) clearTimeout(stream.timeout);
  screenTransfers.clear();
  screenStreams.clear();
  streamFrames.clear();
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
          heartbeatTimes.set(pairedDeviceId, Date.now() - Math.max(1000, config.agentHeartbeatIntervalMs / 2));
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
          if (!transferId || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > config.screenCaptureMaxBytes || !Number.isSafeInteger(totalChunks) || totalChunks < 1 || totalChunks > Math.ceil(config.screenCaptureMaxBytes / config.screenCaptureChunkBytes)) {
            return client.close(1008, "Invalid screen transfer");
          }
          const timeout = setTimeout(() => void failScreenTransfer(transferId, "Capture timeout"), config.screenCaptureTimeoutMs);
          screenTransfers.set(transferId, { transferId, operationId, pairedDeviceId, userId: "", byteLength, receivedBytes: 0, nextSequence: 0, totalChunks, timeout });
          const operation = await prisma.remoteOperation.findFirst({ where: { id: operationId, pairedDeviceId, operation: "SCREEN_CAPTURE", status: "QUEUED" }, include: { user: true } });
          if (!operation) {
            clearTimeout(timeout);
            screenTransfers.delete(transferId);
            return client.close(1008, "Invalid screen transfer");
          }
          const transfer = screenTransfers.get(transferId);
          if (transfer) transfer.userId = operation.userId;
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
        if (authenticated && message.type === "SCREEN_STREAM_START") {
          const operationId = String((message as { operationId?: string }).operationId ?? "");
          const streamId = String((message as { streamId?: string }).streamId ?? "");
          const metadata = (message as { metadata?: Record<string, unknown> }).metadata ?? {};
          const existing = await prisma.remoteOperation.findFirst({ where: { id: operationId, pairedDeviceId, operation: "SCREEN_STREAM", status: "QUEUED" }, include: { user: true } });
          if (!streamId || !existing) return client.close(1008, "Invalid screen stream");
          const current = screenStreams.get(streamId) ?? createScreenStreamState({ streamId, userId: existing.userId, pairedDeviceId, sessionId: String((message as { sessionId?: string }).sessionId ?? ""), operationId });
          if (screenStreams.has(streamId) && current.status !== "STARTING") return client.close(1008, "Duplicate screen stream");
          current.lastChunkAt = Date.now();
          current.lastFrameAt = Date.now();
          const timeout = setTimeout(() => void failScreenStream(streamId, "Stream timeout"), config.screenStreamTimeoutMs);
          current.timeout = timeout;
          screenStreams.set(streamId, current);
          transitionScreenStreamState(current, "STARTING");
          await audit({ userId: existing.userId, action: "SCREEN_STREAM_STARTED", success: true, target: operationId, metadata: { streamId, ...metadata } }).catch(() => undefined);
          publishUserEvent(existing.userId, "SCREEN_STREAM_START", { operationId, streamId, metadata });
          return;
        }
        if (authenticated && message.type === "SCREEN_STREAM_FRAME_START") {
          const streamId = String((message as { streamId?: string }).streamId ?? "");
          const stream = screenStreams.get(streamId);
          if (!stream || stream.pairedDeviceId !== pairedDeviceId) return client.close(1008, "Invalid stream frame start");
          const frameId = String((message as { frameId?: string }).frameId ?? "");
          const totalChunks = Number((message as { totalChunks?: number }).totalChunks);
          const width = Number((message as { width?: number }).width);
          const height = Number((message as { height?: number }).height);
          const mimeType = String((message as { mimeType?: string }).mimeType ?? "image/png");
          const totalBytes = Number((message as { totalBytes?: number }).totalBytes);
          if (!frameId || !Number.isInteger(totalChunks) || totalChunks < 1 || !Number.isFinite(width) || !Number.isFinite(height) || totalBytes < 1 || totalBytes > config.screenStreamMaxFrameBytes) {
            return client.close(1008, "Invalid stream frame metadata");
          }
          if (stream.currentFrameId && stream.currentFrameId !== frameId && stream.currentFrameBytes > 0) return client.close(1008, "Frame already in progress");
          if (streamFrames.has(frameId)) return client.close(1008, "Duplicate stream frame");
          const frame: StreamFrame = { streamId, operationId: stream.operationId, pairedDeviceId, frameId, totalChunks, chunks: new Map(), width, height, mimeType, totalBytes, receivedBytes: 0, isComplete: false };
          streamFrames.set(frameId, frame);
          stream.currentFrameId = frameId;
          stream.currentFrameBytes = totalBytes;
          stream.currentChunkIndex = 0;
          stream.lastFrameAt = Date.now();
          if (stream.timeout) clearTimeout(stream.timeout);
          stream.timeout = setTimeout(() => void failScreenStream(streamId, "Stream timeout"), config.screenStreamTimeoutMs);
          transitionScreenStreamState(stream, "STREAMING");
          publishUserEvent(stream.userId, "SCREEN_STREAM_FRAME_START", { streamId: frame.streamId, operationId: frame.operationId, frameId, totalChunks, width: frame.width, height: frame.height, mimeType: frame.mimeType, totalBytes: frame.totalBytes });
          return;
        }
        if (authenticated && message.type === "SCREEN_STREAM_CHUNK") {
          const streamId = String((message as { streamId?: string }).streamId ?? "");
          const stream = screenStreams.get(streamId);
          if (!stream || stream.pairedDeviceId !== pairedDeviceId) return client.close(1008, "Invalid stream chunk");
          const frameId = String((message as { frameId?: string }).frameId ?? "");
          const frame = streamFrames.get(frameId);
          const chunkIndex = Number((message as { chunkIndex?: number }).chunkIndex);
          const totalChunks = Number((message as { totalChunks?: number }).totalChunks);
          const payload = String((message as { payload?: string }).payload ?? "");
          if (!frame || frame.streamId !== streamId || chunkIndex < 0 || chunkIndex >= totalChunks || totalChunks !== frame.totalChunks || payload.length === 0 || payload.length > config.screenStreamChunkBytes) {
            return client.close(1008, "Invalid stream chunk");
          }
          if (frame.chunks.has(chunkIndex)) return client.close(1008, "Duplicate stream chunk");
          if (frame.chunks.size !== chunkIndex) return client.close(1008, "Out-of-order stream chunk");
          const chunk = Buffer.from(payload, "base64");
          if (chunk.length === 0 || !Number.isFinite(frame.totalBytes) || frame.receivedBytes + chunk.length > frame.totalBytes) return client.close(1008, "Malformed stream payload");
          frame.chunks.set(chunkIndex, chunk.toString("base64"));
          frame.receivedBytes += chunk.length;
          stream.lastChunkAt = Date.now();
          stream.currentChunkIndex = chunkIndex + 1;
          if (frame.chunks.size === frame.totalChunks) frame.isComplete = true;
          publishUserEvent(stream.userId, "SCREEN_STREAM_CHUNK", { streamId: frame.streamId, operationId: frame.operationId, frameId, chunkIndex, totalChunks, payload });
          return;
        }
        if (authenticated && message.type === "SCREEN_STREAM_FRAME_END") {
          const streamId = String((message as { streamId?: string }).streamId ?? "");
          const stream = screenStreams.get(streamId);
          if (!stream || stream.pairedDeviceId !== pairedDeviceId) return client.close(1008, "Invalid stream frame end");
          const frameId = String((message as { frameId?: string }).frameId ?? "");
          const frame = streamFrames.get(frameId);
          if (!frame || frame.streamId !== streamId) return client.close(1008, "Unknown stream frame");
          if (!frame.isComplete || frame.receivedBytes !== frame.totalBytes) return client.close(1008, "Incomplete stream frame");
          stream.framesCaptured += 1;
          stream.framesDelivered += 1;
          const payload = reconstructScreenStreamPayload({ totalChunks: frame.totalChunks, chunks: frame.chunks, totalBytes: frame.totalBytes });
          stream.pendingFrames.push({ frameId, createdAt: Date.now(), width: frame.width, height: frame.height, mimeType: frame.mimeType, totalBytes: frame.totalBytes, payload });
          enforceScreenStreamBackpressure(stream, { frameId, createdAt: Date.now(), width: frame.width, height: frame.height, mimeType: frame.mimeType, totalBytes: frame.totalBytes, payload });
          publishUserEvent(stream.userId, "SCREEN_STREAM_FRAME", { streamId: frame.streamId, operationId: frame.operationId, frameId, width: frame.width, height: frame.height, mimeType: frame.mimeType, totalBytes: frame.totalBytes, data: payload });
          publishUserEvent(stream.userId, "SCREEN_STREAM_FRAME_END", { streamId: frame.streamId, operationId: frame.operationId, frameId, totalChunks: frame.totalChunks });
          streamFrames.delete(frameId);
          stream.currentFrameId = "";
          stream.currentFrameBytes = 0;
          stream.currentChunkIndex = 0;
          return;
        }
        if (authenticated && message.type === "SCREEN_STREAM_STOPPED") {
          const streamId = String((message as { streamId?: string }).streamId ?? "");
          const stream = screenStreams.get(streamId);
          if (!stream || stream.pairedDeviceId !== pairedDeviceId) return client.close(1008, "Invalid stream stop");
          clearTimeout(stream.timeout);
          transitionScreenStreamState(stream, "STOPPED");
          screenStreams.delete(streamId);
          const metadata = (message as { metadata?: Record<string, unknown> }).metadata ?? { frameCount: stream.framesDelivered };
          await prisma.remoteOperation.update({ where: { id: stream.operationId }, data: { status: "COMPLETED", resultJson: metadata as never } }).catch(() => undefined);
          await audit({ userId: stream.userId, action: "SCREEN_STREAM_STOPPED", success: true, target: stream.operationId, metadata: { streamId, frameCount: stream.framesDelivered, ...metadata } }).catch(() => undefined);
          publishUserEvent(stream.userId, "SCREEN_STREAM_STOPPED", { operationId: stream.operationId, streamId, metadata });
          return;
        }
        if (!authenticated || message.type !== "REMOTE_RESULT" || !message.operationId) return client.close(1008, "Invalid agent message");
        const status = message.status ?? "FAILED";
        if (!["COMPLETED", "FAILED", "UNSUPPORTED"].includes(status)) return client.close(1008, "Invalid operation status");
        const operation = await prisma.remoteOperation.findFirst({ where: { id: message.operationId, pairedDeviceId } });
        if (!operation) return client.close(1008, "Operation is not owned by this agent");
        await prisma.remoteOperation.update({ where: { id: operation.id }, data: { status, reason: message.reason ?? null, resultJson: message.data as never } });
      } catch (error) {
        console.error(`Agent payload handling failed. pairedDeviceId=${pairedDeviceId}`, error);
        client.close(1008, "Invalid agent payload");
      }
    });
    client.on("close", (code, reason) => {
      console.warn(`Agent socket closed. pairedDeviceId=${pairedDeviceId} code=${code} reason=${reason.toString() || "<none>"}`);
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
  for (const stream of [...screenStreams.values()]) if (stream.pairedDeviceId === pairedDeviceId) await failScreenStream(stream.streamId, reason);
  for (const frame of [...streamFrames.values()]) if (frame.pairedDeviceId === pairedDeviceId) streamFrames.delete(frame.frameId);
  await audit({ userId: paired.userId, action: reason === "Agent heartbeat timeout" ? "AGENT_HEARTBEAT_TIMEOUT" : "AGENT_DISCONNECTED", success: false, target: pairedDeviceId, metadata: { reason } }).catch(() => undefined);
}

export async function cleanupScreenStream(streamId: string, reason: string, userId?: string) {
  const stream = screenStreams.get(streamId);
  if (!stream) return;
  if (stream.timeout) clearTimeout(stream.timeout);
  stream.timeout = undefined;
  stream.status = "FAILED";
  stream.pendingFrames = [];
  stream.currentFrameId = "";
  stream.currentFrameBytes = 0;
  stream.currentChunkIndex = 0;
  screenStreams.delete(streamId);
  for (const frame of [...streamFrames.values()]) if (frame.streamId === streamId) streamFrames.delete(frame.frameId);
  const targetUserId = userId ?? stream.userId;
  const action = reason.toLowerCase().includes("timeout") ? "SCREEN_STREAM_TIMEOUT" : "SCREEN_STREAM_FAILED";
  await prisma.remoteOperation.update({ where: { id: stream.operationId }, data: { status: "FAILED", reason } }).catch(() => undefined);
  await audit({ userId: targetUserId, action, success: false, target: stream.operationId, metadata: { streamId, reason } }).catch(() => undefined);
  publishUserEvent(targetUserId, "SCREEN_STREAM_ERROR", { operationId: stream.operationId, streamId, reason });
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

async function failScreenStream(streamId: string, reason: string) {
  const stream = screenStreams.get(streamId);
  if (!stream) return;
  const action = reason.toLowerCase().includes("timeout") ? "SCREEN_STREAM_TIMEOUT" : "SCREEN_STREAM_FAILED";
  clearTimeout(stream.timeout);
  stream.pendingFrames = [];
  stream.currentFrameId = "";
  stream.currentFrameBytes = 0;
  stream.currentChunkIndex = 0;
  screenStreams.delete(streamId);
  for (const frame of [...streamFrames.values()]) if (frame.streamId === streamId) streamFrames.delete(frame.frameId);
  await prisma.remoteOperation.update({ where: { id: stream.operationId }, data: { status: "FAILED", reason } }).catch(() => undefined);
  await audit({ userId: stream.userId, action, success: false, target: stream.operationId, metadata: { streamId, reason } }).catch(() => undefined);
  publishUserEvent(stream.userId, "SCREEN_STREAM_ERROR", { operationId: stream.operationId, streamId, reason });
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

export function sendAgentOperation(pairedDeviceId: string, operationId: string, sessionId: string, operation: string, streamId?: string) {
  const agent = agents.get(pairedDeviceId);
  if (!agent || agent.readyState !== WebSocket.OPEN) return false;
  agent.send(JSON.stringify({ type: "REMOTE_OPERATION", operationId, sessionId, operation, streamId, timestamp: new Date().toISOString() }));
  return true;
}

export function disconnectAgent(pairedDeviceId: string, reason = "Pairing revoked") {
  agents.get(pairedDeviceId)?.close(4001, reason);
  agents.delete(pairedDeviceId);
  heartbeatTimes.delete(pairedDeviceId);
}
