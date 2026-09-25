import { Router } from "express";
import { z } from "zod";
import { Errors } from "../errors.js";
import { requireAuth, requireUser } from "../middleware/auth.js";
import { ok } from "../middleware/error.js";
import { prisma } from "../prisma.js";
import { clientIp } from "../services/audit.js";
import { endRemoteSession, listPairing, requestPairing, requestRemoteOperation, resolvePairing, revokePairing, startRemoteSession } from "../services/pairing.js";

const router = Router();

router.get("/pairing", requireAuth, async (req, res, next) => { try { ok(res, await listPairing(req.user!.id)); } catch (error) { next(error); } });
router.post("/pairing/request", requireAuth, requireUser, async (req, res, next) => {
  try { const body = z.object({ deviceName: z.string().min(1).max(120), publicKey: z.string().min(32).max(4096) }).strict().parse(req.body); ok(res, await requestPairing(req.user!.id, body.deviceName, body.publicKey, clientIp(req)), 201); } catch (error) { next(error); }
});
router.post("/pairing/:id/approve", requireAuth, requireUser, async (req, res, next) => { try { ok(res, await resolvePairing(req.user!.id, String(req.params.id), "APPROVED", clientIp(req))); } catch (error) { next(error); } });
router.post("/pairing/:id/reject", requireAuth, requireUser, async (req, res, next) => { try { ok(res, await resolvePairing(req.user!.id, String(req.params.id), "REJECTED", clientIp(req))); } catch (error) { next(error); } });
router.delete("/pairing/:id", requireAuth, requireUser, async (req, res, next) => { try { ok(res, await revokePairing(req.user!.id, String(req.params.id), clientIp(req))); } catch (error) { next(error); } });
router.post("/remote/session", requireAuth, requireUser, async (req, res, next) => { try { const body = z.object({ pairedDeviceId: z.string() }).strict().parse(req.body); ok(res, await startRemoteSession(req.user!.id, body.pairedDeviceId, clientIp(req)), 201); } catch (error) { next(error); } });
router.post("/remote/session/:id/end", requireAuth, requireUser, async (req, res, next) => { try { ok(res, await endRemoteSession(req.user!.id, String(req.params.id), clientIp(req))); } catch (error) { next(error); } });
router.post("/remote/operation", requireAuth, requireUser, async (req, res, next) => { try { const body = z.object({ pairedDeviceId: z.string(), sessionId: z.string().optional(), operation: z.string() }).strict().parse(req.body); ok(res, await requestRemoteOperation(req.user!.id, body.pairedDeviceId, body.sessionId, body.operation, clientIp(req)), 202); } catch (error) { next(error); } });
import { getFileTransferBuffer, clearFileTransferBuffer } from "../realtime.js";
import { listFileTransfers, requestFileDownload, requestFileUpload } from "../services/fileTransfer.js";
router.get("/remote/operation/:id", requireAuth, async (req, res, next) => { try { const operation = await prisma.remoteOperation.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } }); if (!operation) throw Errors.notFound(); ok(res, operation); } catch (error) { next(error); } });

router.get("/file-transfer", requireAuth, async (req, res, next) => { try { ok(res, await listFileTransfers(req.user!.id)); } catch (error) { next(error); } });
router.post("/file-transfer/upload", requireAuth, requireUser, async (req, res, next) => {
  try {
    const body = z.object({ pairedDeviceId: z.string(), sessionId: z.string(), fileName: z.string().min(1).max(255), contentBase64: z.string().min(1).max(7 * 1024 * 1024) }).strict().parse(req.body);
    ok(res, await requestFileUpload(req.user!.id, body.pairedDeviceId, body.sessionId, body.fileName, body.contentBase64, clientIp(req)), 202);
  } catch (error) { next(error); }
});
router.post("/file-transfer/download", requireAuth, requireUser, async (req, res, next) => {
  try {
    const body = z.object({ pairedDeviceId: z.string(), sessionId: z.string(), path: z.string().min(1).max(4096) }).strict().parse(req.body);
    ok(res, await requestFileDownload(req.user!.id, body.pairedDeviceId, body.sessionId, body.path, clientIp(req)), 202);
  } catch (error) { next(error); }
});
router.get("/file-transfer/:id/content", requireAuth, async (req, res, next) => {
  try {
    const transfer = await prisma.fileTransfer.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
    if (!transfer || transfer.direction !== "OUT" || transfer.status !== "COMPLETED") throw Errors.notFound();
    const bytes = getFileTransferBuffer(transfer.id);
    if (!bytes) throw Errors.notFound();
    const safeName = transfer.safeName.replace(/["\\]/g, "_");
    res.set({ "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${safeName}"`, "Content-Length": String(bytes.length), "X-SHA256": transfer.sha256 ?? "" });
    res.send(bytes);
    clearFileTransferBuffer(transfer.id);
  } catch (error) { next(error); }
});

export default router;
