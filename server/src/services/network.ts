import { reverse } from "node:dns/promises";
import os from "node:os";
import net from "node:net";
import { Errors } from "../errors.js";
import { expandIpv4Range, intToIpv4, ipv4ToInt, parseCidr } from "../lib/ipv4.js";
import { tcpConnect } from "../lib/tcp.js";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { audit } from "./audit.js";
import { resolveDeviceVendor } from "./vendor.js";

type LocalInterface = {
  name: string;
  ipv4Address: string;
  netmask: string;
  cidr: string;
  macAddress: string | null;
  isUp: boolean;
};

function prefixLength(netmask: string): number | null {
  const value = ipv4ToInt(netmask);
  if (value == null) return null;
  let bits = 0;
  for (let mask = value; mask !== 0; mask = (mask << 1) >>> 0) bits += 1;
  const expected = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return value === expected ? bits : null;
}

export function listLocalInterfaces(): LocalInterface[] {
  const result: LocalInterface[] = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (String(address.family) !== "IPv4" && String(address.family) !== "4") continue;
      if (!net.isIPv4(address.address) || !net.isIPv4(address.netmask)) continue;
      const prefix = prefixLength(address.netmask);
      if (prefix == null) continue;
      result.push({
        name,
        ipv4Address: address.address,
        netmask: address.netmask,
        cidr: `${address.address}/${prefix}`,
        macAddress: address.mac || null,
        isUp: !address.internal,
      });
    }
  }
  return result;
}

function networkCidr(ipv4Address: string, cidr: string): string {
  const parsed = parseCidr(cidr);
  const ip = ipv4ToInt(ipv4Address);
  if (!parsed || ip == null || ip < parsed.start || ip > parsed.end) throw Errors.validation("The address is outside the network.");
  const bits = Number(cidr.split("/")[1]);
  return `${intToIpv4(parsed.start)}/${bits}`;
}

export async function authorizeNetwork(params: {
  userId: string;
  interfaceName: string;
  ipv4Address: string;
  cidr: string;
  ip: string;
}) {
  const local = listLocalInterfaces().find(
    (item) => item.name === params.interfaceName && item.ipv4Address === params.ipv4Address,
  );
  if (!local || local.cidr !== params.cidr) throw Errors.validation("The selected network is not a current local interface.");
  const canonicalCidr = networkCidr(local.ipv4Address, local.cidr);
  const network = await prisma.authorizedNetwork.upsert({
    where: { userId_cidr: { userId: params.userId, cidr: canonicalCidr } },
    update: { interfaceName: local.name, ipv4Address: local.ipv4Address, status: "AUTHORIZED", revokedAt: null },
    create: {
      userId: params.userId,
      interfaceName: local.name,
      ipv4Address: local.ipv4Address,
      cidr: canonicalCidr,
      status: "AUTHORIZED",
    },
  });
  await prisma.networkInterface.create({
    data: {
      authorizedNetworkId: network.id,
      name: local.name,
      ipv4Address: local.ipv4Address,
      cidr: canonicalCidr,
      macAddress: local.macAddress,
      isUp: local.isUp,
    },
  });
  await audit({ userId: params.userId, action: "NETWORK_AUTHORIZED", success: true, target: canonicalCidr, ip: params.ip });
  return network;
}

export async function listAuthorizedNetworks(userId: string) {
  return prisma.authorizedNetwork.findMany({
    where: { userId },
    include: { interfaces: { orderBy: { observedAt: "desc" }, take: 1 }, _count: { select: { devices: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeNetwork(userId: string, id: string, ip: string) {
  const network = await prisma.authorizedNetwork.findFirst({ where: { id, userId } });
  if (!network) throw Errors.notFound();
  const updated = await prisma.authorizedNetwork.update({
    where: { id },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await audit({ userId, action: "NETWORK_REVOKED", success: true, target: network.cidr, ip });
  return updated;
}

async function hostnameFor(ipAddress: string): Promise<string | null> {
  try {
    return (await reverse(ipAddress))[0] ?? null;
  } catch {
    return null;
  }
}

async function poolMap<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function run() {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) results.push(await worker(item));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

async function probeHost(ipAddress: string, local: LocalInterface | undefined) {
  if (local?.ipv4Address === ipAddress) return { ipAddress, status: "ONLINE" as const, latencyMs: 0 };
  const probes = await Promise.all(config.probePorts.map((port) => tcpConnect(ipAddress, port, config.scanTimeoutMs)));
  const open = probes.find((probe) => probe.status === "open");
  const closed = probes.some((probe) => probe.status === "closed");
  return {
    ipAddress,
    status: open || closed ? ("ONLINE" as const) : ("UNKNOWN" as const),
    latencyMs: open?.responseTimeMs ?? null,
  };
}

export async function discoverDevices(userId: string, networkId: string, ip: string) {
  const network = await prisma.authorizedNetwork.findFirst({ where: { id: networkId, userId, status: "AUTHORIZED" } });
  if (!network) throw Errors.notFound();
  const local = listLocalInterfaces().find((item) => networkCidr(item.ipv4Address, item.cidr) === network.cidr);
  if (!local) throw Errors.validation("The authorized interface is no longer available.");
  const range = parseCidr(network.cidr);
  if (!range) throw Errors.validation("The authorized network has an invalid CIDR.");
  const addresses = expandIpv4Range(intToIpv4(range.start), intToIpv4(range.end), config.maxHostsPerScan);
  const hosts = addresses.filter((address) => {
    const value = ipv4ToInt(address);
    return value != null && (range.end - range.start < 3 || (value !== range.start && value !== range.end));
  });
  const observations = await poolMap(hosts, config.scanConcurrency, (address) => probeHost(address, local));
  const now = new Date();
  const existing = await prisma.device.findMany({ where: { userId, authorizedNetworkId: network.id } });
  const seen = new Set<string>();
  const devices = [];
  for (const observation of observations) {
    if (observation.status !== "ONLINE") continue;
    seen.add(observation.ipAddress);
    const hostname = await hostnameFor(observation.ipAddress);
    const macAddress = observation.ipAddress === local.ipv4Address ? local.macAddress : null;
    const { vendor } = resolveDeviceVendor(macAddress);
    const device = await prisma.device.upsert({
      where: { userId_ipAddress: { userId, ipAddress: observation.ipAddress } },
      update: { authorizedNetworkId: network.id, macAddress, hostname, vendor, status: "ONLINE", lastSeen: now, latencyMs: observation.latencyMs },
      create: { userId, authorizedNetworkId: network.id, ipAddress: observation.ipAddress, macAddress, hostname, vendor, status: "ONLINE", latencyMs: observation.latencyMs },
    });
    await prisma.deviceObservation.create({ data: { deviceId: device.id, status: "ONLINE", ipAddress: device.ipAddress, macAddress, hostname, latencyMs: observation.latencyMs } });
    devices.push(device);
  }
  for (const device of existing.filter((item) => !seen.has(item.ipAddress) && item.status === "ONLINE")) {
    await prisma.device.update({ where: { id: device.id }, data: { status: "OFFLINE" } });
    await prisma.deviceObservation.create({ data: { deviceId: device.id, status: "OFFLINE", ipAddress: device.ipAddress, macAddress: device.macAddress, hostname: device.hostname } });
  }
  await audit({ userId, action: "DEVICE_DISCOVERY", success: true, target: network.cidr, ip });
  return devices;
}

export function listDevices(userId: string) {
  return prisma.device.findMany({
    where: { userId },
    include: { authorizedNetwork: true, _count: { select: { observations: true, services: true } } },
    orderBy: { lastSeen: "desc" },
  });
}

export async function getDevice(userId: string, id: string) {
  const device = await prisma.device.findFirst({
    where: { userId, id },
    include: {
      authorizedNetwork: true,
      observations: { orderBy: { observedAt: "desc" }, take: 50 },
      services: { orderBy: { lastSeen: "desc" }, include: { observations: { orderBy: { observedAt: "desc" }, take: 20 } } },
      scans: { orderBy: { createdAt: "desc" }, take: 20, include: { results: true } },
    },
  });
  if (!device) throw Errors.notFound();
  return device;
}

export async function getTopology(userId: string) {
  const networks = await prisma.authorizedNetwork.findMany({
    where: { userId, status: "AUTHORIZED" },
    include: { devices: { orderBy: { lastSeen: "desc" }, include: { _count: { select: { services: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    relationshipType: "LOGICAL",
    note: "Relationships represent authorized network membership and observed reachability, not physical topology.",
    gateways: networks.filter((network) => network.gateway).map((network) => ({ id: `gateway-${network.id}`, address: network.gateway })),
    networks: networks.map((network) => ({
      id: network.id,
      cidr: network.cidr,
      interfaceName: network.interfaceName,
      devices: network.devices.map((device) => ({
        id: device.id,
        ipAddress: device.ipAddress,
        hostname: device.hostname,
        status: device.status,
        riskLevel: device.riskLevel,
        serviceCount: device._count.services,
      })),
    })),
  };
}