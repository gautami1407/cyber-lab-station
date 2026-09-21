import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { prisma } from "./prisma.js";

const enabled = Boolean(process.env.DATABASE_URL);

type TestUser = { id: string; agent: ReturnType<typeof request.agent>; csrf: string };

async function createUser(app: ReturnType<typeof createApp>, label: string): Promise<TestUser> {
  const agent = request.agent(app);
  const csrf = (await agent.get("/api/csrf")).body.data.csrfToken as string;
  const suffix = `${label}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const response = await agent.post("/api/auth/register").set("X-CSRF-Token", csrf).send({
    username: suffix,
    email: `${suffix}@example.test`,
    password: "UniversityLab!2026",
    confirmPassword: "UniversityLab!2026",
  });
  return { id: response.body.data.userId as string, agent, csrf };
}

describe.skipIf(!enabled)("remote ownership isolation", () => {
  const app = createApp();
  let userA: TestUser;
  let userB: TestUser;
  let pairedDeviceB = "";
  let sessionB = "";
  let operationB = "";

  beforeAll(async () => {
    userA = await createUser(app, "ownerA");
    userB = await createUser(app, "ownerB");
    const pairing = await userB.agent.post("/api/pairing/request").set("X-CSRF-Token", userB.csrf).send({ deviceName: "User B agent", publicKey: "user-b-public-key-012345678901234567890123456789" });
    const approved = await userB.agent.post(`/api/pairing/${pairing.body.data.id}/approve`).set("X-CSRF-Token", userB.csrf).send();
    pairedDeviceB = approved.body.data.paired.id as string;
    const session = await userB.agent.post("/api/remote/session").set("X-CSRF-Token", userB.csrf).send({ pairedDeviceId: pairedDeviceB });
    sessionB = session.body.data.id as string;
    const operation = await prisma.remoteOperation.create({ data: { userId: userB.id, pairedDeviceId: pairedDeviceB, sessionId: sessionB, operation: "GET_SYSTEM_INFO", status: "QUEUED" } });
    operationB = operation.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it("rejects cross-user pairing, session, operation, and result access", async () => {
    expect((await userA.agent.delete(`/api/pairing/${pairedDeviceB}`).set("X-CSRF-Token", userA.csrf)).status).toBe(404);
    expect((await userA.agent.post("/api/remote/session").set("X-CSRF-Token", userA.csrf).send({ pairedDeviceId: pairedDeviceB })).status).toBe(403);
    expect((await userA.agent.post(`/api/remote/session/${sessionB}/end`).set("X-CSRF-Token", userA.csrf).send()).status).toBe(404);
    expect((await userA.agent.post("/api/remote/operation").set("X-CSRF-Token", userA.csrf).send({ pairedDeviceId: pairedDeviceB, sessionId: sessionB, operation: "GET_SYSTEM_INFO" })).status).toBe(403);
    expect((await userA.agent.get(`/api/remote/operation/${operationB}`)).status).toBe(404);
    expect((await userB.agent.get(`/api/remote/operation/${operationB}`)).status).toBe(200);
  });
});
