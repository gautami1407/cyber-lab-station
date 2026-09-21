import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type AgentIdentity = { agentId: string; publicKey: string; privateKey: string };

export function loadOrCreateIdentity(path: string): AgentIdentity {
  if (existsSync(path)) {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<AgentIdentity>;
    if (!value.agentId || !value.publicKey || !value.privateKey) throw new Error("Malformed agent identity.");
    return { agentId: value.agentId, publicKey: value.publicKey, privateKey: value.privateKey };
  }
  const keys = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const identity = { agentId: createHash("sha256").update(keys.publicKey).digest("hex").slice(0, 24), publicKey: keys.publicKey, privateKey: keys.privateKey };
  writeFileSync(path, JSON.stringify(identity, null, 2), { mode: 0o600 });
  return identity;
}
