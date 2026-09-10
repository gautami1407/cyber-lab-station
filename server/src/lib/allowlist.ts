import { lookup } from "node:dns/promises";
import net from "node:net";
import { Errors } from "../errors.js";
import { isAlwaysBlocked, ipv4ToInt, parseCidr } from "./ipv4.js";

export interface Allowlist {
  hosts: Set<string>;
  cidrs: { start: number; end: number }[];
  ips: Set<string>;
}

export function parseHostAllowlist(entries: string[]): Allowlist {
  const hosts = new Set<string>();
  const ips = new Set<string>();
  const cidrs: { start: number; end: number }[] = [];
  for (const raw of entries) {
    const item = raw.trim().toLowerCase();
    if (!item) continue;
    if (item.includes("/")) {
      const cidr = parseCidr(item);
      if (cidr) cidrs.push(cidr);
      continue;
    }
    if (net.isIPv4(item)) {
      ips.add(item);
      continue;
    }
    hosts.add(item);
  }
  return { hosts, cidrs, ips };
}

export function ipInAllowlist(ip: string, allowlist: Allowlist): boolean {
  if (isAlwaysBlocked(ip)) return false;
  if (allowlist.ips.has(ip)) return true;
  const value = ipv4ToInt(ip);
  if (value == null) return false;
  return allowlist.cidrs.some((range) => value >= range.start && value <= range.end);
}

export async function assertScanTargetAllowed(target: string, entries: string[]): Promise<{ host: string; ip: string }> {
  if (entries.length === 0) throw Errors.targetForbidden();
  const cleaned = target.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
  const host = cleaned.split(":")[0] ?? "";
  if (!host || host.includes("@") || host.includes(" ")) throw Errors.validation("Invalid target.");
  const allowlist = parseHostAllowlist(entries);

  let ip: string;
  if (net.isIPv4(host)) {
    ip = host;
  } else {
    if (!allowlist.hosts.has(host)) throw Errors.targetForbidden();
    try {
      const resolved = await lookup(host, { family: 4 });
      ip = resolved.address;
    } catch {
      throw Errors.validation("The target hostname could not be resolved.");
    }
  }

  const hostnameAllowed = allowlist.hosts.has(host);
  const ipAllowed = ipInAllowlist(ip, allowlist);
  if (!hostnameAllowed && !ipAllowed) throw Errors.targetForbidden();
  if (isAlwaysBlocked(ip)) throw Errors.targetForbidden();
  return { host, ip };
}

export function assertIpInAllowlist(ip: string, entries: string[]): void {
  if (entries.length === 0) throw Errors.targetForbidden();
  const allowlist = parseHostAllowlist(entries);
  if (!ipInAllowlist(ip, allowlist) && !allowlist.hosts.has(ip)) throw Errors.targetForbidden();
}

export function assertDomainAllowed(domain: string, allowed: string[]): string {
  if (allowed.length === 0) throw Errors.domainForbidden();
  const cleaned = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(cleaned) || cleaned.includes("..")) throw Errors.validation("Invalid domain.");
  const ok = allowed.some((entry) => cleaned === entry || cleaned.endsWith(`.${entry}`));
  if (!ok) throw Errors.domainForbidden();
  return cleaned;
}
