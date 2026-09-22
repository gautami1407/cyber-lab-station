import { createServer } from "node:http";
import request from "supertest";
import { createApp } from "./src/app.ts";
import { attachRealtime } from "./src/realtime.ts";
import { prisma } from "./src/prisma.ts";
import { generateKeyPairSync, createHash } from "node:crypto";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const server = createServer(createApp());
attachRealtime(server);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Server did not bind");
const port = address.port;
console.log("SERVER_PORT", port);

const base = request.agent(server);
const csrf = (await base.get("/api/csrf")).body.data.csrfToken;
const suffix = Date.now();
const user = await base.post("/api/auth/register").set("X-CSRF-Token", csrf).send({ username: `diag${suffix}`, email: `diag${suffix}@example.test`, password: "UniversityLab!2026", confirmPassword: "UniversityLab!2026" });
console.log("USER", user.status, user.body);

const keys = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const pair = await base.post("/api/pairing/request").set("X-CSRF-Token", csrf).send({ deviceName: "Diag Agent", publicKey: keys.publicKey });
console.log("PAIR", pair.status, pair.body);
const approved = await base.post(`/api/pairing/${pair.body.data.id}/approve`).set("X-CSRF-Token", csrf).send();
console.log("APPROVED", approved.status, approved.body);
const pairedDeviceId = approved.body.data.paired.id;

const statePath = "C:\\Users\\DELL\\AppData\\Local\\Temp\\netlink-live-agent-state.json";
const normalizedPublicKey = String(keys.publicKey).trim().replace(/\r\n/g, "\n");
const agentId = createHash("sha256").update(Buffer.from(normalizedPublicKey, "utf8")).digest("hex").slice(0, 24);
writeFileSync(statePath, JSON.stringify({ agentId, publicKey: normalizedPublicKey, privateKey: String(keys.privateKey).trim() }, null, 2));
console.log("STATE", { statePath, agentId });

const agentEntry = resolve(__dirname, "..", "agent", "dist", "index.js");
const child = spawn(process.execPath, [agentEntry], {
  env: { ...process.env, NETLINK_SERVER_URL: `ws://127.0.0.1:${port}`, NETLINK_PAIRED_DEVICE_ID: pairedDeviceId, NETLINK_AGENT_STATE: statePath },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (chunk) => console.log("[agent-out]", String(chunk)));
child.stderr.on("data", (chunk) => console.log("[agent-err]", String(chunk)));
child.on("exit", (code) => console.log("AGENT_EXIT", code));

for (let i = 0; i < 30; i += 1) {
  const db = await prisma.pairedDevice.findUnique({ where: { id: pairedDeviceId } });
  console.log("DB_CHECK", i, db?.connectionStatus, !!db?.publicKey);
  if (db?.connectionStatus === "CONNECTED") break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const session = await base.post("/api/remote/session").set("X-CSRF-Token", csrf).send({ pairedDeviceId });
console.log("SESSION", session.status, session.body);
const op = await base.post("/api/remote/operation").set("X-CSRF-Token", csrf).send({ pairedDeviceId, sessionId: session.body.data.id, operation: "SCREEN_CAPTURE" });
console.log("OP", op.status, op.body);

setTimeout(async () => {
  child.kill("SIGTERM");
  await prisma.user.delete({ where: { id: user.body.data.userId } }).catch(() => undefined);
  rmSync(dir, { recursive: true, force: true });
  server.close();
  process.exit(0);
}, 4000);
