import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { isProduction } from "../config.js";
import { AppError } from "../errors.js";

export const CSRF_COOKIE = "cyberlab.csrf";
export const CSRF_HEADER = "x-csrf-token";

export function issueCsrfToken(res: Response): string {
  const token = randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  });
  return token;
}

export function csrfProtect(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  const token = Array.isArray(header) ? header[0] : header;
  if (!cookie || !token || cookie !== token) {
    return next(new AppError(403, "CSRF_REJECTED", "The request could not be verified. Refresh and try again."));
  }
  next();
}
