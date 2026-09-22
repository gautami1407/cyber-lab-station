import net from "node:net";
import { describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { startDeviceServiceScan } from "./services/scanner.js";

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("device service scan integration", () => {
  it("records open and closed ports for an authorized localhost device", async () => {
    const user = await prisma.user.create({
      data: {
        username: `svc-scan-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        email: `svc-scan-${Date.now()}@example.test`,
        passwordHash: "hash",
      },
    });

    let server: net.Server | undefined;
    try {
      const openPort = await new Promise<number>((resolve, reject) => {
        server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server!.address();
          if (address && typeof address !== "string") resolve(address.port);
        });
      });
      const closedPort = openPort + 1;
      const network = await prisma.authorizedNetwork.create({
        data: {
          userId: user.id,
          interfaceName: "lo",
          ipv4Address: "127.0.0.1",
          cidr: "127.0.0.1/32",
          gateway: "127.0.0.1",
          status: "AUTHORIZED",
        },
      });
      const device = await prisma.device.create({
        data: {
          userId: user.id,
          authorizedNetworkId: network.id,
          ipAddress: "127.0.0.1",
          hostname: "localhost",
          status: "ONLINE",
        },
      });

      const result = await startDeviceServiceScan({
        userId: user.id,
        deviceId: device.id,
        ip: "127.0.0.1",
        startPort: openPort,
        endPort: closedPort,
        profile: "custom",
      });

      let scan = null as (Awaited<ReturnType<typeof prisma.scan.findUnique>> & { results: Array<{ port: number; status: string }> }) | null;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const current = await prisma.scan.findUnique({
          where: { id: result.scanId },
          include: { results: true },
        });
        scan = current as (typeof scan);
        const operation = await prisma.securityOperation.findUnique({ where: { id: result.operationId } });
        if (scan?.status === "COMPLETED" && operation?.status === "completed") break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      expect(scan).not.toBeNull();
      expect(scan?.status).toBe("COMPLETED");
      expect(scan?.results.some((row) => row.port === openPort && row.status === "open")).toBe(true);
      expect(scan?.results.some((row) => row.port === closedPort && row.status === "closed")).toBe(true);

      const service = await prisma.service.findFirst({
        where: { deviceId: device.id, port: openPort, protocol: "TCP" },
      });
      expect(service?.name).toBeDefined();
      expect(service?.status).toBe("OPEN");

      const observation = await prisma.serviceObservation.findFirst({
        where: { scanId: result.scanId, serviceId: service!.id },
      });
      expect(observation?.status).toBe("OPEN");
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      await new Promise<void>((resolve, reject) => {
        if (!server) return resolve();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }).catch(() => undefined);
    }
  });

  it("updates the device risk level after a live service scan identifies multiple open services", async () => {
    const user = await prisma.user.create({
      data: {
        username: `risk-scan-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        email: `risk-scan-${Date.now()}@example.test`,
        passwordHash: "hash",
      },
    });

    const listeners: net.Server[] = [];
    try {
      const ports = await Promise.all(
        [0, 0].map(
          () =>
            new Promise<number>((resolve, reject) => {
              const server = net.createServer();
              listeners.push(server);
              server.once("error", reject);
              server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                if (address && typeof address !== "string") resolve(address.port);
              });
            }),
        ),
      );

      const [firstPort, secondPort] = [...ports].sort((a, b) => a - b);
      const network = await prisma.authorizedNetwork.create({
        data: {
          userId: user.id,
          interfaceName: "lo",
          ipv4Address: "127.0.0.1",
          cidr: "127.0.0.1/32",
          gateway: "127.0.0.1",
          status: "AUTHORIZED",
        },
      });
      const device = await prisma.device.create({
        data: {
          userId: user.id,
          authorizedNetworkId: network.id,
          ipAddress: "127.0.0.1",
          hostname: "localhost",
          status: "ONLINE",
        },
      });

      const result = await startDeviceServiceScan({
        userId: user.id,
        deviceId: device.id,
        ip: "127.0.0.1",
        startPort: firstPort,
        endPort: secondPort,
        profile: "custom",
      });

      let scan = null as (Awaited<ReturnType<typeof prisma.scan.findUnique>> & { results: Array<{ port: number; status: string }> }) | null;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const current = await prisma.scan.findUnique({ where: { id: result.scanId }, include: { results: true } });
        scan = current as (typeof scan);
        const operation = await prisma.securityOperation.findUnique({ where: { id: result.operationId } });
        if (scan?.status === "COMPLETED" && operation?.status === "completed") break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      expect(scan?.status).toBe("COMPLETED");
      expect(scan?.results.filter((row) => row.status === "open")).toHaveLength(2);

      const refreshed = await prisma.device.findUnique({ where: { id: device.id } });
      expect(refreshed?.riskLevel).toBe("MEDIUM");
    } finally {
      for (const listener of listeners) {
        await new Promise<void>((resolve, reject) => {
          listener.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }).catch(() => undefined);
      }
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    }
  });
});
