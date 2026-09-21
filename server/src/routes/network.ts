import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { ok } from "../middleware/error.js";
import { clientIp } from "../services/audit.js";
import {
  authorizeNetwork,
  discoverDevices,
  getDevice,
  listAuthorizedNetworks,
  listDevices,
  listLocalInterfaces,
  revokeNetwork,
  getTopology,
} from "../services/network.js";
import { startDeviceServiceScan } from "../services/scanner.js";

const router = Router();

router.get("/networks/interfaces", requireAuth, (_req, res) => ok(res, listLocalInterfaces()));

router.get("/networks", requireAuth, async (req, res, next) => {
  try {
    ok(res, await listAuthorizedNetworks(req.user!.id));
  } catch (error) {
    next(error);
  }
});

router.post("/networks/authorize", requireAuth, requireUser, async (req, res, next) => {
  try {
    const body = z
      .object({ interfaceName: z.string().min(1).max(128), ipv4Address: z.string().ip({ version: "v4" }), cidr: z.string().regex(/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/) })
      .strict()
      .parse(req.body);
    ok(res, await authorizeNetwork({ ...body, userId: req.user!.id, ip: clientIp(req) }), 201);
  } catch (error) {
    next(error);
  }
});

router.delete("/networks/:id", requireAuth, requireUser, async (req, res, next) => {
  try {
    ok(res, await revokeNetwork(req.user!.id, String(req.params.id), clientIp(req)));
  } catch (error) {
    next(error);
  }
});

router.post("/networks/:id/discover", requireAuth, requireUser, async (req, res, next) => {
  try {
    ok(res, { devices: await discoverDevices(req.user!.id, String(req.params.id), clientIp(req)) }, 202);
  } catch (error) {
    next(error);
  }
});

router.post("/devices/:id/services/scan", requireAuth, requireUser, async (req, res, next) => {
  try {
    const body = z
      .object({ startPort: z.number().int(), endPort: z.number().int(), profile: z.enum(["common", "web", "custom"]).default("common") })
      .strict()
      .parse(req.body);
    ok(res, await startDeviceServiceScan({ ...body, deviceId: String(req.params.id), userId: req.user!.id, ip: clientIp(req) }), 202);
  } catch (error) {
    next(error);
  }
});

router.get("/devices", requireAuth, async (req, res, next) => {
  try {
    ok(res, await listDevices(req.user!.id));
  } catch (error) {
    next(error);
  }
});

router.get("/devices/:id", requireAuth, async (req, res, next) => {
  try {
    ok(res, await getDevice(req.user!.id, String(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get("/topology", requireAuth, async (req, res, next) => {
  try {
    ok(res, await getTopology(req.user!.id));
  } catch (error) {
    next(error);
  }
});

export default router;