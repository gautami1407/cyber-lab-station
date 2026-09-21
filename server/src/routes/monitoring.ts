import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { ok } from "../middleware/error.js";
import { clientIp } from "../services/audit.js";
import { getMonitoringStatus, listAlerts, listEvents, startMonitoring, stopMonitoring, updateAlert } from "../services/monitoring.js";

const router = Router();

router.get("/monitoring/status", requireAuth, async (req, res, next) => {
  try { ok(res, await getMonitoringStatus(req.user!.id)); } catch (error) { next(error); }
});

router.post("/monitoring/start", requireAuth, requireUser, async (req, res, next) => {
  try {
    const body = z.object({ intervalSeconds: z.number().int().min(15).max(3600).default(60) }).strict().parse(req.body);
    ok(res, await startMonitoring(req.user!.id, body.intervalSeconds, clientIp(req)));
  } catch (error) { next(error); }
});

router.post("/monitoring/stop", requireAuth, requireUser, async (req, res, next) => {
  try { ok(res, await stopMonitoring(req.user!.id, clientIp(req))); } catch (error) { next(error); }
});

router.get("/events", requireAuth, async (req, res, next) => {
  try { ok(res, await listEvents(req.user!.id)); } catch (error) { next(error); }
});

router.get("/alerts", requireAuth, async (req, res, next) => {
  try { ok(res, await listAlerts(req.user!.id)); } catch (error) { next(error); }
});

router.patch("/alerts/:id", requireAuth, requireUser, async (req, res, next) => {
  try {
    const body = z.object({ status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]) }).strict().parse(req.body);
    ok(res, await updateAlert(req.user!.id, String(req.params.id), body.status, clientIp(req)));
  } catch (error) { next(error); }
});

export default router;
