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
  if (!allowedOrigins.has(origin)) return next(Errors.forbidden());
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
