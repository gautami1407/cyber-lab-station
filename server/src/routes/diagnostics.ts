import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { ok } from "../middleware/error.js";
import { dnsResolve, latency, ping, traceroute } from "../services/diagnostics.js";

const router = Router();
const targetSchema = z.object({ target: z.string().min(1).max(253) }).strict();

router.post("/diagnostics/ping", requireAuth, requireUser, async (req, res, next) => {
  try {
    const body = targetSchema.extend({ count: z.number().int().min(1).max(10).optional() }).parse(req.body);
    ok(res, await ping(req.user!.id, body.target, body.count));
  } catch (error) {
    next(error);
  }
});

router.post("/diagnostics/dns", requireAuth, requireUser, async (req, res, next) => {
  try {
    ok(res, await dnsResolve(req.user!.id, targetSchema.parse(req.body).target));
  } catch (error) {
    next(error);
  }
});

router.post("/diagnostics/traceroute", requireAuth, requireUser, async (req, res, next) => {
  try {
    ok(res, await traceroute(req.user!.id, targetSchema.parse(req.body).target));
  } catch (error) {
    next(error);
  }
});

router.post("/diagnostics/latency", requireAuth, requireUser, async (req, res, next) => {
  try {
    const body = targetSchema.extend({ samples: z.number().int().min(1).max(10).optional() }).parse(req.body);
    ok(res, await latency(req.user!.id, body.target, body.samples));
  } catch (error) {
    next(error);
  }
});

export default router;