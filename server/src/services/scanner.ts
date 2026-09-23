import type { Prisma } from "@prisma/client";
import { config } from "../config.js";
import { Errors } from "../errors.js";
import { assertIpInAllowlist, assertScanTargetAllowed } from "../lib/allowlist.js";
import { expandIpv4Range, ipv4ToInt, parseCidr } from "../lib/ipv4.js";
import { COMMON_PORTS, WEB_PORTS, conservativeServiceName, tcpConnect } from "../lib/tcp.js";
import { audit } from "./audit.js";
import { prisma } from "../prisma.js";
import { calculateRisk } from "./risk.js";
import {
  createOperation,
  finishOperation,
  markRunning,
  updateProgress,
  wasCancelled,
} from "./operations.js";

function mapPorts(profile: string, startPort: number, endPort: number): number[] {
  if (startPort < 1 || endPort > 65535 || startPort > endPort) throw Errors.validation("Invalid port range.");
  const span = endPort - startPort + 1;
  let ports: number[];
  if (profile === "common") ports = COMMON_PORTS.filter((port) => port >= startPort && port <= endPort);
  else if (profile === "web") ports = WEB_PORTS.filter((port) => port >= startPort && port <= endPort);
  else ports = Array.from({ length: span }, (_, i) => startPort + i);
  if (ports.length === 0) throw Errors.validation("No ports in range for the selected profile.");
  if (ports.length > config.maxPortsPerScan) {
    throw Errors.validation(`Port count exceeds MAX_PORTS_PER_SCAN (${config.maxPortsPerScan}).`);
  }
  return ports;
}

async function poolMap<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Verifies that the resolved target IP is inside at least one AuthorizedNetwork
 * owned by the requesting user. Authorization is personal: another user's
 * authorization (or the global ALLOWED_SCAN_TARGETS allowlist) is never enough.
 */
async function assertTargetAuthorizedForUser(userId: string, targetIp: string) {
  const value = ipv4ToInt(targetIp);
  if (value == null) throw Errors.validation("Invalid target IP.");
  const networks = await prisma.authorizedNetwork.findMany({
    where: { userId, status: "AUTHORIZED" },
    select: { cidr: true },
  });
  const covered = networks.some((network) => {
    const range = parseCidr(network.cidr);
    return range != null && value >= range.start && value <= range.end;
  });
  if (!covered) throw Errors.targetUnauthorized();
}

export async function startPortScan(params: {
  userId: string;
  ip: string;
  target: string;
  startPort: number;
  endPort: number;
  profile: string;
  authorized: boolean;
}) {
  if (!params.authorized) throw Errors.confirmation();
  const resolved = await assertScanTargetAllowed(params.target, config.allowedScanTargets);
  await assertTargetAuthorizedForUser(params.userId, resolved.ip);
  const ports = mapPorts(params.profile, params.startPort, params.endPort);
  // When the target is a device the user already owns, persist Scan / ScanResult
  // / Service observations and update the device risk once the scan completes.
  const device = await prisma.device.findFirst({
    where: { userId: params.userId, ipAddress: resolved.ip },
    select: { id: true },
  });
  const scan = device
    ? await prisma.scan.create({
        data: { userId: params.userId, deviceId: device.id, target: resolved.ip, status: "QUEUED" },
      })
    : null;
  const op = await createOperation({
    userId: params.userId,
    type: "PORT_SCAN",
    project: "Port Scanner",
    operation: `Port scan (${params.profile})`,
    target: resolved.host,
    total: ports.length,
  });
  await audit({
    userId: params.userId,
    action: "PORT_SCAN_STARTED",
    success: true,
    target: resolved.host,
    ip: params.ip,
  });
  void runPortScan(op.id, resolved.ip, ports, params.userId, params.ip, resolved.host, scan?.id, device?.id);
  return scan ? { operationId: op.id, scanId: scan.id } : { operationId: op.id };
}

export async function startDeviceServiceScan(params: {
  userId: string;
  deviceId: string;
  ip: string;
  startPort: number;
  endPort: number;
  profile: string;
}) {
  const device = await prisma.device.findFirst({
    where: { id: params.deviceId, userId: params.userId },
    include: { authorizedNetwork: true },
  });
  if (!device || device.authorizedNetwork?.status !== "AUTHORIZED") throw Errors.targetForbidden();
  const ports = mapPorts(params.profile, params.startPort, params.endPort);
  const scan = await prisma.scan.create({
    data: { userId: params.userId, deviceId: device.id, target: device.ipAddress, status: "QUEUED" },
  });
  const operation = await createOperation({
    userId: params.userId,
    type: "PORT_SCAN",
    project: "NetLink Service Discovery",
    operation: `Service scan (${params.profile})`,
    target: device.ipAddress,
    total: ports.length,
  });
  await audit({ userId: params.userId, action: "SERVICE_SCAN_STARTED", success: true, target: device.ipAddress, ip: params.ip });
  void runPortScan(operation.id, device.ipAddress, ports, params.userId, params.ip, device.ipAddress, scan.id, device.id);
  return { operationId: operation.id, scanId: scan.id };
}

async function runPortScan(
  operationId: string,
  ip: string,
  ports: number[],
  userId: string,
  client: string,
  host: string,
  scanId?: string,
  deviceId?: string,
) {
  await markRunning(operationId);
  if (scanId) await prisma.scan.update({ where: { id: scanId }, data: { status: "RUNNING", startedAt: new Date() } });
  const results: Array<{
    port: number;
    protocol: "TCP";
    status: string;
    service: string;
    responseTimeMs: number | null;
  }> = [];
  try {
    await poolMap(ports, config.scanConcurrency, async (port, index) => {
      if (await wasCancelled(operationId)) return;
      const probe = await tcpConnect(ip, port, config.scanTimeoutMs);
      results.push({
        port,
        protocol: "TCP",
        status: probe.status,
        service: probe.status === "open" ? conservativeServiceName(port) : "unknown",
        responseTimeMs: probe.responseTimeMs,
      });
      if ((index + 1) % 4 === 0 || index === ports.length - 1) {
        await updateProgress(operationId, index + 1);
      }
    });
    if (await wasCancelled(operationId)) {
      await finishOperation(operationId, "cancelled", { results });
      if (scanId) await prisma.scan.update({ where: { id: scanId }, data: { status: "CANCELLED", completedAt: new Date() } });
      return;
    }
    const payload: Record<string, unknown> = {
      target: host,
      results: results.sort((a, b) => a.port - b.port),
      totalScanned: results.length,
      open: results.filter((row) => row.status === "open").length,
      closed: results.filter((row) => row.status === "closed").length,
      errors: results.filter((row) => row.status === "error").length,
      lab: true,
    };
    const finished = await finishOperation(operationId, "completed", payload as Prisma.InputJsonValue);
    if (scanId && deviceId) {
      const openServiceCount = results.filter((result) => result.status === "open").length;
      const risk = calculateRisk({ newServices: openServiceCount });

      await prisma.scanResult.createMany({
        data: results.map((result) => ({ scanId, port: result.port, protocol: result.protocol, status: result.status, serviceName: result.service, responseTimeMs: result.responseTimeMs })),
      });
      for (const result of results) {
        const service = await prisma.service.upsert({
          where: { deviceId_port_protocol: { deviceId, port: result.port, protocol: result.protocol } },
          update: { name: result.service, status: result.status.toUpperCase(), lastSeen: new Date() },
          create: { deviceId, port: result.port, protocol: result.protocol, name: result.service, status: result.status.toUpperCase() },
        });
        await prisma.serviceObservation.create({ data: { serviceId: service.id, scanId, status: result.status.toUpperCase(), responseTimeMs: result.responseTimeMs } });
      }
      await prisma.device.update({ where: { id: deviceId }, data: { riskLevel: risk.level, lastSeen: new Date() } });
      await prisma.scan.update({ where: { id: scanId }, data: { status: "COMPLETED", completedAt: new Date() } });
    }
    payload.durationMs = finished.durationMs ?? 0;
    await prismaPatchDuration(operationId, payload);
    await audit({ userId, action: "PORT_SCAN_COMPLETED", success: true, target: host, ip: client });
  } catch {
    await finishOperation(operationId, "failed", undefined, {
      code: "SCAN_FAILED",
      message: "The scan could not be completed.",
    });
    if (scanId) await prisma.scan.update({ where: { id: scanId }, data: { status: "FAILED", completedAt: new Date() } });
    await audit({ userId, action: "PORT_SCAN_COMPLETED", success: false, target: host, ip: client });
  }
}

async function prismaPatchDuration(id: string, payload: Record<string, unknown>) {
  const { prisma } = await import("../prisma.js");
  const row = await prisma.securityOperation.findUnique({ where: { id } });
  await prisma.securityOperation.update({
    where: { id },
    data: { resultJson: { ...payload, durationMs: row?.durationMs ?? 0 } },
  });
}

export async function startIpScan(params: {
  userId: string;
  ip: string;
  startIp: string;
  endIp: string;
  cidr?: string;
  authorized: boolean;
}) {
  if (!params.authorized) throw Errors.confirmation();
  let start = params.startIp;
  let end = params.endIp;
  if (params.cidr) {
    const range = parseCidr(params.cidr);
    if (!range) throw Errors.validation("Invalid CIDR.");
    const { intToIpv4 } = await import("../lib/ipv4.js");
    start = intToIpv4(range.start);
    end = intToIpv4(range.end);
  }
  let hosts: string[];
  try {
    hosts = expandIpv4Range(start, end, config.maxHostsPerScan);
  } catch (error) {
    throw Errors.validation(error instanceof Error ? error.message : "Invalid IP range.");
  }
  for (const host of hosts) assertIpInAllowlist(host, config.allowedScanTargets);
  const op = await createOperation({
    userId: params.userId,
    type: "IP_SCAN",
    project: "IP Range Scanner",
    operation: "Host discovery",
    target: params.cidr || `${start}-${end}`,
    total: hosts.length,
  });
  await audit({
    userId: params.userId,
    action: "IP_SCAN_STARTED",
    success: true,
    target: `${start}-${end}`,
    ip: params.ip,
  });
  void runIpScan(op.id, hosts, params.userId, params.ip, `${start}-${end}`);
  return { operationId: op.id };
}

async function runIpScan(operationId: string, hosts: string[], userId: string, client: string, target: string) {
  await markRunning(operationId);
  const probePorts = config.probePorts.length > 0 ? config.probePorts : [80, 443, 22];
  const results: Array<{
    ip: string;
    status: string;
    hostname: string | null;
    responseTimeMs: number | null;
    method: "tcp";
  }> = [];
  try {
    await poolMap(hosts, config.scanConcurrency, async (host, index) => {
      if (await wasCancelled(operationId)) return;
      let best: { status: string; responseTimeMs: number | null } = { status: "inactive", responseTimeMs: null };
      for (const port of probePorts) {
        const probe = await tcpConnect(host, port, config.scanTimeoutMs);
        if (probe.status === "open") {
          best = { status: "active", responseTimeMs: probe.responseTimeMs };
          break;
        }
        if (probe.status === "error") best = { status: "error", responseTimeMs: null };
      }
      let hostname: string | null = null;
      try {
        const { reverse } = await import("node:dns/promises");
        const names = await reverse(host);
        hostname = names[0] ?? null;
      } catch {
        hostname = null;
      }
      results.push({ ip: host, status: best.status, hostname, responseTimeMs: best.responseTimeMs, method: "tcp" });
      await updateProgress(operationId, index + 1);
    });
    if (await wasCancelled(operationId)) {
      await finishOperation(operationId, "cancelled", { results });
      return;
    }
    const payload = {
      results,
      checked: results.length,
      active: results.filter((row) => row.status === "active").length,
      inactive: results.filter((row) => row.status === "inactive").length,
      errors: results.filter((row) => row.status === "error").length,
      lab: true,
    };
    const finished = await finishOperation(operationId, "completed", payload);
    await prismaPatchDuration(operationId, { ...payload, durationMs: finished.durationMs });
    await audit({ userId, action: "IP_SCAN_COMPLETED", success: true, target, ip: client });
  } catch {
    await finishOperation(operationId, "failed", undefined, {
      code: "SCAN_FAILED",
      message: "Host discovery could not be completed.",
    });
    await audit({ userId, action: "IP_SCAN_COMPLETED", success: false, target, ip: client });
  }
}
