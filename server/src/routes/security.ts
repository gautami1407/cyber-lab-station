import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole, requireUser } from "../middleware/auth.js";
import { ok } from "../middleware/error.js";
import { liveSecurityChecks, recommendations, validateInput } from "../services/security.js";
import { config } from "../config.js";

const router = Router();

router.post("/security/validate-input", requireAuth, requireUser, (req, res, next) => {
  try {
    const body = z.object({ value: z.string(), rules: z.array(z.string()).optional() }).strict().parse(req.body);
    ok(res, validateInput(body.value));
  } catch (error) {
    next(error);
  }
});

router.get("/security/checks", requireAuth, (_req, res) => {
  ok(res, liveSecurityChecks());
});

router.get("/security/recommendations", requireAuth, (_req, res) => {
  ok(res, recommendations());
});

router.get("/security/rbac", requireAuth, (req, res) => {
  ok(res, {
    role: req.user!.role,
    matrix: {
      Dashboard: { guest: false, user: true, moderator: true, admin: true },
      Profile: { guest: false, user: true, moderator: true, admin: true },
      Reports: { guest: false, user: true, moderator: true, admin: true },
      "Security Settings": { guest: false, user: false, moderator: false, admin: true },
      "Admin Panel": { guest: false, user: false, moderator: false, admin: true },
    },
  });
});

router.get("/security/admin", requireAuth, requireRole("admin"), (_req, res) => {
  ok(res, { ok: true });
});

router.get("/activity", requireAuth, async (req, res, next) => {
  try {
    const query = String(req.query.q ?? "");
    const project = String(req.query.project ?? "");
    const status = String(req.query.status ?? "");
    const from = String(req.query.from ?? "");
    const page = Math.max(0, Number(req.query.page ?? 0) || 0);
    const take = 20;
    const where = {
      userId: req.user!.id,
      ...(project ? { project } : {}),
      ...(status ? { status: status as never } : {}),
      ...(from ? { createdAt: { gte: new Date(from) } } : {}),
      ...(query
        ? {
            OR: [
              { operation: { contains: query, mode: "insensitive" as const } },
              { project: { contains: query, mode: "insensitive" as const } },
              { targetMasked: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.securityOperation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page * take,
        take,
      }),
      prisma.securityOperation.count({ where }),
    ]);
    ok(res, {
      total,
      page,
      rows: rows.map((row) => ({
        id: row.id,
        time: row.createdAt.toISOString(),
        project: row.project,
        operation: row.operation,
        target: row.targetMasked,
        status:
          row.status === "completed"
            ? "success"
            : row.status === "failed"
              ? "failed"
              : row.status === "cancelled"
                ? "stopped"
                : "running",
        durationMs: row.durationMs ?? 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard", requireAuth, async (req, res, next) => {
  try {
    const [ops, success, failed, db] = await Promise.all([
      prisma.securityOperation.count({ where: { userId: req.user!.id } }),
      prisma.securityOperation.count({ where: { userId: req.user!.id, status: "completed" } }),
      prisma.securityOperation.count({ where: { userId: req.user!.id, status: "failed" } }),
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    ]);
    const recent = await prisma.securityOperation.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    ok(res, {
      projects: 5,
      securityControls: liveSecurityChecks().length,
      recentOperations: ops,
      successful: success,
      failed,
      database: db,
      recent: recent.map((row) => ({
        id: row.id,
        time: row.createdAt.toISOString(),
        project: row.project,
        operation: row.operation,
        target: row.targetMasked,
        status: row.status,
        durationMs: row.durationMs ?? 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/settings/public", requireAuth, (_req, res) => {
  ok(res, {
    apiVersion: config.apiVersion,
    environment: config.nodeEnv,
    labMode: true,
    sessionIdleMinutes: config.sessionIdleMinutes,
    sessionAbsoluteHours: config.sessionAbsoluteHours,
    allowedTargetCount: config.allowedScanTargets.length,
    allowedDomainCount: config.allowedEnumerationDomains.length,
  });
});

export default router;
