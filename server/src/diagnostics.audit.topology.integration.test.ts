import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";

const enabled = Boolean(process.env.DATABASE_URL);
const app = createApp();

type TestUser = { id: string; agent: ReturnType<typeof request.agent>; csrf: string; username: string };

async function createUser(label: string): Promise<TestUser> {
  const agent = request.agent(app);
  const csrf = (await agent.get("/api/csrf")).body.data.csrfToken as string;
  const username = `${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const response = await agent.post("/api/auth/register").set("X-CSRF-Token", csrf).send({
    username,
    email: `${username}@example.test`,
    password: "UniversityLab!2026",
    confirmPassword: "UniversityLab!2026",
  });
  return { id: response.body.data.userId as string, agent, csrf, username };
}

describe.skipIf(!enabled)("diagnostics, audit, and topology integration", () => {
  it("returns successful diagnostics and handles failed and unauthorized targets", async () => {
    const user = await createUser("diagnostics");
    try {
      await prisma.authorizedNetwork.create({
        data: { userId: user.id, interfaceName: "controlled", ipv4Address: "127.0.0.1", cidr: "127.0.0.1/32", status: "AUTHORIZED" },
      });

      const success = await user.agent.post("/api/diagnostics/dns").set("X-CSRF-Token", user.csrf).send({ target: "127.0.0.1" });
      expect(success.status).toBe(200);
      expect(success.body.data).toMatchObject({ query: "127.0.0.1", addresses: ["127.0.0.1"] });
      expect(Array.isArray(success.body.data.hostnames)).toBe(true);

      const unauthorized = await user.agent.post("/api/diagnostics/dns").set("X-CSRF-Token", user.csrf).send({ target: "8.8.8.8" });
      expect(unauthorized.status).toBe(403);
      expect(unauthorized.body.error.code).toBe("TARGET_NOT_ALLOWED");

      const failed = await user.agent.post("/api/diagnostics/dns").set("X-CSRF-Token", user.csrf).send({ target: "not-a-real-diagnostic-host.invalid" });
      expect(failed.status).toBe(400);
      expect(failed.body.error.code).toBe("VALIDATION_ERROR");
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    }
  });

  it("returns persisted audit records with actor information", async () => {
    const user = await createUser("audit");
    try {
      const response = await user.agent.get("/api/audit-logs");
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "USER_REGISTERED", success: true, user: { id: user.id, username: user.username } }),
      ]));
      expect(response.body.data[0]).toHaveProperty("createdAt");
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    }
  });

  it("builds topology from the requesting user's persisted network and devices", async () => {
    const owner = await createUser("topology-owner");
    const other = await createUser("topology-other");
    try {
      const network = await prisma.authorizedNetwork.create({
        data: { userId: owner.id, interfaceName: "controlled", ipv4Address: "127.0.0.1", cidr: "127.0.0.1/32", status: "AUTHORIZED" },
      });
      const device = await prisma.device.create({
        data: { userId: owner.id, authorizedNetworkId: network.id, ipAddress: "127.0.0.1", hostname: "persisted-device", status: "ONLINE", riskLevel: "LOW" },
      });
      await prisma.device.create({ data: { userId: other.id, ipAddress: "127.0.0.2", hostname: "other-user-device", status: "ONLINE" } });

      const response = await owner.agent.get("/api/topology");
      expect(response.status).toBe(200);
      expect(response.body.data.networks).toHaveLength(1);
      expect(response.body.data.networks[0]).toMatchObject({ id: network.id, cidr: network.cidr });
      expect(response.body.data.networks[0].devices).toEqual([
        expect.objectContaining({ id: device.id, ipAddress: device.ipAddress, hostname: device.hostname, riskLevel: "LOW" }),
      ]);
      expect(response.body.data.networks[0].devices).toHaveLength(1);
    } finally {
      await prisma.user.delete({ where: { id: other.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: owner.id } }).catch(() => undefined);
    }
  });
});
