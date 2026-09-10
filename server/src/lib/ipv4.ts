import net from "node:net";

export function ipv4ToInt(ip: string): number | null {
  if (!net.isIPv4(ip)) return null;
  const parts = ip.split(".").map(Number);
  if (parts.some((part) => part < 0 || part > 255)) return null;
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

export function intToIpv4(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

export function parseCidr(cidr: string): { start: number; end: number } | null {
  const [ip, bitsRaw] = cidr.split("/");
  if (!ip || !bitsRaw) return null;
  const bits = Number(bitsRaw);
  const base = ipv4ToInt(ip);
  if (base == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
  const start = (base & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  return { start, end };
}

export function expandIpv4Range(startIp: string, endIp: string, maxHosts: number): string[] {
  const start = ipv4ToInt(startIp);
  const end = ipv4ToInt(endIp);
  if (start == null || end == null || end < start) {
    throw new Error("Invalid IPv4 range.");
  }
  const count = end - start + 1;
  if (count > maxHosts) {
    throw new Error(`Range exceeds MAX_HOSTS_PER_SCAN (${maxHosts}).`);
  }
  const hosts: string[] = [];
  for (let value = start; value <= end; value += 1) hosts.push(intToIpv4(value));
  return hosts;
}

const BLOCKED = new Set(["169.254.169.254", "0.0.0.0", "255.255.255.255"]);

export function isAlwaysBlocked(ip: string): boolean {
  return BLOCKED.has(ip);
}
