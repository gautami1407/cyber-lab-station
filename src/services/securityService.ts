import { request } from "./apiClient";
import type {
  ActivityEntry,
  HealthStatus,
  Recommendation,
  SecurityCheck,
  ValidationResponse,
} from "@/types";

export const securityService = {
  validateInput(value: string) {
    return request<ValidationResponse>("/security/validate-input", {
      method: "POST",
      body: { value },
    });
  },
  getChecks() {
    return request<SecurityCheck[]>("/security/checks");
  },
  getRecommendations() {
    return request<Recommendation[]>("/security/recommendations");
  },
  getActivity(params: Record<string, string | number> = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== "" && value !== "all") search.set(key, String(value));
    }
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<{ total: number; page: number; rows: ActivityEntry[] }>(`/activity${suffix}`);
  },
  getDashboard() {
    return request<{
      projects: number;
      securityControls: number;
      recentOperations: number;
      successful: number;
      failed: number;
      database: boolean;
      recent: Array<{
        id: string;
        time: string;
        project: string;
        operation: string;
        target: string;
        status: string;
        durationMs: number;
      }>;
    }>("/dashboard");
  },
  getHealth() {
    return request<HealthStatus>("/health");
  },
  getPublicSettings() {
    return request<{
      apiVersion: string;
      environment: string;
      labMode: boolean;
      sessionIdleMinutes: number;
      sessionAbsoluteHours: number;
      allowedTargetCount: number;
      allowedDomainCount: number;
    }>("/settings/public");
  },
  getRbac() {
    return request<{
      role: "guest" | "user" | "moderator" | "admin";
      matrix: Record<string, Record<string, boolean>>;
    }>("/security/rbac");
  },
};
