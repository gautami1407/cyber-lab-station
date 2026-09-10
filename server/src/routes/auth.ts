import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { Errors } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { ok } from "../middleware/error.js";
import { prisma } from "../prisma.js";
import {
  listSessions,
  loginUser,
  logout,
  logoutAll,
  registerUser,
  revokeSession,
  toSessionDto,
} from "../services/auth.js";
import { clientIp } from "../services/audit.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.authRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(Errors.rateLimited()),
});

const registerSchema = z
  .object({
    username: z.string(),
    email: z.string(),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .strict();

const loginSchema = z
  .object({
    identifier: z.string(),
    password: z.string(),
    rememberMe: z.boolean().optional(),
  })
  .strict();

router.post("/register", async (req, res, next) => {
  try {
    registerSchema.parse(req.body);
    ok(res, await registerUser(req, res), 201);
  } catch (error) {
    next(error);
  }
});

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    loginSchema.parse(req.body);
    ok(res, await loginUser(req, res));
  } catch (error) {
    next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    await logout(req, res);
    ok(res, { loggedOut: true });
  } catch (error) {
    next(error);
  }
});

router.get("/session", requireAuth, async (req, res, next) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.sessionId } });
    if (!session) throw Errors.unauthorized();
    ok(res, {
      user: {
        userId: req.user!.id,
        username: req.user!.username,
        email: req.user!.email,
        role: req.user!.role,
        createdAt: req.user!.createdAt.toISOString(),
      },
      session: toSessionDto(session, req.sessionId!, clientIp(req)),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/session/refresh", requireAuth, async (req, res, next) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.sessionId } });
    if (!session) throw Errors.unauthorized();
    ok(res, toSessionDto(session, req.sessionId!, clientIp(req)));
  } catch (error) {
    next(error);
  }
});

router.get("/sessions", requireAuth, async (req, res, next) => {
  try {
    ok(res, await listSessions(req.user!.id, req.sessionId!, clientIp(req)));
  } catch (error) {
    next(error);
  }
});

router.delete("/sessions/:id", requireAuth, async (req, res, next) => {
  try {
    await revokeSession(req.user!.id, String(req.params.id), clientIp(req));
    ok(res, { revoked: true });
  } catch (error) {
    next(error);
  }
});

router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await logoutAll(req.user!.id, clientIp(req));
    res.clearCookie("cyberlab.sid", { path: "/" });
    ok(res, { loggedOut: true });
  } catch (error) {
    next(error);
  }
});

export default router;
