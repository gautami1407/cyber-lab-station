import { generateKeyPairSync, sign } from "node:crypto";
import { createServer, type Server } from "node:http";
import request from "supertest";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { attachRealtime, cleanupStaleAgents, closeRealtime } from "./realtime.js";
import { prisma } from "./prisma.js";

const enabled = Boolean(process.env.DATABASE_URL);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function nextMessage(socket: WebSocket) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const onMessage = (raw: Buffer) => { socket.off("error", onError); resolve(JSON.parse(String(raw)) as Record<string, unknown>); };
    const onError = (error: Error) => { socket.off("message", onMessage); reject(error); };
    socket.once("message", onMessage);
    socket.once("error", onError);
  });
}

describe.skipIf(!enabled)("agent pairing and system information integration", () => {
  let server: Server;
  let baseUrl = "";
  let userId = "";
  let httpAgent: ReturnType<typeof request.agent>;
  let csrf = "";
  let pairedDeviceId = "";
  let sessionId = "";

  beforeAll(async () => {
    const app = createApp();
    server = createServer(app);
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind.");
    baseUrl = `ws://127.0.0.1:${address.port}`;
    httpAgent = request.agent(server);
    csrf = (await httpAgent.get("/api/csrf")).body.data.csrfToken as string;
    const suffix = `${Date.now()}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const registered = await httpAgent.post("/api/auth/register").set("X-CSRF-Token", csrf).send({
      username: `agenttest${suffix}`,
      email: `agenttest${suffix}@example.test`,
      password: "UniversityLab!2026",
      confirmPassword: "UniversityLab!2026",
    });
    expect(registered.status).toBe(201);
    userId = registered.body.data.userId as string;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    closeRealtime();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("completes pairing, authenticated agent session, system info, and cleanup", async () => {
    const keys = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const pairing = await httpAgent.post("/api/pairing/request").set("X-CSRF-Token", csrf).send({ deviceName: "Integration Agent", publicKey: keys.publicKey });
    expect(pairing.status).toBe(201);
    const requestId = pairing.body.data.id as string;
    const approved = await httpAgent.post(`/api/pairing/${requestId}/approve`).set("X-CSRF-Token", csrf).send();
    expect(approved.status).toBe(200);
    pairedDeviceId = approved.body.data.paired.id as string;

    const session = await httpAgent.post("/api/remote/session").set("X-CSRF-Token", csrf).send({ pairedDeviceId });
    expect(session.status).toBe(201);
    sessionId = session.body.data.id as string;

    const socket = new WebSocket(`${baseUrl}/api/agent-ws?pairedDeviceId=${pairedDeviceId}`);
    const challenge = await nextMessage(socket);
    expect(challenge.type).toBe("AGENT_CHALLENGE");
    const nonce = String(challenge.nonce);
    socket.send(JSON.stringify({ type: "AGENT_AUTH", agentId: "integration-agent", publicKey: keys.publicKey, signature: sign(null, Buffer.from(nonce), keys.privateKey).toString("base64") }));
    expect((await nextMessage(socket)).type).toBe("AGENT_AUTHENTICATED");

    socket.send(JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() }));
    const heartbeat = await nextMessage(socket);
    expect(heartbeat).toMatchObject({ type: "HEARTBEAT_ACK", accepted: true });
    const pairedAfterHeartbeat = await prisma.pairedDevice.findUnique({ where: { id: pairedDeviceId } });
    expect(pairedAfterHeartbeat?.connectionStatus).toBe("CONNECTED");
    expect(pairedAfterHeartbeat?.lastHeartbeat).toBeInstanceOf(Date);
    socket.send(JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() }));
    expect(await nextMessage(socket)).toMatchObject({ type: "HEARTBEAT_ACK", accepted: false });

    const operationRequest = httpAgent.post("/api/remote/operation").set("X-CSRF-Token", csrf).send({ pairedDeviceId, sessionId, operation: "GET_SYSTEM_INFO" });
    const operationPromise = operationRequest.then((response) => response);
    const operationMessage = await nextMessage(socket);
    expect(operationMessage.type).toBe("REMOTE_OPERATION");
    const operationId = String(operationMessage.operationId);
    const system = { platform: process.platform, hostname: "integration-agent", cpus: 1, memoryBytes: 1024, uptimeSeconds: 1, interfaces: {} };
    socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId, status: "COMPLETED", data: system }));
    expect((await operationPromise).status).toBe(202);
    // Bounded polling: check DB every 75ms until status leaves QUEUED (max 2s).
    // This avoids the race where the WS handler's DB write hasn't committed yet.
    const pollDeadline = Date.now() + 2000;
    let operation = await prisma.remoteOperation.findUnique({ where: { id: operationId } });
    while (operation?.status === "QUEUED" && Date.now() < pollDeadline) {
      await delay(75);
      operation = await prisma.remoteOperation.findUnique({ where: { id: operationId } });
    }
    expect(operation?.status, `operation ${operationId} should reach COMPLETED within 2s (got: ${operation?.status})`).toBe("COMPLETED");
    expect(await prisma.auditLog.count({ where: { userId, action: "REMOTE_OPERATION_REQUESTED" } })).toBeGreaterThan(0);

    const endedResponse = await httpAgent.post(`/api/remote/session/${sessionId}/end`).set("X-CSRF-Token", csrf).send();
    expect(endedResponse.status).toBe(200);
    const ended = await prisma.remoteSession.findUnique({ where: { id: sessionId } });
    expect(ended?.status).toBe("ENDED");

    const staleSession = await httpAgent.post("/api/remote/session").set("X-CSRF-Token", csrf).send({ pairedDeviceId });
    expect(staleSession.status).toBe(201);
    const staleSessionId = staleSession.body.data.id as string;
    const staleClose = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    await cleanupStaleAgents(Date.now() + 60_000);
    await staleClose;
    const staleEnded = await prisma.remoteSession.findUnique({ where: { id: staleSessionId } });
    expect(staleEnded?.status).toBe("ENDED");
    await cleanupStaleAgents(Date.now() + 60_000);

    const reconnected = new WebSocket(`${baseUrl}/api/agent-ws?pairedDeviceId=${pairedDeviceId}`);
    const reconnectChallenge = await nextMessage(reconnected);
    reconnected.send(JSON.stringify({ type: "AGENT_AUTH", publicKey: keys.publicKey, signature: sign(null, Buffer.from(String(reconnectChallenge.nonce)), keys.privateKey).toString("base64") }));
    expect((await nextMessage(reconnected)).type).toBe("AGENT_AUTHENTICATED");
    reconnected.send(JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() }));
    expect(await nextMessage(reconnected)).toMatchObject({ type: "HEARTBEAT_ACK", accepted: true });

    const revoked = await httpAgent.delete(`/api/pairing/${pairedDeviceId}`).set("X-CSRF-Token", csrf).send();
    expect(revoked.status).toBe(200);
    await delay(250);
    expect([WebSocket.CLOSED, WebSocket.CLOSING]).toContain(reconnected.readyState);
    reconnected.close();
    const revokedDevice = await prisma.pairedDevice.findUnique({ where: { id: pairedDeviceId } });
    expect(revokedDevice).toMatchObject({ status: "REVOKED", connectionStatus: "DISCONNECTED" });
  }, 30_000);

  it("rejects unauthenticated malformed and oversized agent messages", async () => {
    const keys = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const pairing = await httpAgent.post("/api/pairing/request").set("X-CSRF-Token", csrf).send({ deviceName: "Protocol Test Agent", publicKey: keys.publicKey });
    const approved = await httpAgent.post(`/api/pairing/${pairing.body.data.id}/approve`).set("X-CSRF-Token", csrf).send();
    const protocolDeviceId = approved.body.data.paired.id as string;

    const unauthenticatedHeartbeat = new WebSocket(`${baseUrl}/api/agent-ws?pairedDeviceId=${protocolDeviceId}`);
    await nextMessage(unauthenticatedHeartbeat);
    const heartbeatClosed = new Promise<void>((resolve) => unauthenticatedHeartbeat.once("close", () => resolve()));
    unauthenticatedHeartbeat.send(JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() }));
    await Promise.race([heartbeatClosed, delay(200)]);
    expect([WebSocket.CLOSED, WebSocket.CLOSING]).toContain(unauthenticatedHeartbeat.readyState);
    unauthenticatedHeartbeat.close();

    const malformed = new WebSocket(`${baseUrl}/api/agent-ws?pairedDeviceId=${protocolDeviceId}`);
    await nextMessage(malformed);
    const malformedClosed = new Promise<void>((resolve) => malformed.once("close", () => resolve()));
    malformed.send("not-json");
    await Promise.race([malformedClosed, delay(200)]);
    expect([WebSocket.CLOSED, WebSocket.CLOSING]).toContain(malformed.readyState);
    malformed.close();

    const oversized = new WebSocket(`${baseUrl}/api/agent-ws?pairedDeviceId=${protocolDeviceId}`);
    await nextMessage(oversized);
    const oversizedClosed = new Promise<void>((resolve) => oversized.once("close", () => resolve()));
    oversized.send("x".repeat(16 * 1024 + 1));
    await Promise.race([oversizedClosed, delay(300)]);
    expect([WebSocket.CLOSED, WebSocket.CLOSING]).toContain(oversized.readyState);
    oversized.close();
  }, 15_000);
});
