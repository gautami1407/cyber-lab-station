import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadOrCreateIdentity } from "./identity.js";

describe("agent identity", () => {
  it("creates a first identity and reuses the same state on restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlink-agent-"));
    const path = join(directory, "identity.json");
    const first = loadOrCreateIdentity(path);
    const second = loadOrCreateIdentity(path);

    expect(second).toEqual(first);
    expect(first.privateKey).not.toContain(first.publicKey);
    expect(JSON.parse(await readFile(path, "utf8")).privateKey).toBe(first.privateKey);

    const derivedPublicKey = createPublicKey(createPrivateKey({ key: first.privateKey, format: "pem", type: "pkcs8" })).export({ format: "pem", type: "spki" }).toString("utf8").trim();
    expect(derivedPublicKey).toBe(first.publicKey.trim());
    expect(first.agentId).toBe(createHash("sha256").update(Buffer.from(first.publicKey, "utf8")).digest("hex").slice(0, 24));
  });

  it("rejects malformed persisted identity data without replacing it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlink-agent-"));
    const path = join(directory, "identity.json");
    const valid = loadOrCreateIdentity(path);
    await writeFile(path, JSON.stringify({ publicKey: "only-public" }));

    expect(() => loadOrCreateIdentity(path)).toThrow("Malformed agent identity.");
    expect(JSON.parse(await readFile(path, "utf8")).publicKey).toBe("only-public");
    expect(valid.publicKey).toBeTruthy();
  });

  it("rejects a state file whose public key does not match the stored private key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlink-agent-"));
    const path = join(directory, "identity.json");
    const valid = loadOrCreateIdentity(path);
    const corrupted = valid.privateKey.slice(0, -1) + "X";
    await writeFile(path, JSON.stringify({
      agentId: valid.agentId,
      publicKey: valid.publicKey,
      privateKey: corrupted,
    }));

    expect(() => loadOrCreateIdentity(path)).toThrow("Malformed agent identity.");
  });
});