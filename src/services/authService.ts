import { delay } from "./apiClient";
import { mockSession } from "@/data/mock";
import type {
  AuthResponse,
  LoginRequest,
  PasswordStrengthResult,
  RegisterRequest,
  SessionInfo,
} from "@/types";

/**
 * authService — future endpoints:
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   GET  /api/auth/session
 *
 * No credential handling, hashing or persistence happens in the frontend.
 * Passwords are never logged, stored or echoed.
 */

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const requirements = [
    { id: "length", label: "At least 12 characters", met: password.length >= 12 },
    { id: "upper", label: "One uppercase letter (A–Z)", met: /[A-Z]/.test(password) },
    { id: "lower", label: "One lowercase letter (a–z)", met: /[a-z]/.test(password) },
    { id: "number", label: "One number (0–9)", met: /[0-9]/.test(password) },
    { id: "special", label: "One special character (!@#$…)", met: /[^A-Za-z0-9]/.test(password) },
  ];

  const met = requirements.filter((r) => r.met).length;
  const score = (password.length === 0 ? 0 : Math.max(0, met - 1)) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Very Weak", "Weak", "Medium", "Strong", "Very Strong"] as const;

  return { score, label: labels[score], requirements };
}

export const authService = {
  async register(payload: RegisterRequest): Promise<AuthResponse> {
    await delay(900);
    if (payload.password !== payload.confirmPassword) {
      throw new Error("Passwords do not match.");
    }
    return {
      userId: "usr_demo_0001",
      username: payload.username,
      email: payload.email,
      createdAt: new Date().toISOString(),
    };
  },

  async login(payload: LoginRequest): Promise<AuthResponse> {
    await delay(900);
    if (!payload.identifier || !payload.password) {
      throw new Error("Invalid credentials. Please check your details and try again.");
    }
    return {
      userId: "usr_demo_0001",
      username: payload.identifier,
      email: "analyst@cyberlab.demo",
      createdAt: new Date().toISOString(),
    };
  },

  async getSession(): Promise<SessionInfo> {
    await delay(500);
    return mockSession;
  },

  async refreshSession(): Promise<SessionInfo> {
    await delay(700);
    const now = new Date();
    return {
      ...mockSession,
      lastActivity: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      status: "active",
    };
  },

  async logout(): Promise<void> {
    await delay(500);
  },

  async logoutAll(): Promise<void> {
    await delay(700);
  },
};
