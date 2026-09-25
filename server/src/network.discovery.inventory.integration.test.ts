import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";
import { attachRealtime, closeRealtime } from "./realtime.js";
import { authorizeNetwork, discoverDevices, listDevices, getDevice, listLocalInterfaces } from "./services/network.js";

const enabled = Boolean(process.env.DATABASE_URL);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!enabled)("network discovery and inventory integration", () => {
  let server: Server;
  let userId = "";

  beforeAll(async () => {
    const app = createApp();
    server = createServer(app);
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
    const created = await prisma.user.create({
      data: {
        username: `netdisc${suffix}`,
        email: `netdisc${suffix}@example.test`,
        passwordHash: "hash",
      },
    });
    userId = created.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    closeRealtime();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("discovers and persists devices from an authorized local interface", async () => {
    const interfaces = listLocalInterfaces();
    const local = interfaces.find((entry) => {
      const prefix = Number.parseInt(entry.cidr.split("/")[1], 10);
      return entry.isUp && prefix >= 24 && prefix <= 30 && !entry.ipv4Address.startsWith("127.");
    }) ?? interfaces.find((entry) => entry.isUp && !entry.ipv4Address.startsWith("127.")) ?? interfaces[0];
    expect(local).toBeDefined();

    const network = await authorizeNetwork({
      userId,
      interfaceName: local.name,
      ipv4Address: local.ipv4Address,
      cidr: local.cidr,
      ip: "127.0.0.1",
    });

    const discovered = await discoverDevices(userId, network.id, "127.0.0.1");
    expect(discovered.length).toBeGreaterThan(0);

    const persisted = await prisma.device.findMany({ where: { userId }, include: { observations: true } });
    expect(persisted.length).toBeGreaterThan(0);
    const known = persisted.find((device) => device.ipAddress === local.ipv4Address);
    expect(known).toBeTruthy();
    expect(known?.status).toBe("ONLINE");
    expect(known?.observations.length).toBeGreaterThan(0);

    const repeat = await discoverDevices(userId, network.id, "127.0.0.1");
    expect(repeat.length).toBeGreaterThan(0);
    const deduped = await prisma.device.findMany({ where: { userId } });
    expect(deduped.filter((device) => device.ipAddress === local.ipv4Address)).toHaveLength(1);

    const byId = await getDevice(userId, known!.id);
    expect(byId.ipAddress).toBe(local.ipv4Address);
    expect(byId.observations.length).toBeGreaterThan(0);
  }, 30_000);

  it("lists the persisted inventory with real device metadata", async () => {
    const interfaces = listLocalInterfaces();
    const local = interfaces.find((entry) => {
      const prefix = Number.parseInt(entry.cidr.split("/")[1], 10);
      return entry.isUp && prefix >= 24 && prefix <= 30 && !entry.ipv4Address.startsWith("127.");
    }) ?? interfaces.find((entry) => entry.isUp && !entry.ipv4Address.startsWith("127.")) ?? interfaces[0];
    expect(local).toBeDefined();

    const network = await authorizeNetwork({
      userId,
      interfaceName: local.name,
      ipv4Address: local.ipv4Address,
      cidr: local.cidr,
      ip: "127.0.0.1",
    });

    const manualIp = `${local.ipv4Address.split(".").slice(0, 3).join(".")}.254`;
    const device = await prisma.device.create({
      data: {
        userId,
        authorizedNetworkId: network.id,
        ipAddress: manualIp,
        hostname: `${local.name}-inventory`,
        macAddress: local.macAddress ?? "00:11:22:33:44:55",
        vendor: "Test Vendor",
        status: "ONLINE",
        lastSeen: new Date(),
        riskLevel: "LOW",
      },
    });

    const listing = await listDevices(userId);
    expect(listing.some((entry) => entry.id === device.id && entry.ipAddress === manualIp)).toBe(true);
    expect(listing.some((entry) => entry.vendor === "Test Vendor")).toBe(true);

    const detail = await getDevice(userId, device.id);
    expect(detail.ipAddress).toBe(manualIp);
    expect(detail.hostname).toBe(`${local.name}-inventory`);
    expect(detail.vendor).toBe("Test Vendor");
    expect(detail.status).toBe("ONLINE");

    await prisma.device.update({ where: { id: device.id }, data: { status: "OFFLINE" } });
    await delay(100);
    const refreshed = await getDevice(userId, device.id);
    expect(refreshed.status).toBe("OFFLINE");
  }, 30_000);
});
