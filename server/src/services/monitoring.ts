import { config } from "../config.js";
import { Errors } from "../errors.js";
import { prisma } from "../prisma.js";
import { audit } from "./audit.js";
import { discoverDevices } from "./network.js";
import { calculateRisk } from "./risk.js";
import { publishUserEvent } from "../realtime.js";

const timers = new Map<string, NodeJS.Timeout>();

async function tick(userId: string, clientIp: string) {
  const networks = await prisma.authorizedNetwork.findMany({ where: { userId, status: "AUTHORIZED" } });
  for (const network of networks) {
    const before = await prisma.device.findMany({ where: { userId, authorizedNetworkId: network.id } });
    const beforeIds = new Set(before.map((device) => device.id));
    const devices = await discoverDevices(userId, network.id, clientIp);
    for (const device of devices) {
      if (!beforeIds.has(device.id)) {
        const risk = calculateRisk({ newDevice: true });
        const event = await prisma.securityEvent.create({ data: { userId, deviceId: device.id, type: "DEVICE_DISCOVERED", severity: risk.level, description: "A previously unseen device appeared on an authorized network.", evidence: { ipAddress: device.ipAddress, firstSeen: device.firstSeen.toISOString() } } });
        await prisma.securityAlert.create({ data: { userId, deviceId: device.id, eventId: event.id, severity: risk.level, title: "New device detected", explanation: risk.reason, evidence: event.evidence ?? undefined } });
        publishUserEvent(userId, "ALERT_CREATED", { eventId: event.id, deviceId: device.id, severity: risk.level });
        publishUserEvent(userId, "SECURITY_EVENT", { eventId: event.id, type: event.type });
      }
    }
    const after = await prisma.device.findMany({ where: { userId, authorizedNetworkId: network.id } });
    for (const device of after.filter((item) => item.status === "OFFLINE" && before.some((prior) => prior.id === item.id && prior.status === "ONLINE"))) {
      const event = await prisma.securityEvent.create({ data: { userId, deviceId: device.id, type: "DEVICE_OFFLINE", severity: "LOW", description: "An observed device did not respond during the latest monitoring cycle.", evidence: { ipAddress: device.ipAddress } } });
      publishUserEvent(userId, "DEVICE_OFFLINE", { eventId: event.id, deviceId: device.id });
    }
  }
}

export async function getMonitoringStatus(userId: string) {
  return prisma.monitoringConfig.findUnique({ where: { userId } });
}

export async function startMonitoring(userId: string, intervalSeconds: number, clientIp: string) {
  const interval = Math.min(Math.max(Math.trunc(intervalSeconds), 15), 3600);
  const existing = timers.get(userId);
  if (existing) clearInterval(existing);
  await prisma.monitoringConfig.upsert({ where: { userId }, update: { enabled: true, intervalSeconds: interval, startedAt: new Date() }, create: { userId, enabled: true, intervalSeconds: interval, startedAt: new Date() } });
  const timer = setInterval(() => void tick(userId, clientIp).catch(() => undefined), interval * 1000);
  timers.set(userId, timer);
  void tick(userId, clientIp).catch(() => undefined);
  await audit({ userId, action: "MONITORING_STARTED", success: true, ip: clientIp });
  return getMonitoringStatus(userId);
}

export async function stopMonitoring(userId: string, clientIp: string) {
  const timer = timers.get(userId);
  if (timer) clearInterval(timer);
  timers.delete(userId);
  await prisma.monitoringConfig.upsert({ where: { userId }, update: { enabled: false }, create: { userId, enabled: false } });
  await audit({ userId, action: "MONITORING_STOPPED", success: true, ip: clientIp });
  return getMonitoringStatus(userId);
}

export async function listEvents(userId: string) {
  return prisma.securityEvent.findMany({ where: { userId }, include: { device: true }, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function listAlerts(userId: string) {
  return prisma.securityAlert.findMany({ where: { userId }, include: { device: true, event: true }, orderBy: { createdAt: "desc" }, take: 200 });
}

export async function updateAlert(userId: string, id: string, status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED", clientIp: string) {
  const alert = await prisma.securityAlert.findFirst({ where: { id, userId } });
  if (!alert) throw Errors.notFound();
  const updated = await prisma.securityAlert.update({ where: { id }, data: { status } });
  await audit({ userId, action: `ALERT_${status}`, success: true, target: id, ip: clientIp });
  return updated;
}

export function stopAllMonitoring() {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
}

export async function monitorShutdown() {
  stopAllMonitoring();
  await prisma.monitoringConfig.updateMany({ where: { enabled: true }, data: { enabled: false } }).catch(() => undefined);
}

export const monitoringLimits = { minimumIntervalSeconds: 15, maximumIntervalSeconds: 3600, configuredDefaultSeconds: config.scanTimeoutMs };
