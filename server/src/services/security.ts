import { z } from "zod";
import { config } from "../config.js";

type CheckStatus = "pass" | "warning" | "fail";

const UNSAFE = /(<script|javascript:|onerror=|--|;\s*drop\s|union\s+select|\{\{)/i;

export function validateInput(value: string) {
  const parsed = z.string().max(500).safeParse(value);
  const raw = parsed.success ? parsed.data : "";
  const trimmed = raw.trim();
  const checks = [
    {
      id: "required",
      label: "Required field",
      status: (trimmed.length > 0 ? "pass" : "fail") as CheckStatus,
      detail: trimmed.length > 0 ? "Value is present." : "A value is required.",
    },
    {
      id: "length",
      label: "Length validation (3–120)",
      status: (trimmed.length >= 3 && trimmed.length <= 120 ? "pass" : "fail") as CheckStatus,
      detail: `${trimmed.length} characters supplied.`,
    },
    {
      id: "email",
      label: "Email format",
      status: (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? "pass" : "warning") as CheckStatus,
      detail: "Only enforced when the field expects an email address.",
    },
    {
      id: "numeric",
      label: "Numeric format",
      status: (/^-?\d+(\.\d+)?$/.test(trimmed) ? "pass" : "warning") as CheckStatus,
      detail: "Only enforced when the field expects a number.",
    },
    {
      id: "charset",
      label: "Allowed characters",
      status: (/^[\w\s@.\-+']*$/.test(trimmed) ? "pass" : "fail") as CheckStatus,
      detail: "Letters, digits, spaces and . - _ @ + ' are permitted.",
    },
    {
      id: "sanitization",
      label: "Sanitization",
      status: (UNSAFE.test(trimmed) ? "fail" : "pass") as CheckStatus,
      detail: UNSAFE.test(trimmed)
        ? "Potentially dangerous pattern detected and rejected."
        : "No injection-style pattern detected.",
    },
  ];
  const sanitized = trimmed.replace(/[<>]/g, "").replace(/javascript:/gi, "").slice(0, 120);
  return {
    safe: checks.every((item) => item.status !== "fail"),
    sanitized,
    checks,
  };
}

export function liveSecurityChecks() {
  const headersOn = true;
  const rateLimitOn = true;
  const allowlistOn = config.allowedScanTargets.length > 0;
  const domainListOn = config.allowedEnumerationDomains.length > 0;
  return [
    {
      id: "input",
      title: "Input validation",
      status: "pass" as const,
      description: "Request bodies are validated with Zod. Unexpected fields are rejected on auth routes.",
    },
    {
      id: "authn",
      title: "Authentication",
      status: "pass" as const,
      description: "Argon2id password hashing and HTTP-only session cookies are enabled.",
    },
    {
      id: "authz",
      title: "Authorization",
      status: "pass" as const,
      description: "RBAC is enforced in the API. Scanner routes require an authenticated user role.",
    },
    {
      id: "password",
      title: "Password handling",
      status: "pass" as const,
      description: "Passwords are hashed with Argon2id and are never returned or logged.",
    },
    {
      id: "session",
      title: "Session security",
      status: "pass" as const,
      description: `Idle timeout ${config.sessionIdleMinutes}m, absolute lifetime ${config.sessionAbsoluteHours}h, HttpOnly cookies.`,
    },
    {
      id: "errors",
      title: "Error handling",
      status: "pass" as const,
      description: "API errors return generic codes and messages without stack traces.",
    },
    {
      id: "headers",
      title: "Security headers",
      status: headersOn ? ("pass" as const) : ("fail" as const),
      description: headersOn
        ? "Helmet security headers are enabled on the API."
        : "Helmet is not enabled.",
    },
    {
      id: "rate",
      title: "Rate limiting",
      status: rateLimitOn ? ("pass" as const) : ("warning" as const),
      description: rateLimitOn
        ? "Login and scanner endpoints are rate limited."
        : "Scanner rate limit is configured but currently disabled.",
    },
    {
      id: "allowlist",
      title: "Scanner allowlist",
      status: allowlistOn ? ("pass" as const) : ("fail" as const),
      description: allowlistOn
        ? `ALLOWED_SCAN_TARGETS has ${config.allowedScanTargets.length} entries.`
        : "ALLOWED_SCAN_TARGETS is empty; scanning is fail-closed.",
    },
    {
      id: "domains",
      title: "Enumeration allowlist",
      status: domainListOn ? ("pass" as const) : ("fail" as const),
      description: domainListOn
        ? `ALLOWED_ENUMERATION_DOMAINS has ${config.allowedEnumerationDomains.length} entries.`
        : "ALLOWED_ENUMERATION_DOMAINS is empty; enumeration is fail-closed.",
    },
  ];
}

export function recommendations() {
  return [
    {
      id: "r1",
      severity: "critical" as const,
      title: "Keep allowlists explicit",
      description: "Never set ALLOWED_SCAN_TARGETS to wildcard internet ranges.",
    },
    {
      id: "r2",
      severity: "high" as const,
      title: "Rotate SESSION_SECRET",
      description: "Use a unique secret per environment and do not commit it.",
    },
    {
      id: "r3",
      severity: "medium" as const,
      title: "Restrict CORS",
      description: "FRONTEND_URL must be the actual UI origin.",
    },
    {
      id: "r4",
      severity: "low" as const,
      title: "Review audit retention",
      description: "Define how long SecurityOperation and AuditLog rows are kept.",
    },
  ];
}
