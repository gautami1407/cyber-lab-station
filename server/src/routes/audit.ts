import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { ok } from "../middleware/error.js";
import { listAuditLogs } from "../services/audit.js";

const router = Router();

router.get("/audit-logs", requireAuth, async (req, res, next) => {
  try {
    ok(res, await listAuditLogs(req.user!.id));
  } catch (error) {
    next(error);
  }
});

export default router;