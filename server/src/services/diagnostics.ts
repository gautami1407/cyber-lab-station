import { execFile } from "node:child_process";
import { lookup, reverse } from "node:dns/promises";
import net from "node:net";
import { promisify } from "node:util";
import { Errors } from "../errors.js";
import { ipv4ToInt, parseCidr } from "../lib/ipv4.js";
import { prisma } from "../prisma.js";

const execFileAsync = promisify(execFile);

async function authorizedNetwork(userId: string, target: string) {
  const ip = net.isIPv4(target) ? target : (await lookup(target, { family: 4 })).address;
  const value = ipv4ToInt(ip);
  if (value == null) throw Errors.validation("Only IPv4 diagnostic targets are supported.");
  const networks = await prisma.authorizedNetwork.findMany({ where: { userId, status: "AUTHORIZED" } });
  const allowed = networks.some((network) => {
    const range = parseCidr(network.cidr);
    return range != null && value >= range.start && value <= range.end;
  });
  if (!allowed) throw Errors.targetForbidden();
  return ip;
}

export async function ping(userId: string, target: string, count = 4) {
  const ip = await authorizedNetwork(userId, target);
  const safeCount = Math.min(Math.max(Math.trunc(count), 1), 10);
  const timeout = 2000;
  const args = process.platform === "win32" ? ["-n", String(safeCount), "-w", String(timeout), ip] : ["-c", String(safeCount), "-W", "2", ip];
  const started = Date.now();
  try {
    const result = await execFileAsync(process.platform === "win32" ? "ping.exe" : "ping", args, { timeout: 15_000, windowsHide: true });
    const output = `${result.stdout}\n${result.stderr}`;
    const times = [...output.matchAll(/(?:time|Zeit)[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/gi)].map((match) => Number(match[1]!.replace(",", ".")));
    return { target, ip, reachable: true, packetsSent: safeCount, packetsReceived: times.length || safeCount, packetLossPercent: times.length ? Math.round((1 - times.length / safeCount) * 100) : 0, latencyMs: times[0] ?? Date.now() - started, raw: output.slice(0, 4000) };
  } catch (error) {
    const output = typeof error === "object" && error != null && "stdout" in error ? String(error.stdout) : "";
    return { target, ip, reachable: false, packetsSent: safeCount, packetsReceived: 0, packetLossPercent: 100, latencyMs: null, raw: output.slice(0, 4000) };
  }
}

export async function dnsResolve(userId: string, target: string) {
  const ipTarget = net.isIPv4(target);
  if (ipTarget) {
    await authorizedNetwork(userId, target);
    let hostnames: string[] = [];
    try {
      hostnames = await reverse(target);
    } catch {
      hostnames = [];
    }
    return { query: target, addresses: [target], hostnames };
  }
  const result = await lookup(target, { all: true, verbatim: true });
  const addresses = result.map((item) => item.address).filter((address) => net.isIPv4(address));
  for (const address of addresses) await authorizedNetwork(userId, address);
  return { query: target, addresses, hostnames: [] };
}

export async function traceroute(userId: string, target: string) {
  const ip = await authorizedNetwork(userId, target);
  const command = process.platform === "win32" ? "tracert.exe" : process.platform === "darwin" ? "traceroute" : "traceroute";
  const args = process.platform === "win32" ? ["-d", "-h", "12", "-w", "1000", ip] : ["-m", "12", "-w", "1", ip];
  try {
    const result = await execFileAsync(command, args, { timeout: 20_000, windowsHide: true });
    return { target, ip, supported: true, output: `${result.stdout}\n${result.stderr}`.slice(0, 8000) };
  } catch (error) {
    const code = typeof error === "object" && error != null && "code" in error ? String(error.code) : "UNKNOWN";
    if (code === "ENOENT") return { target, ip, supported: false, output: "Traceroute is not installed on this host." };
    const output = typeof error === "object" && error != null && "stdout" in error ? String(error.stdout) : "Traceroute failed.";
    return { target, ip, supported: true, output: output.slice(0, 8000) };
  }
}

export async function latency(userId: string, target: string, samples = 4) {
  const safeSamples = Math.min(Math.max(Math.trunc(samples), 1), 10);
  const measurements: Array<number | null> = [];
  for (let index = 0; index < safeSamples; index += 1) measurements.push((await ping(userId, target, 1)).latencyMs);
  const valid = measurements.filter((value): value is number => value != null);
  return {
    target,
    samples: measurements,
    currentMs: valid.at(-1) ?? null,
    minimumMs: valid.length ? Math.min(...valid) : null,
    maximumMs: valid.length ? Math.max(...valid) : null,
    averageMs: valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null,
    packetLossPercent: Math.round((1 - valid.length / safeSamples) * 100),
  };
}