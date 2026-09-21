import { Errors } from "../errors.js";
import { prisma } from "../prisma.js";
import { audit } from "./audit.js";
import { disconnectAgent, sendAgentOperation } from "../realtime.js";

const ALLOWED_OPERATIONS = new Set(["GET_SYSTEM_INFO", "VIEW_SCREEN", "REMOTE_INPUT", "MEDIA_CONTROL", "FILE_UPLOAD", "FILE_DOWNLOAD"]);

export async function requestPairing(userId: string, deviceName: string, publicKey: string, ip: string) {
  const request = await prisma.pairingRequest.create({ data: { userId, deviceName, publicKey } });
  await audit({ userId, action: "PAIRING_REQUESTED", success: true, target: request.id, ip });
  return request;
}

export function listPairing(userId: string) {
  return prisma.pairingRequest.findMany({
    where: { userId },
    include: { pairedDevice: { include: { sessions: { where: { status: "ACTIVE" }, orderBy: { startedAt: "desc" }, take: 1 } } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function resolvePairing(userId: string, id: string, status: "APPROVED" | "REJECTED", ip: string) {
  const request = await prisma.pairingRequest.findFirst({ where: { id, userId, status: "PENDING" } });
  if (!request) throw Errors.notFound();
  const result = await prisma.$transaction(async (tx) => {
    const resolved = await tx.pairingRequest.update({ where: { id }, data: { status, resolvedAt: new Date() } });
    const paired = status === "APPROVED" ? await tx.pairedDevice.create({ data: { userId, requestId: id, deviceName: request.deviceName, publicKey: request.publicKey } }) : null;
    return { request: resolved, paired };
  });
  await audit({ userId, action: `PAIRING_${status}`, success: true, target: id, ip });
  return result;
}

export async function revokePairing(userId: string, id: string, ip: string) {
  const paired = await prisma.pairedDevice.findFirst({ where: { id, userId, status: "PAIRED" } });
  if (!paired) throw Errors.notFound();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.pairedDevice.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } });
    await tx.remoteSession.updateMany({ where: { pairedDeviceId: id, status: "ACTIVE" }, data: { status: "REVOKED", endedAt: new Date() } });
    return updated;
  });
  disconnectAgent(id);
  await audit({ userId, action: "PAIRING_REVOKED", success: true, target: id, ip });
  return result;
}

export async function startRemoteSession(userId: string, pairedDeviceId: string, ip: string) {
  const paired = await prisma.pairedDevice.findFirst({ where: { id: pairedDeviceId, userId, status: "PAIRED" } });
  if (!paired) throw Errors.forbidden();
  const session = await prisma.remoteSession.create({ data: { userId, pairedDeviceId } });
  await audit({ userId, action: "REMOTE_SESSION_STARTED", success: true, target: session.id, ip });
  return session;
}

export async function endRemoteSession(userId: string, sessionId: string, ip: string) {
  const session = await prisma.remoteSession.findFirst({ where: { id: sessionId, userId, status: "ACTIVE" } });
  if (!session) throw Errors.notFound();
  const ended = await prisma.remoteSession.update({ where: { id: sessionId }, data: { status: "ENDED", endedAt: new Date() } });
  await audit({ userId, action: "REMOTE_SESSION_ENDED", success: true, target: sessionId, ip });
  return ended;
}

export async function requestRemoteOperation(userId: string, pairedDeviceId: string, sessionId: string | undefined, operation: string, ip: string) {
  if (!ALLOWED_OPERATIONS.has(operation)) throw Errors.validation("Operation is not allowlisted.");
  const paired = await prisma.pairedDevice.findFirst({ where: { id: pairedDeviceId, userId, status: "PAIRED" } });
  if (!paired) throw Errors.forbidden();
  if (sessionId) {
    const session = await prisma.remoteSession.findFirst({ where: { id: sessionId, userId, pairedDeviceId, status: "ACTIVE" } });
    if (!session) throw Errors.forbidden();
  }
  const result = await prisma.remoteOperation.create({ data: { userId, pairedDeviceId, sessionId, operation, status: "QUEUED" } });
  if (!sendAgentOperation(pairedDeviceId, result.id, sessionId ?? "", operation)) {
    const rejected = await prisma.remoteOperation.update({ where: { id: result.id }, data: { status: "REJECTED", reason: "No authenticated NetLink agent is connected." } });
    await audit({ userId, action: "REMOTE_OPERATION_REJECTED", success: false, target: rejected.id, ip, metadata: { operation } });
    return rejected;
  }
  if (operation === "SCREEN_CAPTURE") await audit({ userId, action: "SCREEN_CAPTURE_REQUESTED", success: true, target: result.id, ip });
  await audit({ userId, action: "REMOTE_OPERATION_REQUESTED", success: true, target: result.id, ip, metadata: { operation } });
  return result;
}
