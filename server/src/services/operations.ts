import { prisma } from "../prisma.js";
import type { OperationStatus, OperationType, Prisma } from "@prisma/client";
import { hashValue, maskTarget } from "../lib/crypto.js";

export async function createOperation(params: {
  userId: string;
  type: OperationType;
  project: string;
  operation: string;
  target: string;
  total: number;
}) {
  return prisma.securityOperation.create({
    data: {
      userId: params.userId,
      type: params.type,
      project: params.project,
      operation: params.operation,
      targetMasked: maskTarget(params.target),
      targetHash: hashValue(params.target),
      status: "queued",
      progressTotal: params.total,
    },
  });
}

export async function getOperation(id: string, userId: string) {
  return prisma.securityOperation.findFirst({ where: { id, userId } });
}

export async function requestCancel(id: string, userId: string) {
  return prisma.securityOperation.updateMany({
    where: { id, userId, status: { in: ["queued", "running"] } },
    data: { cancelRequested: true, status: "cancelled", completedAt: new Date() },
  });
}

export async function markRunning(id: string) {
  return prisma.securityOperation.update({
    where: { id },
    data: { status: "running", startedAt: new Date() },
  });
}

export async function updateProgress(id: string, done: number) {
  return prisma.securityOperation.update({
    where: { id },
    data: { progressDone: done },
  });
}

export async function finishOperation(
  id: string,
  status: Extract<OperationStatus, "completed" | "failed" | "cancelled">,
  result: Prisma.InputJsonValue | undefined,
  error?: { code: string; message: string },
) {
  const current = await prisma.securityOperation.findUnique({ where: { id } });
  const started = current?.startedAt ?? current?.createdAt ?? new Date();
  const completedAt = new Date();
  return prisma.securityOperation.update({
    where: { id },
    data: {
      status,
      resultJson: result,
      errorCode: error?.code,
      errorMessage: error?.message,
      completedAt,
      durationMs: completedAt.getTime() - started.getTime(),
      progressDone: current?.progressTotal ?? 0,
    },
  });
}

export function wasCancelled(id: string) {
  return prisma.securityOperation.findUnique({ where: { id } }).then((row) => Boolean(row?.cancelRequested));
}
