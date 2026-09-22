import { createHash, generateKeyPairSync } from "node:crypto";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { attachRealtime, closeRealtime } from "./realtime.js";
import { prisma } from "./prisma.js";

const enabled = Boolean(process.env.DATABASE_URL);
const agentEntry = resolve(process.cwd(), "..", "agent", "dist", "index.js");
const supported = process.platform === "win32" && existsSync(agentEntry);
const wait = (ms: number) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

describe.skipIf(!enabled || !supported)("native screen capture integration", () => {
  let server: Server;
  let httpAgent: ReturnType<typeof request.agent>;
  let csrf = "";
  let userId = "";
  let child: ChildProcess | undefined;
  let tempDir = "";

  beforeAll(async () => {
    server = createServer(createApp());
    attachRealtime(server);
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Capture test server did not bind.");
    httpAgent = request.agent(server);
    csrf = (await httpAgent.get("/api/csrf")).body.data.csrfToken as string;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const registered = await httpAgent.post("/api/auth/register").set("X-CSRF-Token", csrf).send({ username: `screen${suffix}`, email: `screen${suffix}@example.test`, password: "UniversityLab!2026", confirmPassword: "UniversityLab!2026" });
    userId = registered.body.data.userId as string;
  });

  afterAll(async () => {
    child?.kill();
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    closeRealtime();
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("captures a real native PNG through the authenticated agent path", async () => {
    const keys = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    tempDir = mkdtempSync(join(tmpdir(), "netlink-screen-"));
    const statePath = join(tempDir, "identity.json");
    const normalizedPublicKey = String(keys.publicKey).trim().replace(/\r\n/g, "\n");
    const agentId = createHash("sha256").update(Buffer.from(normalizedPublicKey, "utf8")).digest("hex").slice(0, 24);
    writeFileSync(statePath, JSON.stringify({ agentId, publicKey: normalizedPublicKey, privateKey: String(keys.privateKey).trim() }));
    const pairing = await httpAgent.post("/api/pairing/request").set("X-CSRF-Token", csrf).send({ deviceName: "Native screen agent", publicKey: keys.publicKey });
    const approved = await httpAgent.post(`/api/pairing/${pairing.body.data.id}/approve`).set("X-CSRF-Token", csrf).send();
    const pairedDeviceId = approved.body.data.paired.id as string;
    const session = await httpAgent.post("/api/remote/session").set("X-CSRF-Token", csrf).send({ pairedDeviceId });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Capture server address unavailable.");
    child = spawn(process.execPath, [agentEntry], { env: { ...process.env, NETLINK_SERVER_URL: `ws://127.0.0.1:${address.port}`, NETLINK_PAIRED_DEVICE_ID: pairedDeviceId, NETLINK_AGENT_STATE: statePath }, stdio: "ignore" });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const paired = await prisma.pairedDevice.findUnique({ where: { id: pairedDeviceId } });
      if (paired?.connectionStatus === "CONNECTED") break;
      await wait(250);
    }
    const operationResponse = await httpAgent.post("/api/remote/operation").set("X-CSRF-Token", csrf).send({ pairedDeviceId, sessionId: session.body.data.id, operation: "SCREEN_CAPTURE" });
    expect(operationResponse.status).toBe(202);
    const operationId = operationResponse.body.data.id as string;
    let operation = await prisma.remoteOperation.findUnique({ where: { id: operationId } });
    for (let attempt = 0; attempt < 80 && operation?.status === "QUEUED"; attempt += 1) {
      await wait(250);
      operation = await prisma.remoteOperation.findUnique({ where: { id: operationId } });
    }
    expect(operation?.status).toBe("COMPLETED");
    expect(operation?.resultJson).toMatchObject({ format: "png" });
    const metadata = operation?.resultJson as { byteLength?: number; width?: number; height?: number };
    expect(metadata.byteLength).toBeGreaterThan(0);
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { userId, action: "SCREEN_CAPTURE_COMPLETED" } })).toBeGreaterThan(0);
  }, 35_000);
});
