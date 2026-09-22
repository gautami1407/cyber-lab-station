import { request } from "./apiClient";

export type AuditLog = {
  id: string;
  action: string;
  success: boolean;
  targetMasked: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  user: { id: string; username: string } | null;
};

export const auditService = {
  list: () => request<AuditLog[]>("/audit-logs"),
};