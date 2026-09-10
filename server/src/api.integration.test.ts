import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("API integration", () => {
  let app: Awaited<ReturnType<typeof import("./app.js")["createApp"]>>;
  let agent: ReturnType<typeof request.agent>;
  let csrf = "";

  beforeAll(async () => {
    const mod = await import("./app.js");
    app = mod.createApp();
    agent = request.agent(app);
    const csrfRes = await agent.get("/api/csrf");
    csrf = csrfRes.body.data.csrfToken;
  });

  it("health reports api=true", async () => {
    const res = await agent.get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.data.api).toBe(true);
  });

  it("rejects mutating requests without CSRF", async () => {
    const res = await request(app).post("/api/auth/login").send({ identifier: "x", password: "y" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_REJECTED");
  });

  it("rejects weak passwords", async () => {
    const res = await agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", csrf)
      .send({ username: "ab", email: "bad", password: "short", confirmPassword: "short" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects unauthenticated scanner calls", async () => {
    const res = await agent
      .post("/api/scanner/ports")
      .set("X-CSRF-Token", csrf)
      .send({
        target: "8.8.8.8",
        startPort: 1,
        endPort: 2,
        profile: "custom",
        authorized: true,
      });
    expect([401, 403]).toContain(res.status);
  });
});
