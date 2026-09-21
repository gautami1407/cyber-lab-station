import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadOrCreateIdentity } from "./identity.js";

describe("agent identity", () => {
  it("generates, persists, and reloads an Ed25519 identity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlink-agent-"));
    const path = join(directory, "identity.json");
    const first = loadOrCreateIdentity(path);
    const second = loadOrCreateIdentity(path);
    expect(second).toEqual(first);
    expect(first.privateKey).not.toContain(first.publicKey);
    expect(JSON.parse(await readFile(path, "utf8")).privateKey).toBe(first.privateKey);
  });

  it("rejects malformed persisted identity data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "netlink-agent-"));
    const path = join(directory, "identity.json");
    await writeFile(path, JSON.stringify({ publicKey: "only-public" }));
    expect(() => loadOrCreateIdentity(path)).toThrow("Malformed agent identity.");
  });
});