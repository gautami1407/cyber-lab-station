import type { Prisma, User } from "@prisma/client";
import { prisma } from "../prisma.js";
import { hashValue, maskTarget } from "../lib/crypto.js";

export async function audit(params: {
  userId?: string;
  action: string;
  success: boolean;
  target?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      success: params.success,
      targetMasked: params.target ? maskTarget(params.target) : null,
      ipHash: params.ip ? hashValue(params.ip) : null,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listAuditLogs(userId: string) {
  return prisma.auditLog.findMany({
    where: { userId },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0]!.trim();
  return req.ip ?? "0.0.0.0";
}

export function userAgent(req: { headers: Record<string, unknown> }): string {
  const value = req.headers["user-agent"];
  return typeof value === "string" ? value.slice(0, 240) : "unknown";
}

export function parseDevice(ua: string): string {
  const browser = ua.includes("Firefox")
    ? "Firefox"
    : ua.includes("Edg")
      ? "Edge"
      : ua.includes("Chrome")
        ? "Chrome"
        : ua.includes("Safari")
          ? "Safari"
          : "Browser";
  const os = ua.includes("Windows")
    ? "Windows"
    : ua.includes("Mac")
      ? "macOS"
      : ua.includes("Linux")
        ? "Linux"
        : ua.includes("Android")
          ? "Android"
          : ua.includes("iPhone")
            ? "iPhone"
            : "Unknown OS";
  return `${browser} · ${os}`;
}

export type AuthedUser = Pick<User, "id" | "username" | "email" | "role" | "createdAt">;
