import { request } from "./apiClient";

export type Pairing = {
  id: string;
  deviceName: string;
  status: string;
  createdAt: string;
  pairedDevice: { id: string; deviceName: string; status: string; connectionStatus: string; lastSeen: string | null; lastHeartbeat: string | null; createdAt: string; sessions: Array<{ id: string; status: string; startedAt: string }> } | null;
};

export type RemoteOperation = { id: string; operation: string; status: string; reason: string | null; resultJson: Record<string, unknown> | null };

export const pairingService = {
  list: () => request<Pairing[]>("/pairing"),
  request: (deviceName: string, publicKey: string) => request<Pairing>("/pairing/request", { method: "POST", body: { deviceName, publicKey } }),
  approve: (id: string) => request(`/pairing/${id}/approve`, { method: "POST" }),
  reject: (id: string) => request(`/pairing/${id}/reject`, { method: "POST" }),
  revoke: (id: string) => request(`/pairing/${id}`, { method: "DELETE" }),
  startSession: (pairedDeviceId: string) => request<{ id: string }>("/remote/session", { method: "POST", body: { pairedDeviceId } }),
  endSession: (id: string) => request(`/remote/session/${id}/end`, { method: "POST" }),
  operation: (pairedDeviceId: string, sessionId: string, operation = "GET_SYSTEM_INFO") => request<RemoteOperation>("/remote/operation", { method: "POST", body: { pairedDeviceId, sessionId, operation } }),
  getOperation: (id: string) => request<RemoteOperation>(`/remote/operation/${id}`),
};
