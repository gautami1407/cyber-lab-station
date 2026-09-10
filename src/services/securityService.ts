import { delay } from "./apiClient";
import { appSecurityChecks, mockActivity, recommendations } from "@/data/mock";
import type {
  ActivityEntry,
  Recommendation,
  SecurityCheck,
  ValidationCheck,
  ValidationResponse,
} from "@/types";

/**
 * securityService — future endpoints:
 *   POST /api/security/validate
 *   GET  /api/activity
 */

const UNSAFE_PATTERN = /(<script|javascript:|onerror=|--|;\s*drop\s|union\s+select|\{\{)/i;

export const securityService = {
  /** Client-side illustration only; the backend must re-validate everything. */
  validateInput(value: string): ValidationResponse {
    const trimmed = value.trim();
    const checks: ValidationCheck[] = [
      {
        id: "required",
        label: "Required field",
        status: trimmed.length > 0 ? "pass" : "fail",
        detail: trimmed.length > 0 ? "Value is present." : "A value is required.",
      },
      {
        id: "length",
        label: "Length validation (3–120)",
        status: trimmed.length >= 3 && trimmed.length <= 120 ? "pass" : "fail",
        detail: `${trimmed.length} characters supplied.`,
      },
      {
        id: "email",
        label: "Email format",
        status: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? "pass" : "warning",
        detail: "Only enforced when the field expects an email address.",
      },
      {
        id: "numeric",
        label: "Numeric format",
        status: /^-?\d+(\.\d+)?$/.test(trimmed) ? "pass" : "warning",
        detail: "Only enforced when the field expects a number.",
      },
      {
        id: "charset",
        label: "Allowed characters",
        status: /^[\w\s@.\-+']*$/.test(trimmed) ? "pass" : "fail",
        detail: "Letters, digits, spaces and . - _ @ + ' are permitted.",
      },
      {
        id: "sanitization",
        label: "Sanitization",
        status: UNSAFE_PATTERN.test(trimmed) ? "fail" : "pass",
        detail: UNSAFE_PATTERN.test(trimmed)
          ? "Potentially dangerous pattern detected and neutralised."
          : "No injection-style pattern detected.",
      },
    ];

    const sanitized = trimmed
      .replace(/[<>]/g, "")
      .replace(/javascript:/gi, "")
      .slice(0, 120);

    return {
      safe: checks.every((c) => c.status !== "fail"),
      sanitized,
      checks,
    };
  },

  async getChecks(): Promise<SecurityCheck[]> {
    await delay(300);
    return appSecurityChecks;
  },

  async getRecommendations(): Promise<Recommendation[]> {
    await delay(300);
    return recommendations;
  },

  async getActivity(): Promise<ActivityEntry[]> {
    await delay(400);
    return mockActivity;
  },
};
