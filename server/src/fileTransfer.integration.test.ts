import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createServer, type Server } from "node:http";
import request from "supertest";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";
import { attachRealtime, closeRealtime } from "./realtime.js";

const enabled = Boolean(process.env.DATABASE_URL);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function nextMessage(socket: WebSocket) {
  return new Promise<Record<string, any>>((resolve, reject) => {
    const onMessage = (raw: Buffer) => {
      socket.off("error", onError);
      resolve(JSON.parse(String(raw)) as Record<string, any>);
    };
    const onError = (error: Error) => {
      socket.off("message", onMessage);
      reject(error);
    };
    socket.once("message", onMessage);
    socket.once("error", onError);
  });
}

describe.skipIf(!enabled)("file transfer integration", () => {
  let server: Server;
  let httpAgent: ReturnType<typeof request.agent>;
  let csrf = "";
  let userId = "";
  let pairedDeviceId = "";
  let sessionId = "";
  let socket: WebSocket;

  beforeAll(async () => {
    const app = createApp();
    server = createServer(app);
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    httpAgent = request.agent(server);
    csrf = (await httpAgent.get("/api/csrf")).body.data.csrfToken as string;
    const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const created = await httpAgent.post("/api/auth/register").set("X-CSRF-Token", csrf).send({
      username: `ft${suffix}`,
      email: `ft${suffix}@example.test`,
      password: "UniversityLab!2026",
      confirmPassword: "UniversityLab!2026",
    });
    userId = created.body.data.userId as string;

    const keys = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    const pairing = await httpAgent.post("/api/pairing/request").set("X-CSRF-Token", csrf).send({ deviceName: "File Transfer Agent", publicKey: keys.publicKey });
    const pairId = pairing.body.data.id as string;
    const approved = await httpAgent.post(`/api/pairing/${pairId}/approve`).set("X-CSRF-Token", csrf).send();
    pairedDeviceId = approved.body.data.paired.id as string;
    const session = await httpAgent.post("/api/remote/session").set("X-CSRF-Token", csrf).send({ pairedDeviceId });
    sessionId = session.body.data.id as string;

    socket = new WebSocket(`ws://127.0.0.1:${(server.address() as any).port}/api/agent-ws?pairedDeviceId=${pairedDeviceId}`);
    const challenge = await nextMessage(socket);
    expect(challenge.type).toBe("AGENT_CHALLENGE");
    socket.send(JSON.stringify({ type: "AGENT_AUTH", publicKey: keys.publicKey, signature: sign(null, Buffer.from(String(challenge.nonce)), keys.privateKey).toString("base64") }));
    expect((await nextMessage(socket)).type).toBe("AGENT_AUTHENTICATED");

    socket.send(JSON.stringify({ type: "HEARTBEAT", timestamp: new Date().toISOString() }));
    expect((await nextMessage(socket)).type).toBe("HEARTBEAT_ACK");
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    socket?.close();
    closeRealtime();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("uploads, downloads, verifies checksums, and rejects traversal attempts", async () => {
    const original = Buffer.from("NetLink file transfer payload\nabc123\n", "utf8");
    const pendingMessages: Record<string, any>[] = [];
    const listener = (raw: Buffer) => pendingMessages.push(JSON.parse(String(raw)));
    socket.on("message", listener);

    const upload = await httpAgent.post("/api/file-transfer/upload").set("X-CSRF-Token", csrf).send({
      pairedDeviceId,
      sessionId,
      fileName: "payload.txt",
      contentBase64: original.toString("base64"),
    });
    expect(upload.status).toBe(202);

    const fileStart = pendingMessages.find((message) => message.type === "FILE_PUSH_START");
    expect(fileStart).toBeTruthy();
    const operationId = String(fileStart!.operationId);
    const transferId = String(fileStart!.transferId);

    const fileChunks = pendingMessages.filter((message) => message.type === "FILE_PUSH_CHUNK");
    const reconstructed = Buffer.concat(fileChunks.map((message) => Buffer.from(String(message.data), "base64")));
    expect(Buffer.compare(reconstructed, original)).toBe(0);
    expect(pendingMessages.some((message) => message.type === "FILE_PUSH_END")).toBe(true);
    socket.off("message", listener);

    socket.send(JSON.stringify({ type: "REMOTE_RESULT", operationId, status: "COMPLETED", data: { sha256: createHash("sha256").update(original).digest("hex"), sizeBytes: original.length } }));

    const uploadPollDeadline = Date.now() + 15000;
    let persisted = null as Awaited<ReturnType<typeof prisma.fileTransfer.findUnique>> | null;
    while (Date.now() < uploadPollDeadline) {
      persisted = await prisma.fileTransfer.findUnique({ where: { id: transferId } });
      if (persisted?.status === "COMPLETED") break;
      await delay(100);
    }
    expect(persisted?.status).toBe("COMPLETED");
    expect(persisted?.sha256).toBe(createHash("sha256").update(original).digest("hex"));

    const downloaded = Buffer.from("agent-downloaded\nchecksum-check\n", "utf8");
    const socketMessages: Record<string, any>[] = [];
    const downloadListener = (raw: Buffer) => socketMessages.push(JSON.parse(String(raw)));
    socket.on("message", downloadListener);
    const download = await httpAgent.post("/api/file-transfer/download").set("X-CSRF-Token", csrf).send({
      pairedDeviceId,
      sessionId,
      path: "downloads/report.bin",
    });
    expect(download.status).toBe(202);
    const downloadRequest = socketMessages.find((message) => message.type === "REMOTE_OPERATION");
    expect(downloadRequest).toBeTruthy();
    const downloadOperationId = String(downloadRequest!.operationId);
    const downloadTransferId = String((downloadRequest!.data as Record<string, unknown>).transferId);
    socket.off("message", downloadListener);
    const downloadStart = { type: "FILE_START", transferId: downloadTransferId, operationId: downloadOperationId, safeName: "report.bin", byteLength: downloaded.length, totalChunks: 1 };
    socket.send(JSON.stringify(downloadStart));
    socket.send(JSON.stringify({ type: "FILE_CHUNK", transferId: downloadTransferId, operationId: downloadOperationId, sequence: 0, data: downloaded.toString("base64") }));
    socket.send(JSON.stringify({
      type: "FILE_END",
      transferId: downloadTransferId,
      operationId: downloadOperationId,
      metadata: { sha256: createHash("sha256").update(downloaded).digest("hex") },
    }));

    const filePollDeadline = Date.now() + 15000;
    let completedTransfer = null as Awaited<ReturnType<typeof prisma.fileTransfer.findUnique>> | null;
    while (Date.now() < filePollDeadline) {
      completedTransfer = await prisma.fileTransfer.findUnique({ where: { id: downloadTransferId } });
      if (completedTransfer?.status === "COMPLETED") break;
      await delay(100);
    }
    expect(completedTransfer?.status).toBe("COMPLETED");

    const result = await httpAgent.get(`/api/file-transfer/${downloadTransferId}/content`);
    expect(result.status).toBe(200);
    expect(Buffer.compare(Buffer.from(result.body), downloaded)).toBe(0);
    expect(result.headers["x-sha256"]).toBe(createHash("sha256").update(downloaded).digest("hex"));

    const invalidPath = await httpAgent.post("/api/file-transfer/download").set("X-CSRF-Token", csrf).send({
      pairedDeviceId,
      sessionId,
      path: "../etc/passwd",
    });
    expect(invalidPath.status).toBe(400);

    const encodedPath = await httpAgent.post("/api/file-transfer/download").set("X-CSRF-Token", csrf).send({
      pairedDeviceId,
      sessionId,
      path: "%2e%2e/%2e%2e/etc/passwd",
    });
    expect(encodedPath.status).toBe(400);

    const absolute = await httpAgent.post("/api/file-transfer/download").set("X-CSRF-Token", csrf).send({
      pairedDeviceId,
      sessionId,
      path: "/etc/passwd",
    });
    expect(absolute.status).toBe(400);
  }, 30_000);
});
