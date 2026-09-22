import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type AgentIdentity = { agentId: string; publicKey: string; privateKey: string };

function normalizePublicKey(publicKey: string): string {
  return publicKey.trim().replace(/\r\n/g, "\n");
}

function derivePublicKeyFromPrivateKey(privateKey: string): string {
  const key = createPrivateKey({ key: privateKey, format: "pem", type: "pkcs8" });
  return createPublicKey(key).export({ format: "pem", type: "spki" }).toString("utf8").trim();
}

function validateIdentity(value: Partial<AgentIdentity>): value is AgentIdentity {
  if (!value || typeof value !== "object") return false;
  if (typeof value.agentId !== "string" || value.agentId.length === 0) return false;
  if (typeof value.publicKey !== "string" || value.publicKey.length === 0) return false;
  if (typeof value.privateKey !== "string" || value.privateKey.length === 0) return false;

  try {
    const normalizedPublicKey = normalizePublicKey(value.publicKey);
    const derivedPublicKey = derivePublicKeyFromPrivateKey(value.privateKey);
    if (normalizePublicKey(derivedPublicKey) !== normalizedPublicKey) return false;

    const expectedAgentId = createHash("sha256").update(Buffer.from(normalizedPublicKey, "utf8")).digest("hex").slice(0, 24);
    return value.agentId === expectedAgentId;
  } catch {
    return false;
  }
}

export function loadOrCreateIdentity(path: string): AgentIdentity {
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8");
    const value = JSON.parse(raw) as Partial<AgentIdentity>;
    if (!validateIdentity(value)) throw new Error("Malformed agent identity.");
    return {
      agentId: value.agentId,
      publicKey: normalizePublicKey(value.publicKey),
      privateKey: value.privateKey.trim(),
    };
  }

  const keys = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const publicKey = normalizePublicKey(String(keys.publicKey));
  const privateKey = String(keys.privateKey).trim();
  const identity: AgentIdentity = {
    agentId: createHash("sha256").update(Buffer.from(publicKey, "utf8")).digest("hex").slice(0, 24),
    publicKey,
    privateKey,
  };

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(identity, null, 2), { mode: 0o600, flag: "wx" });
  return identity;
}
