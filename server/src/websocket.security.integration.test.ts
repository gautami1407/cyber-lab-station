import { generateKeyPairSync, sign } from "node:crypto";
import { createServer, type Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createApp } from "./app.js";
import { attachRealtime, cleanupStaleAgents, closeRealtime } from "./realtime.js";
import { prisma } from "./prisma.js";

const enabled = Boolean(process.env.DATABASE_URL);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type TestKeys = { publicKey: string; privateKey: string };

async function message(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: Buffer) => { socket.off("error", onError); resolve(JSON.parse(String(raw)) as Record<string, unknown>); };
    const onError = (error: Error) => { socket.off("message", onMessage); reject(error); };
    socket.once("message", onMessage);
    socket.once("error", onError);
  });
}

async function closed(socket: WebSocket, timeout = 2000) {
  if (socket.readyState === WebSocket.CLOSED) return;
  await Promise.race([new Promise<void>((resolve) => socket.once("close", () => resolve())), wait(timeout)]);
  expect([WebSocket.CLOSED, WebSocket.CLOSING]).toContain(socket.readyState);
  socket.close();
}

describe.skipIf(!enabled)("WebSocket protocol security", () => {
  let server: Server;
  let wsBase = "";
  let httpAgent: ReturnType<typeof request.agent>;
  let csrf = "";
  let userId = "";
  let browserCookie = "";

  beforeAll(async () => {
    server = createServer(createApp());
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind.");
    wsBase = `ws://127.0.0.1:${address.port}`;
    httpAgent = request.agent(server);
    csrf = (await httpAgent.get("/api/csrf")).body.data.csrfToken as string;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const registered = await httpAgent.post("/api/auth/register").set("X-CSRF-Token", csrf).send({ username: `wstest${suffix}`, email: `wstest${suffix}@example.test`, password: "UniversityLab!2026", confirmPassword: "UniversityLab!2026" });
    userId = registered.body.data.userId as string;
    browserCookie = ((registered.headers["set-cookie"] as unknown as string[])[0] ?? "").split(";")[0]!;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    closeRealtime();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function pair() {
    const keys = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const pairing = await httpAgent.post("/api/pairing/request").set("X-CSRF-Token", csrf).send({ deviceName: "Protocol test agent", publicKey: keys.publicKey });
    const approved = await httpAgent.post(`/api/pairing/${pairing.body.data.id}/approve`).set("X-CSRF-Token", csrf).send();
    return { keys: keys as unknown as TestKeys, pairedDeviceId: approved.body.data.paired.id as string };
  }

  async function pairFor(agent: ReturnType<typeof request.agent>, token: string, publicKey: string, name: string) {
    const pairing = await agent.post("/api/pairing/request").set("X-CSRF-Token", token).send({ deviceName: name, publicKey });
    const approved = await agent.post(`/api/pairing/${pairing.body.data.id}/approve`).set("X-CSRF-Token", token).send();
    return approved.body.data.paired.id as string;
  }

  async function connect(pairedDeviceId: string) {
    const socket = new WebSocket(`${wsBase}/api/agent-ws?pairedDeviceId=${pairedDeviceId}`);
    const challenge = await message(socket);
    expect(challenge.type).toBe("AGENT_CHALLENGE");
    return { socket, nonce: String(challenge.nonce) };
  }

  async function authenticate(socket: WebSocket, nonce: string, keys: TestKeys) {
    const publicKey = keys.publicKey;
    const privateKey = keys.privateKey;
    socket.send(JSON.stringify({ type: "AGENT_AUTH", publicKey, signature: sign(null, Buffer.from(nonce), privateKey).toString("base64") }));
    expect((await message(socket)).type).toBe("AGENT_AUTHENTICATED");
  }

  it("rejects malformed pre-auth protocol messages deterministically", async () => {
    const payloads = ["", "not-json", "null", "[]", '"hello"', "123", "true", "false", "{}", '{"timestamp":"x"}', '{"type":"UNKNOWN"}', '{"type":123}'];
    for (const payload of payloads) {
      const { pairedDeviceId } = await pair();
      const { socket } = await connect(pairedDeviceId);
      socket.send(payload);
      await closed(socket);
    }
    expect(await prisma.remoteOperation.count({ where: { userId } })).toBe(0);
  }, 30_000);

  it("rejects invalid heartbeat variants without mutating operations", async () => {
    const { keys, pairedDeviceId } = await pair();
    const { socket, nonce } = await connect(pairedDeviceId);
    await authenticate(socket, nonce, keys);
    const payloads = [
      { type: "HEARTBEAT" },
      { type: "HEARTBEAT", timestamp: 123 },
      { type: "HEARTBEAT", timestamp: "not-a-date" },
      { type: "HEARTBEAT", timestamp: new Date(Date.now() + 120_000).toISOString() },
      { type: "HEARTBEAT", timestamp: new Date(Date.now() - 120_000).toISOString() },
    ];
    for (const payload of payloads) {
      socket.send(JSON.stringify(payload));
      expect(await message(socket)).toMatchObject({ type: "HEARTBEAT_ACK", accepted: false });
    }
    socket.close();
    expect(await prisma.remoteOperation.count({ where: { userId } })).toBe(0);
  }, 15_000);

  it("rejects malformed operation results and oversized frames", async () => {
    const first = await pair();
    const firstConnection = await connect(first.pairedDeviceId);
    await authenticate(firstConnection.socket, firstConnection.nonce, first.keys);
    firstConnection.socket.send(JSON.stringify({ type: "REMOTE_RESULT" }));
    await closed(firstConnection.socket);

    const second = await pair();
    const secondConnection = await connect(second.pairedDeviceId);
    const oversized = new Promise<void>((resolve) => secondConnection.socket.once("close", () => resolve()));
    secondConnection.socket.send("x".repeat(16 * 1024 + 1));
    await Promise.race([oversized, wait(2000)]);
    expect([WebSocket.CLOSED, WebSocket.CLOSING]).toContain(secondConnection.socket.readyState);
    secondConnection.socket.close();
  }, 15_000);

  it("rejects missing, malformed, and wrong-key authentication payloads", async () => {
    const cases: Array<"missing" | "malformed" | "wrong-key"> = ["missing", "malformed", "wrong-key"];
    for (const kind of cases) {
      const expected = await pair();
      const connection = await connect(expected.pairedDeviceId);
      const other = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
      const publicKey = kind === "wrong-key" ? other.publicKey : expected.keys.publicKey;
      const signature = kind === "missing" ? undefined : kind === "malformed" ? "not-a-signature" : sign(null, Buffer.from(connection.nonce), other.privateKey).toString("base64");
      connection.socket.send(JSON.stringify({ type: "AGENT_AUTH", publicKey, ...(signature ? { signature } : {}) }));
      await closed(connection.socket);
    }
  }, 15_000);

  it("keeps browser and agent socket authentication separate", async () => {
    const pairedResult = await pair();
    const paired = pairedResult.pairedDeviceId;
    const browserOnAgent = new WebSocket(`${wsBase}/api/agent-ws?pairedDeviceId=${paired}`, { headers: { Cookie: browserCookie } });
    await message(browserOnAgent);
    browserOnAgent.send(JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() }));
    await closed(browserOnAgent);
    const stateAfterBrowser = await prisma.pairedDevice.findUnique({ where: { id: paired } });
    expect(stateAfterBrowser?.connectionStatus).toBe("DISCONNECTED");

    const agentOnBrowser = new WebSocket(`${wsBase}/api/ws`);
    await new Promise<void>((resolve) => agentOnBrowser.once("unexpected-response", (_request, response) => { response.resume(); resolve(); }));

    const browser = new WebSocket(`${wsBase}/api/ws`, { headers: { Cookie: browserCookie } });
    expect(await message(browser)).toMatchObject({ type: "CONNECTED", data: { userId } });
    browser.close();

    const valid = await connect(paired);
    valid.socket.send(JSON.stringify({ type: "AGENT_AUTH", publicKey: pairedResult.keys.publicKey, signature: sign(null, Buffer.from(valid.nonce), pairedResult.keys.privateKey).toString("base64") }));
    expect((await message(valid.socket)).type).toBe("AGENT_AUTHENTICATED");
    valid.socket.close();
    await httpAgent.delete(`/api/pairing/${paired}`).set("X-CSRF-Token", csrf).send();
    expect(await prisma.auditLog.count({ where: { userId, action: "PAIRING_REVOKED" } })).toBeGreaterThan(0);
  }, 15_000);

  it("isolates two authenticated agents and records lifecycle audits", async () => {
    const second = request.agent(server);
    const secondCsrf = (await second.get("/api/csrf")).body.data.csrfToken as string;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const registered = await second.post("/api/auth/register").set("X-CSRF-Token", secondCsrf).send({ username: `wsuserb${suffix}`, email: `wsuserb${suffix}@example.test`, password: "UniversityLab!2026", confirmPassword: "UniversityLab!2026" });
    const secondUserId = registered.body.data.userId as string;
    const keysA = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const keysB = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const deviceA = await pairFor(httpAgent, csrf, keysA.publicKey as unknown as string, "Agent A");
    const deviceB = await pairFor(second, secondCsrf, keysB.publicKey as unknown as string, "Agent B");
    const agentA = await connect(deviceA);
    const agentB = await connect(deviceB);
    await authenticate(agentA.socket, agentA.nonce, keysA as never);
    await authenticate(agentB.socket, agentB.nonce, keysB as never);
    agentA.socket.send(JSON.stringify({ type: "HEARTBEAT", deviceId: deviceB, timestamp: new Date().toISOString() }));
    expect(await message(agentA.socket)).toMatchObject({ type: "HEARTBEAT_ACK", accepted: true });
    const states = await prisma.pairedDevice.findMany({ where: { id: { in: [deviceA, deviceB] } } });
    expect(states.find((item) => item.id === deviceA)?.connectionStatus).toBe("CONNECTED");
    expect(states.find((item) => item.id === deviceB)?.lastHeartbeat).toBeNull();
    const operation = await prisma.remoteOperation.create({ data: { userId: secondUserId, pairedDeviceId: deviceB, operation: "GET_SYSTEM_INFO", status: "QUEUED" } });
    agentA.socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId: operation.id, status: "COMPLETED", data: { spoofed: true } }));
    await closed(agentA.socket);
    const unchanged = await prisma.remoteOperation.findUnique({ where: { id: operation.id } });
    expect(unchanged?.status).toBe("QUEUED");
    await cleanupStaleAgents(Date.now() + 60_000);
    const failed = await prisma.remoteOperation.findUnique({ where: { id: operation.id } });
    expect(failed?.status).toBe("FAILED");
    expect(await prisma.auditLog.count({ where: { userId: secondUserId, action: "AGENT_HEARTBEAT_TIMEOUT" } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { userId: secondUserId, action: "REMOTE_OPERATION_FAILED" } })).toBeGreaterThan(0);
    await prisma.user.delete({ where: { id: secondUserId } });
    agentB.socket.close();
    expect(await prisma.auditLog.count({ where: { userId, action: "AGENT_DISCONNECTED" } })).toBeGreaterThan(0);
  }, 20_000);
});
