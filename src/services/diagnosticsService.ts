import { request } from "./apiClient";

export type DiagnosticMethod = "ping" | "dns" | "traceroute" | "latency";

export const diagnosticsService = {
  run(method: DiagnosticMethod, target: string) {
    const body = method === "ping" ? { target, count: 4 } : method === "latency" ? { target, samples: 4 } : { target };
    return request<Record<string, unknown>>(`/diagnostics/${method}`, { method: "POST", body });
  },
};