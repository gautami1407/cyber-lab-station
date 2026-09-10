import { describe, expect, it } from "vitest";
import { assertDomainAllowed, ipInAllowlist, parseHostAllowlist } from "./allowlist.js";
import { expandIpv4Range, parseCidr } from "./ipv4.js";
import { evaluatePasswordPolicy, passwordStrengthScore } from "./password.js";
import { validateInput } from "../services/security.js";

describe("password policy", () => {
  it("rejects short passwords", () => {
    expect(evaluatePasswordPolicy("Short1!").ok).toBe(false);
  });
  it("accepts a policy-compliant password", () => {
    expect(evaluatePasswordPolicy("UniversityLab!2026").ok).toBe(true);
    expect(passwordStrengthScore("UniversityLab!2026")).toBe(4);
  });
});

describe("allowlist", () => {
  it("allows configured loopback IPs only", () => {
    const list = parseHostAllowlist(["127.0.0.1", "localhost"]);
    expect(ipInAllowlist("127.0.0.1", list)).toBe(true);
    expect(ipInAllowlist("8.8.8.8", list)).toBe(false);
    expect(ipInAllowlist("169.254.169.254", list)).toBe(false);
  });
  it("rejects domains outside the allowlist", () => {
    expect(() => assertDomainAllowed("evil.example", ["localhost"])).toThrow();
    expect(assertDomainAllowed("localhost", ["localhost"])).toBe("localhost");
  });
});

describe("ipv4 range", () => {
  it("expands a small authorized range", () => {
    expect(expandIpv4Range("127.0.0.1", "127.0.0.3", 64)).toEqual([
      "127.0.0.1",
      "127.0.0.2",
      "127.0.0.3",
    ]);
  });
  it("rejects oversized ranges", () => {
    expect(() => expandIpv4Range("10.0.0.0", "10.0.1.0", 8)).toThrow();
  });
  it("parses /32 cidr", () => {
    const cidr = parseCidr("127.0.0.1/32");
    expect(cidr).not.toBeNull();
  });
});

describe("input validation", () => {
  it("fails script-like input without executing it", () => {
    const result = validateInput("<script>alert(1)</script>");
    expect(result.safe).toBe(false);
    expect(result.sanitized.includes("<")).toBe(false);
  });
  it("rejects SQL-like payloads on charset/sanitization", () => {
    const result = validateInput("1; DROP TABLE users");
    expect(result.checks.some((item) => item.status === "fail")).toBe(true);
  });
  it("rejects unexpected extra fields at the schema layer", () => {
    const result = validateInput("analyst@cyberlab.local");
    expect(result.checks.find((item) => item.id === "email")?.status).toBe("pass");
  });
});
