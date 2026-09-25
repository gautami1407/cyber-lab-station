import { randomUUID } from "node:crypto";
import { Errors } from "../errors.js";
import { prisma } from "../prisma.js";
import { audit } from "./audit.js";
import { config } from "../config.js";
import { isAgentConnecting, queuePendingAgentOperation, sendAgentOperation, startFilePushToAgent } from "../realtime.js";

const SAFE_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function normalizeRemotePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw Errors.validation("A remote file path is required.");
  const decoded = (() => {
    try { return decodeURIComponent(trimmed); } catch { return trimmed; }
  })();
  const normalized = decoded.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.startsWith("\\") || /^[A-Za-z]:\//.test(normalized)) {
    throw Errors.validation("Absolute paths are not allowed for remote transfers.");
  }
  if (normalized.includes("..") || normalized.includes("\\0") || normalized.includes("\0")) {
    throw Errors.validation("Path traversal is not allowed for remote transfers.");
  }
  if (/%2e%2e/i.test(trimmed) || /%2f/i.test(trimmed) || /%5c/i.test(trimmed)) {
    throw Errors.validation("Encoded path traversal is not allowed for remote transfers.");
  }
  if (normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw Errors.validation("Remote transfer paths must remain within the approved relative directory.");
  }
  return normalized;
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return clean || "file";
}

export function assertSafeUploadFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) throw Errors.validation("A file name is required.");
  const decoded = (() => {
    try { return decodeURIComponent(trimmed); } catch { return trimmed; }
  })();
  const normalized = decoded.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) throw Errors.validation("Absolute paths are not allowed for uploads.");
  if (normalized.includes("..") || normalized.includes("/") && normalized.split("/").some((segment) => segment === "..")) {
    throw Errors.validation("File names cannot contain path traversal segments.");
  }
  return sanitizeFileName(normalized);
}

function stripPadding(value: string) {
  return value.replace(/=+$/, "");
}

export function decodeContentBase64(contentBase64: string): Buffer {
  const trimmed = contentBase64.trim();
  if (!trimmed || trimmed.length === 0) throw Errors.validation("File content is required.");
  if (!SAFE_BASE64.test(trimmed)) throw Errors.validation("File content is not valid base64.");
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.length < 1) throw Errors.validation("File content is empty after decoding.");
  if (bytes.length > config.fileTransferMaxBytes) throw Errors.validation(`File exceeds the ${config.fileTransferMaxBytes}-byte transfer limit.`);
  if (stripPadding(bytes.toString("base64")) !== stripPadding(trimmed)) throw Errors.validation("File content is not valid base64.");
  return bytes;
}

export function listFileTransfers(userId: string) {
  return prisma.fileTransfer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
}

async function assertAuthorizedPairAndSession(userId: string, pairedDeviceId: string, sessionId: string | undefined) {
  if (!sessionId) throw Errors.validation("A remote session is required for file transfers.");
  const paired = await prisma.pairedDevice.findFirst({ where: { id: pairedDeviceId, userId, status: "PAIRED" } });
  if (!paired) throw Errors.forbidden();
  const session = await prisma.remoteSession.findFirst({ where: { id: sessionId, userId, pairedDeviceId, status: "ACTIVE" } });
  if (!session) throw Errors.forbidden();
  return { paired, session };
}

export async function requestFileDownload(userId: string, pairedDeviceId: string, sessionId: string, remotePath: string, ip: string) {
  if (remotePath.length < 1 || remotePath.length > 4096) throw Errors.validation("A remote file path is required.");
  const safeRemotePath = normalizeRemotePath(remotePath);
  const safeName = sanitizeFileName(safeRemotePath);
  await assertAuthorizedPairAndSession(userId, pairedDeviceId, sessionId);
  const operation = await prisma.remoteOperation.create({ data: { userId, pairedDeviceId, sessionId, operation: "FILE_DOWNLOAD", status: "QUEUED" } });
  const transfer = await prisma.fileTransfer.create({ data: { userId, pairedDeviceId, direction: "OUT", safeName, status: "QUEUED", remotePath: safeRemotePath, operationId: operation.id } });
  const delivered = sendAgentOperation(pairedDeviceId, operation.id, sessionId, "FILE_DOWNLOAD", undefined, { transferId: transfer.id, path: remotePath });
  if (!delivered) {
    if (isAgentConnecting(pairedDeviceId)) {
      queuePendingAgentOperation({
        pairedDeviceId,
        operationId: operation.id,
        sessionId,
        operation: "FILE_DOWNLOAD",
        userId,
        extra: { transferId: transfer.id, path: remotePath },
        onExpired: async () => {
          await prisma.fileTransfer.update({ where: { id: transfer.id }, data: { status: "REJECTED", reason: "No authenticated NetLink agent is connected." } }).catch(() => undefined);
        },
      });
      await audit({ userId, action: "REMOTE_OPERATION_QUEUED", success: true, target: operation.id, ip, metadata: { operation: "FILE_DOWNLOAD" } });
      return { transferId: transfer.id, operationId: operation.id, status: "QUEUED" };
    }
    await prisma.remoteOperation.update({ where: { id: operation.id }, data: { status: "REJECTED", reason: "No authenticated NetLink agent is connected." } });
    await prisma.fileTransfer.update({ where: { id: transfer.id }, data: { status: "REJECTED", reason: "No authenticated NetLink agent is connected." } });
    await audit({ userId, action: "REMOTE_OPERATION_REJECTED", success: false, target: operation.id, ip, metadata: { operation: "FILE_DOWNLOAD" } });
    return { transferId: transfer.id, operationId: operation.id, status: "REJECTED" };
  }
  await audit({ userId, action: "FILE_DOWNLOAD_REQUESTED", success: true, target: transfer.id, ip, metadata: { safeName, remotePath } });
  return { transferId: transfer.id, operationId: operation.id, status: "QUEUED" };
}
export async function requestFileUpload(userId: string, pairedDeviceId: string, sessionId: string, fileName: string, contentBase64: string, ip: string) {
  const safeName = assertSafeUploadFileName(fileName);
  const bytes = decodeContentBase64(contentBase64);
  await assertAuthorizedPairAndSession(userId, pairedDeviceId, sessionId);
  const canonical = bytes.toString("base64");
  const totalChunks = Math.ceil(canonical.length / config.fileTransferChunkBytes);
  if (totalChunks > Math.ceil(config.fileTransferMaxBytes / config.fileTransferChunkBytes)) throw Errors.validation("File is too large to transfer.");
  const transferId = randomUUID();
  const operation = await prisma.remoteOperation.create({ data: { userId, pairedDeviceId, sessionId, operation: "FILE_UPLOAD", status: "QUEUED" } });
  const transfer = await prisma.fileTransfer.create({ data: { id: transferId, userId, pairedDeviceId, direction: "IN", safeName, status: "QUEUED", sizeBytes: bytes.length, operationId: operation.id } });
  const outcome = startFilePushToAgent({
    operationId: operation.id,
    transferId,
    pairedDeviceId,
    userId,
    safeName,
    byteLength: bytes.length,
    totalChunks,
    base64: canonical,
  });
  if (outcome === "QUEUED") {
    queuePendingAgentOperation({
      pairedDeviceId,
      operationId: operation.id,
      sessionId,
      operation: "FILE_UPLOAD",
      userId,
      extra: { transferId, safeName, byteLength: bytes.length, totalChunks },
      onExpired: async () => {
        await prisma.fileTransfer.update({ where: { id: transferId }, data: { status: "REJECTED", reason: "No authenticated NetLink agent is connected." } }).catch(() => undefined);
      },
    });
    await audit({ userId, action: "REMOTE_OPERATION_QUEUED", success: true, target: operation.id, ip, metadata: { operation: "FILE_UPLOAD" } });
    return { transferId, operationId: operation.id, status: "QUEUED" };
  }
  if (outcome === "REJECTED") {
    await prisma.remoteOperation.update({ where: { id: operation.id }, data: { status: "REJECTED", reason: "No authenticated NetLink agent is connected." } });
    await prisma.fileTransfer.update({ where: { id: transferId }, data: { status: "REJECTED", reason: "No authenticated NetLink agent is connected." } });
    await audit({ userId, action: "REMOTE_OPERATION_REJECTED", success: false, target: operation.id, ip, metadata: { operation: "FILE_UPLOAD" } });
    return { transferId, operationId: operation.id, status: "REJECTED" };
  }
  await audit({ userId, action: "FILE_UPLOAD_REQUESTED", success: true, target: transferId, ip, metadata: { safeName, byteLength: bytes.length } });
  return { transferId, operationId: operation.id, status: "QUEUED" };
}