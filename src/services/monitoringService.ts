import { request } from "./apiClient";

export type SecurityEvent = { id: string; type: string; severity: string; description: string; createdAt: string; device: { ipAddress: string; hostname: string | null } | null };
export type SecurityAlert = { id: string; severity: string; status: string; title: string; explanation: string; createdAt: string; device: { ipAddress: string; hostname: string | null } | null };
export type MonitoringStatus = { enabled: boolean; intervalSeconds: number; startedAt: string | null } | null;

export const monitoringService = {
  status: () => request<MonitoringStatus>("/monitoring/status"),
  start: (intervalSeconds = 15) => request<MonitoringStatus>("/monitoring/start", { method: "POST", body: { intervalSeconds } }),
  stop: () => request<MonitoringStatus>("/monitoring/stop", { method: "POST", body: {} }),
  events: () => request<SecurityEvent[]>("/events"),
  alerts: () => request<SecurityAlert[]>("/alerts"),
  updateAlert: (id: string, status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED") => request<SecurityAlert>(`/alerts/${id}`, { method: "PATCH", body: { status } }),
};