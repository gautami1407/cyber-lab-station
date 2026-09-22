import { describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import {
  activeMonitoringCount,
  monitorShutdown,
  runMonitoringTick,
  startMonitoring,
  stopAllMonitoring,
  stopMonitoring,
  updateAlert,
} from "./services/monitoring.js";

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("monitoring and alert integration", () => {
  it("starts one monitoring loop, persists observations, detects changes, and shuts down cleanly", async () => {
    const user = await prisma.user.create({
      data: {
        username: `monitor-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        email: `monitor-${Date.now()}@example.test`,
        passwordHash: "hash",
      },
    });
    let deviceId = "";
    let phase = 0;
    const discover = async (userId: string, currentNetworkId: string) => {
      if (phase === 0) {
        const device = await prisma.device.upsert({
          where: { userId_ipAddress: { userId, ipAddress: "127.0.0.1" } },
          update: { status: "ONLINE", authorizedNetworkId: currentNetworkId, lastSeen: new Date() },
          create: {
            userId,
            authorizedNetworkId: currentNetworkId,
            ipAddress: "127.0.0.1",
            hostname: "controlled-monitor-device",
            status: "ONLINE",
          },
        });
        deviceId = device.id;
        await prisma.deviceObservation.create({
          data: { deviceId: device.id, status: "ONLINE", ipAddress: device.ipAddress, hostname: device.hostname },
        });
        return [device];
      }

      await prisma.device.update({ where: { id: deviceId }, data: { status: "OFFLINE" } });
      await prisma.deviceObservation.create({
        data: { deviceId, status: "OFFLINE", ipAddress: "127.0.0.1", hostname: "controlled-monitor-device" },
      });
      return [];
    };

    try {
      const network = await prisma.authorizedNetwork.create({
        data: {
          userId: user.id,
          interfaceName: "controlled",
          ipv4Address: "127.0.0.1",
          cidr: "127.0.0.1/32",
          status: "AUTHORIZED",
        },
      });
      await startMonitoring(user.id, 15, "127.0.0.1", discover);
      await startMonitoring(user.id, 15, "127.0.0.1", discover);
      expect(activeMonitoringCount()).toBe(1);

      for (let attempt = 0; attempt < 20 && !deviceId; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(deviceId).not.toBe("");

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const eventCount = await prisma.securityEvent.count({ where: { userId: user.id, type: "DEVICE_DISCOVERED" } });
        const alertCount = await prisma.securityAlert.count({ where: { userId: user.id } });
        if (eventCount === 1 && alertCount === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      const firstEvents = await prisma.securityEvent.findMany({ where: { userId: user.id, type: "DEVICE_DISCOVERED" } });
      const firstAlerts = await prisma.securityAlert.findMany({ where: { userId: user.id } });
      expect(firstEvents).toHaveLength(1);
      expect(firstAlerts).toHaveLength(1);
      expect(firstAlerts[0]).toMatchObject({ deviceId, eventId: firstEvents[0]!.id, severity: "MEDIUM", status: "OPEN" });
      expect((await prisma.device.findUnique({ where: { id: deviceId } }))?.riskLevel).toBe("MEDIUM");
      expect(await prisma.deviceObservation.count({ where: { deviceId } })).toBeGreaterThanOrEqual(1);

      await runMonitoringTick(user.id, "127.0.0.1", discover);
      expect(await prisma.securityEvent.count({ where: { userId: user.id, type: "DEVICE_DISCOVERED" } })).toBe(1);
      expect(await prisma.securityAlert.count({ where: { userId: user.id } })).toBe(1);

      phase = 1;
      await runMonitoringTick(user.id, "127.0.0.1", discover);
      expect(await prisma.deviceObservation.count({ where: { deviceId, status: "OFFLINE" } })).toBe(1);
      expect(await prisma.securityEvent.count({ where: { userId: user.id, type: "DEVICE_OFFLINE" } })).toBe(1);
      expect(await prisma.securityEvent.count({ where: { userId: user.id } })).toBe(2);

      await stopMonitoring(user.id, "127.0.0.1");
      expect(activeMonitoringCount()).toBe(0);
      expect((await prisma.monitoringConfig.findUnique({ where: { userId: user.id } }))?.enabled).toBe(false);

      await startMonitoring(user.id, 15, "127.0.0.1", discover);
      expect(activeMonitoringCount()).toBe(1);
      await monitorShutdown();
      expect(activeMonitoringCount()).toBe(0);
      expect((await prisma.monitoringConfig.findUnique({ where: { userId: user.id } }))?.enabled).toBe(false);
    } finally {
      stopAllMonitoring();
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    }
  });

  it("enforces alert lifecycle, authorization, and audit records", async () => {
    const owner = await prisma.user.create({
      data: {
        username: `alert-owner-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        email: `alert-owner-${Date.now()}@example.test`,
        passwordHash: "hash",
      },
    });
    const otherUser = await prisma.user.create({
      data: {
        username: `alert-other-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        email: `alert-other-${Date.now()}@example.test`,
        passwordHash: "hash",
      },
    });

    try {
      const device = await prisma.device.create({ data: { userId: owner.id, ipAddress: "127.0.0.2", status: "ONLINE" } });
      const event = await prisma.securityEvent.create({
        data: {
          userId: owner.id,
          deviceId: device.id,
          type: "DEVICE_DISCOVERED",
          severity: "MEDIUM",
          description: "Controlled security event",
        },
      });
      const alert = await prisma.securityAlert.create({
        data: {
          userId: owner.id,
          deviceId: device.id,
          eventId: event.id,
          severity: event.severity,
          title: "Controlled alert",
          explanation: "Controlled risk condition",
        },
      });

      await expect(updateAlert(otherUser.id, alert.id, "ACKNOWLEDGED", "127.0.0.1")).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(updateAlert(owner.id, alert.id, "RESOLVED", "127.0.0.1")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await expect(updateAlert(owner.id, alert.id, "ACKNOWLEDGED", "127.0.0.1")).resolves.toMatchObject({ status: "ACKNOWLEDGED" });
      await expect(updateAlert(owner.id, alert.id, "OPEN", "127.0.0.1")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await expect(updateAlert(owner.id, alert.id, "RESOLVED", "127.0.0.1")).resolves.toMatchObject({ status: "RESOLVED" });

      const stored = await prisma.securityAlert.findUnique({ where: { id: alert.id } });
      expect(stored).toMatchObject({ userId: owner.id, deviceId: device.id, eventId: event.id, severity: "MEDIUM", status: "RESOLVED" });
      expect(await prisma.auditLog.count({ where: { userId: owner.id, action: "ALERT_ACKNOWLEDGED" } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { userId: owner.id, action: "ALERT_RESOLVED" } })).toBe(1);
    } finally {
      await prisma.user.delete({ where: { id: otherUser.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: owner.id } }).catch(() => undefined);
    }
  });
});
