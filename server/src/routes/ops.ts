import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { Errors } from "../errors.js";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { ok } from "../middleware/error.js";
import { clientIp } from "../services/audit.js";
import { audit } from "../services/audit.js";
import { startEnumeration } from "../services/enumerate.js";
import { getOperation, requestCancel } from "../services/operations.js";
import { startIpScan, startPortScan } from "../services/scanner.js";

const router = Router();
const scanLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.scannerRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(Errors.rateLimited()),
});

router.post("/scanner/ports", requireAuth, requireUser, scanLimiter, async (req, res, next) => {
  try {
    const body = z
      .object({
        target: z.string().min(1).max(253),
        startPort: z.number().int(),
        endPort: z.number().int(),
        profile: z.enum(["common", "web", "custom"]).default("custom"),
        authorized: z.boolean(),
        authorizationConfirmed: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    const authorized = body.authorized || body.authorizationConfirmed === true;
    if (!authorized) {
      await audit({
        userId: req.user!.id,
        action: "PORT_SCAN_REJECTED",
        success: false,
        target: body.target,
        ip: clientIp(req),
      });
    }
    ok(
      res,
      await startPortScan({
        userId: req.user!.id,
        ip: clientIp(req),
        target: body.target,
        startPort: body.startPort,
        endPort: body.endPort,
        profile: body.profile,
        authorized,
      }),
      202,
    );
  } catch (error) {
    next(error);
  }
});

router.post("/scanner/ip-range", requireAuth, requireUser, scanLimiter, async (req, res, next) => {
  try {
    const body = z
      .object({
        startIp: z.string(),
        endIp: z.string(),
        cidr: z.string().optional(),
        method: z.enum(["ping", "tcp", "arp"]).optional(),
        authorized: z.boolean(),
        authorizationConfirmed: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    ok(
      res,
      await startIpScan({
        userId: req.user!.id,
        ip: clientIp(req),
        startIp: body.startIp,
        endIp: body.endIp,
        cidr: body.cidr,
        authorized: body.authorized || body.authorizationConfirmed === true,
      }),
      202,
    );
  } catch (error) {
    next(error);
  }
});

router.post("/subdomains/enumerate", requireAuth, requireUser, scanLimiter, async (req, res, next) => {
  try {
    const body = z
      .object({
        domain: z.string(),
        methods: z.array(z.string()).default([]),
        authorized: z.boolean(),
        authorizationConfirmed: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    ok(
      res,
      await startEnumeration({
        userId: req.user!.id,
        ip: clientIp(req),
        domain: body.domain,
        methods: body.methods,
        authorized: body.authorized || body.authorizationConfirmed === true,
      }),
      202,
    );
  } catch (error) {
    next(error);
  }
});

router.get("/operations/:id", requireAuth, async (req, res, next) => {
  try {
    const op = await getOperation(String(req.params.id), req.user!.id);
    if (!op) throw Errors.notFound();
    ok(res, {
      id: op.id,
      status: op.status,
      progressDone: op.progressDone,
      progressTotal: op.progressTotal,
      result: op.resultJson,
      error: op.errorMessage,
      durationMs: op.durationMs,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/operations/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    await requestCancel(String(req.params.id), req.user!.id);
    ok(res, { cancelled: true });
  } catch (error) {
    next(error);
  }
});

export default router;
