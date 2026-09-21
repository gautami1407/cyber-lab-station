import net from "node:net";
import { describe, expect, it } from "vitest";
import { listLocalInterfaces } from "./network.js";
import { parseCidr } from "../lib/ipv4.js";

describe("local network discovery", () => {
  it("returns only valid IPv4 interface observations", () => {
    const interfaces = listLocalInterfaces();

    expect(Array.isArray(interfaces)).toBe(true);
    for (const item of interfaces) {
      expect(net.isIPv4(item.ipv4Address)).toBe(true);
      expect(parseCidr(item.cidr)).not.toBeNull();
      expect(item.name.length).toBeGreaterThan(0);
    }
  });
});