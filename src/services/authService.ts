import { request } from "./apiClient";
import type {
  AuthResponse,
  LoginRequest,
  PasswordStrengthResult,
  RegisterRequest,
  SessionInfo,
} from "@/types";

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
  return { score, label: labels[score] ?? "Very Weak", requirements };
}

export const authService = {
  register(payload: RegisterRequest) {
    return request<AuthResponse>("/auth/register", { method: "POST", body: payload });
  },
  login(payload: LoginRequest) {
    return request<AuthResponse>("/auth/login", { method: "POST", body: payload });
  },
  logout() {
    return request<void>("/auth/logout", { method: "POST" });
  },
  getMe() {
    return request<{ user: AuthResponse; session: SessionInfo }>("/auth/session");
  },
  getSession() {
    return request<{ user: AuthResponse; session: SessionInfo }>("/auth/session").then((row) => row.session);
  },
  listSessions() {
    return request<SessionInfo[]>("/auth/sessions");
  },
  refreshSession() {
    return request<SessionInfo>("/auth/session/refresh", { method: "POST" });
  },
  revokeSession(id: string) {
    return request<void>(`/auth/sessions/${id}`, { method: "DELETE" });
  },
  logoutAll() {
    return request<void>("/auth/logout-all", { method: "POST" });
  },
};
