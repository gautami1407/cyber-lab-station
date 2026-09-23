import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { config } from "../config.js";
import { Errors } from "../errors.js";
import { touchSession } from "../services/auth.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const sid = req.cookies?.[config.cookieName];
    if (!sid) throw Errors.unauthorized();
    const session = await touchSession(sid);
    if (!session) throw Errors.unauthorized();
    req.user = {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      role: session.user.role,
      createdAt: session.user.createdAt,
    };
    req.sessionId = session.id;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Errors.unauthorized());
    if (!roles.includes(req.user.role)) return next(Errors.forbidden());
    next();
  };
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(Errors.unauthorized());
  if (req.user.role === "guest") return next(Errors.forbidden());
  next();
}

/**
 * A loopback origin is any http(s) origin whose hostname is localhost, the
 * loopback IPv4 address or the loopback IPv6 address. Browsers set the Origin
 * header themselves and cannot be tricked into emitting a loopback origin for
 * a remote page, so while we keep the explicit allowlist below for
 * compatibility (and for origins like the configured FRONTEND_URL), every
 * dev-server port on this machine is accepted without enumerating ports.
 */
function isLoopbackOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const hostname = parsed.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function csrfOrigin(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowedOrigins = new Set([
    config.frontendUrl,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ]);
  if (!allowedOrigins.has(origin) && !isLoopbackOrigin(origin)) return next(Errors.forbidden());
  next();
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        role: Role;
        createdAt: Date;
      };
      sessionId?: string;
    }
  }
}
