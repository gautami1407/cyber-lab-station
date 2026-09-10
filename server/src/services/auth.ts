import argon2 from "argon2";
import type { Request, Response } from "express";
import { config, isProduction } from "../config.js";
import { Errors } from "../errors.js";
import { hashValue, maskIp, maskSessionLabel } from "../lib/crypto.js";
import { evaluatePasswordPolicy } from "../lib/password.js";
import { prisma } from "../prisma.js";
import { audit, clientIp, parseDevice, userAgent } from "./audit.js";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: config.sessionAbsoluteHours * 60 * 60 * 1000,
  };
}

export async function registerUser(req: Request, res: Response) {
  const username = String(req.body?.username ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const confirmPassword = String(req.body?.confirmPassword ?? "");
  const ip = clientIp(req);

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw Errors.validation();
  }
  if (password !== confirmPassword) throw Errors.validation("Passwords do not match.");
  if (!evaluatePasswordPolicy(password).ok) throw Errors.validation("Password does not meet policy requirements.");

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) throw Errors.conflict("An account with those details already exists.");

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: { username, email, passwordHash, role: "user" },
  });
  await audit({ userId: user.id, action: "USER_REGISTERED", success: true, ip });
  const session = await createSession(user.id, req);
  res.cookie(config.cookieName, session.id, cookieOptions());
  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function loginUser(req: Request, res: Response) {
  const identifier = String(req.body?.identifier ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const ip = clientIp(req);
  if (!identifier || !password) throw Errors.invalidCredentials();

  const recent = await prisma.loginAttempt.count({
    where: { ipHash: hashValue(ip), createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent >= 5) throw Errors.rateLimited();

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
  });

  await prisma.loginAttempt.create({
    data: { identifierHash: hashValue(identifier), ipHash: hashValue(ip), success: false },
  });

  if (!user) {
    await audit({ action: "LOGIN_FAILED", success: false, ip });
    throw Errors.invalidCredentials();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ userId: user.id, action: "LOGIN_FAILED", success: false, ip });
    throw Errors.locked();
  }

  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!ok) {
    const failedLoginCount = user.failedLoginCount + 1;
    const lockedUntil =
      failedLoginCount >= config.loginMaxAttempts
        ? new Date(Date.now() + config.lockoutMinutes * 60_000)
        : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount, lockedUntil },
    });
    await audit({ userId: user.id, action: "LOGIN_FAILED", success: false, ip });
    if (lockedUntil) throw Errors.locked();
    throw Errors.invalidCredentials();
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
  await prisma.loginAttempt.create({
    data: { identifierHash: hashValue(identifier), ipHash: hashValue(ip), success: true },
  });
  const session = await createSession(user.id, req);
  res.cookie(config.cookieName, session.id, cookieOptions());
  await audit({ userId: user.id, action: "LOGIN_SUCCESS", success: true, ip });
  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

async function createSession(userId: string, req: Request) {
  const now = new Date();
  return prisma.session.create({
    data: {
      userId,
      userAgent: userAgent(req),
      ipHash: hashValue(clientIp(req)),
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + config.sessionIdleMinutes * 60_000),
      absoluteExpiry: new Date(now.getTime() + config.sessionAbsoluteHours * 60 * 60_000),
    },
  });
}

export async function logout(req: Request, res: Response) {
  const sid = req.cookies?.[config.cookieName];
  if (sid) {
    const session = await prisma.session.findUnique({ where: { id: sid } });
    if (session && !session.revokedAt) {
      await prisma.session.update({ where: { id: sid }, data: { revokedAt: new Date() } });
      await audit({ userId: session.userId, action: "LOGOUT", success: true, ip: clientIp(req) });
    }
  }
  res.clearCookie(config.cookieName, { path: "/" });
}

export async function logoutAll(userId: string, ip: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit({ userId, action: "SESSION_REVOKED", success: true, ip, metadata: { scope: "all" } });
}

export async function revokeSession(userId: string, publicId: string, ip: string) {
  const session = await prisma.session.findFirst({ where: { publicId, userId } });
  if (!session) throw Errors.notFound();
  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await audit({ userId, action: "SESSION_REVOKED", success: true, ip });
}

export async function listSessions(userId: string, currentId: string, ip: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, absoluteExpiry: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return sessions.map((session) => toSessionDto(session, currentId, ip));
}

export function toSessionDto(
  session: {
    publicId: string;
    createdAt: Date;
    lastActivityAt: Date;
    expiresAt: Date;
    userAgent: string;
    id: string;
  },
  currentId: string,
  ip: string,
) {
  const remaining = session.expiresAt.getTime() - Date.now();
  return {
    id: session.publicId,
    sessionId: maskSessionLabel(session.publicId),
    status: remaining < 5 * 60_000 ? "expiring" : "active",
    loginTime: session.createdAt.toISOString(),
    lastActivity: session.lastActivityAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    device: parseDevice(session.userAgent),
    ipAddress: maskIp(ip),
    current: session.id === currentId,
  };
}

export async function touchSession(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!session || session.revokedAt) return null;
  const now = new Date();
  if (session.absoluteExpiry <= now || session.expiresAt <= now) return null;
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + config.sessionIdleMinutes * 60_000),
    },
    include: { user: true },
  });
  return updated;
}
