import net from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { startPortScan } from "./services/scanner.js";

const enabled = Boolean(process.env.DATABASE_URL);

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function createUser(prefix: string) {
  const username = unique(prefix);
  return prisma.user.create({
    data: { username, email: `${username}@example.test`, passwordHash: "hash" },
  });
}

async function authorizeLoopback(userId: string) {
  return prisma.authorizedNetwork.create({
    data: {
      userId,
      interfaceName: "lo",
      ipv4Address: "127.0.0.1",
      cidr: "127.0.0.1/32",
      gateway: "127.0.0.1",
      status: "AUTHORIZED",
    },
  });
}

async function listen(listeners: net.Server[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    listeners.push(server);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string") resolve(address.port);
      else reject(new Error("listen() did not return an IPv4 port"));
    });
  });
}

async function closeServers(listeners: net.Server[]) {
  await Promise.allSettled(
    listeners.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
}

async function waitForOperation(operationId: string) {
  let row: Awaited<ReturnType<typeof prisma.securityOperation.findUnique>> | null = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    row = await prisma.securityOperation.findUnique({ where: { id: operationId } });
    if (row && ["completed", "failed", "cancelled"].includes(row.status)) return row;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return row;
}

/** The Scan row is persisted after the operation completes, so poll it separately. */
async function waitForScanStatus(scanId: string) {
  let scan: Awaited<ReturnType<typeof prisma.scan.findUnique>> | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    scan = await prisma.scan.findUnique({ where: { id: scanId } });
    if (scan && ["COMPLETED", "FAILED", "CANCELLED"].includes(scan.status)) return scan;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return scan;
}

/** Waits until the background scan task has written its final audit row. */
async function waitForAudit(userId: string, action: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const count = await prisma.auditLog.count({ where: { userId, action } });
    if (count > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

describe.skipIf(!enabled)("port scanner authorization service", () => {
  it("accepts and persists a scan for a target inside the user's authorized network", async () => {
    const userA = await createUser("auth-a");
    const listeners: net.Server[] = [];
    try {
      await authorizeLoopback(userA.id);
      const device = await prisma.device.create({
        data: {
          userId: userA.id,
          ipAddress: "127.0.0.1",
          hostname: "localhost",
          status: "ONLINE",
        },
      });

      const openPorts = await Promise.all([listen(listeners), listen(listeners)]);
      const [firstPort, secondPort] = [...openPorts].sort((a, b) => a - b);
      const closedPort = secondPort + 1;

      const handle = await startPortScan({
        userId: userA.id,
        ip: "127.0.0.1",
        target: "127.0.0.1",
        startPort: firstPort,
        endPort: closedPort,
        profile: "custom",
        authorized: true,
      });

      expect(handle.operationId).toBeTypeOf("string");
      expect(handle.scanId).toBeTypeOf("string");

      const op = await waitForOperation(handle.operationId);
      expect(op?.status).toBe("completed");
      const settledScan = await waitForScanStatus(handle.scanId!);
      expect(settledScan?.status).toBe("COMPLETED");
      await waitForAudit(userA.id, "PORT_SCAN_COMPLETED");

      const snapshot = op?.resultJson as { results: Array<{ port: number; status: string }> } | null;
      expect(snapshot?.results.find((row) => row.port === firstPort)?.status).toBe("open");
      expect(snapshot?.results.find((row) => row.port === secondPort)?.status).toBe("open");
      expect(snapshot?.results.find((row) => row.port === closedPort)?.status).toBe("closed");

      const scan = await prisma.scan.findUnique({
        where: { id: handle.scanId },
        include: { results: true },
      });
      expect(scan?.status).toBe("COMPLETED");
      expect(scan?.results.some((row) => row.port === firstPort && row.status === "open")).toBe(true);
      expect(scan?.results.some((row) => row.port === secondPort && row.status === "open")).toBe(true);
      expect(scan?.results.some((row) => row.port === closedPort && row.status === "closed")).toBe(true);

      for (const port of [firstPort, secondPort]) {
        const service = await prisma.service.findFirst({
          where: { deviceId: device.id, port, protocol: "TCP" },
        });
        expect(service?.status).toBe("OPEN");
        expect(service?.name).toBeDefined();
        const observation = await prisma.serviceObservation.findFirst({
          where: { scanId: handle.scanId, serviceId: service!.id },
        });
        expect(observation?.status).toBe("OPEN");
      }

      const refreshed = await prisma.device.findUnique({ where: { id: device.id } });
      expect(refreshed?.riskLevel).toBe("MEDIUM");
    } finally {
      await closeServers(listeners);
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => undefined);
    }
  });

  it("rejects a scan when the user has no authorized network for the target", async () => {
    const userB = await createUser("auth-b");
    try {
      await expect(
        startPortScan({
          userId: userB.id,
          ip: "127.0.0.1",
          target: "127.0.0.1",
          startPort: 1,
          endPort: 2,
          profile: "custom",
          authorized: true,
        }),
      ).rejects.toMatchObject({ status: 403, code: "TARGET_UNAUTHORIZED" });

      const operations = await prisma.securityOperation.count({ where: { userId: userB.id } });
      expect(operations).toBe(0);
    } finally {
      await prisma.user.delete({ where: { id: userB.id } }).catch(() => undefined);
    }
  });
it("does not accept another user's authorization", async () => {
    const userA = await createUser("auth-a2");
    const userB = await createUser("auth-b2");
    try {
      await authorizeLoopback(userA.id);
      await expect(
        startPortScan({
          userId: userB.id,
          ip: "127.0.0.1",
          target: "127.0.0.1",
          startPort: 1,
          endPort: 2,
          profile: "custom",
          authorized: true,
        }),
      ).rejects.toMatchObject({ status: 403, code: "TARGET_UNAUTHORIZED" });
    } finally {
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: userB.id } }).catch(() => undefined);
    }
  });

  it("still enforces the global ALLOWED_SCAN_TARGETS allowlist", async () => {
    const userA = await createUser("auth-a3");
    try {
      await authorizeLoopback(userA.id);
      await expect(
        startPortScan({
          userId: userA.id,
          ip: "127.0.0.1",
          target: "8.8.8.8",
          startPort: 80,
          endPort: 80,
          profile: "custom",
          authorized: true,
        }),
      ).rejects.toMatchObject({ status: 403, code: "TARGET_NOT_ALLOWED" });
    } finally {
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => undefined);
    }
  });

  it("rejects malformed and unknown hostnames", async () => {
    const userA = await createUser("auth-a4");
    try {
      await authorizeLoopback(userA.id);
      for (const target of ["example.com", "1.2.3"]) {
        await expect(
          startPortScan({
            userId: userA.id,
            ip: "127.0.0.1",
            target,
            startPort: 1,
            endPort: 2,
            profile: "custom",
            authorized: true,
          }),
        ).rejects.toMatchObject({ status: 403, code: "TARGET_NOT_ALLOWED" });
      }
      await expect(
        startPortScan({
          userId: userA.id,
          ip: "127.0.0.1",
          target: "not a hostname",
          startPort: 1,
          endPort: 2,
          profile: "custom",
          authorized: true,
        }),
      ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    } finally {
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => undefined);
    }
  });

  it("requires the explicit authorization checkbox", async () => {
    const userA = await createUser("auth-a5");
    try {
      await authorizeLoopback(userA.id);
      await expect(
        startPortScan({
          userId: userA.id,
          ip: "127.0.0.1",
          target: "127.0.0.1",
          startPort: 1,
          endPort: 2,
          profile: "custom",
          authorized: false,
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_REQUIRED" });
    } finally {
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => undefined);
    }
  });

  it("accepts a hostname and explicit port form for an allowlisted local target", async () => {
    const userA = await createUser("auth-a6");
    const server = net.createServer();
    try {
      await authorizeLoopback(userA.id);
      await prisma.device.create({
        data: { userId: userA.id, ipAddress: "127.0.0.1", hostname: "localhost", status: "ONLINE" },
      });
      const openPort = await new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (address && typeof address !== "string") resolve(address.port);
          else reject(new Error("listen() did not return an IPv4 port"));
        });
      });

      const handle = await startPortScan({
        userId: userA.id,
        ip: "127.0.0.1",
        target: `http://localhost:${openPort}`,
        startPort: openPort,
        endPort: openPort,
        profile: "custom",
        authorized: true,
      });
      const op = await waitForOperation(handle.operationId);
      expect(op?.status).toBe("completed");
      const settledScan = await waitForScanStatus(handle.scanId!);
      expect(settledScan?.status).toBe("COMPLETED");
      await waitForAudit(userA.id, "PORT_SCAN_COMPLETED");
      const snapshot = op?.resultJson as { results: Array<{ port: number; status: string }> } | null;
      expect(snapshot?.results.some((row) => row.port === openPort && row.status === "open")).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve())).catch(() => undefined);
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => undefined);
    }
  });
});
describe.skipIf(!enabled)("port scanner csrf origin and HTTP authorization", () => {
  let app: Awaited<ReturnType<typeof import("./app.js")["createApp"]>>;
  let agentA: ReturnType<typeof request.agent>;
  let csrfA = "";
  let agentB: ReturnType<typeof request.agent>;
  let csrfB = "";
  let userAId = "";
  let userBId = "";

  beforeAll(async () => {
    const mod = await import("./app.js");
    app = mod.createApp();

    agentA = request.agent(app);
    const csrfARes = await agentA.get("/api/csrf");
    csrfA = csrfARes.body.data.csrfToken;
    const username = unique("http-a");
    const regA = await agentA
      .post("/api/auth/register")
      .set("Origin", "http://localhost:8082")
      .set("X-CSRF-Token", csrfA)
      .send({
        username,
        email: `${username}@example.test`,
        password: "LabTest!2026",
        confirmPassword: "LabTest!2026",
      });
    expect(regA.status).toBe(201);
    const userA = await prisma.user.findUnique({ where: { username } });
    userAId = userA!.id;
    await prisma.authorizedNetwork.create({
      data: {
        userId: userAId,
        interfaceName: "lo",
        ipv4Address: "127.0.0.1",
        cidr: "127.0.0.1/32",
        gateway: "127.0.0.1",
        status: "AUTHORIZED",
      },
    });

    agentB = request.agent(app);
    const csrfBRes = await agentB.get("/api/csrf");
    csrfB = csrfBRes.body.data.csrfToken;
    const usernameB = unique("http-b");
    const regB = await agentB
      .post("/api/auth/register")
      .set("Origin", "http://localhost:8082")
      .set("X-CSRF-Token", csrfB)
      .send({
        username: usernameB,
        email: `${usernameB}@example.test`,
        password: "LabTest!2026",
        confirmPassword: "LabTest!2026",
      });
    expect(regB.status).toBe(201);
    const userB = await prisma.user.findUnique({ where: { username: usernameB } });
    userBId = userB!.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userBId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userAId } }).catch(() => undefined);
  });

  function scanRequest(
    agent: ReturnType<typeof request.agent>,
    csrf: string,
    origin: string,
    body: Record<string, unknown>,
  ) {
    return agent.post("/api/scanner/ports").set("Origin", origin).set("X-CSRF-Token", csrf).send(body);
  }

  it("accepts a port scan POST from the localhost:8082 dev origin", async () => {
    const res = await scanRequest(agentA, csrfA, "http://localhost:8082", {
      target: "127.0.0.1",
      startPort: 4001,
      endPort: 4002,
      profile: "custom",
      authorized: true,
    });
    expect(res.status).toBe(202);
    expect(res.body.data.operationId).toBeTypeOf("string");

    let status = "";
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const snap = await agentA.get(`/api/operations/${res.body.data.operationId}`);
      status = snap.body.data.status;
      if (["completed", "failed", "cancelled"].includes(status)) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(status).toBe("completed");
    await waitForAudit(userAId, "PORT_SCAN_COMPLETED");
  });

  it("rejects mutating requests from remote origins before any authorization check", async () => {
    const res = await scanRequest(agentA, csrfA, "https://evil.example", {
      target: "127.0.0.1",
      startPort: 1,
      endPort: 2,
      profile: "custom",
      authorized: true,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects an HTTP scan when the user has no authorized network", async () => {
    const res = await scanRequest(agentB, csrfB, "http://localhost:8082", {
      target: "127.0.0.1",
      startPort: 1,
      endPort: 2,
      profile: "custom",
      authorized: true,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("TARGET_UNAUTHORIZED");
  });

  it("rejects an HTTP scan target outside ALLOWED_SCAN_TARGETS", async () => {
    const res = await scanRequest(agentA, csrfA, "http://localhost:8082", {
      target: "8.8.8.8",
      startPort: 80,
      endPort: 80,
      profile: "custom",
      authorized: true,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("TARGET_NOT_ALLOWED");
  });
});