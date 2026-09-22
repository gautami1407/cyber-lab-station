import { request } from "./apiClient";

export type LocalInterface = {
  name: string;
  ipv4Address: string;
  netmask: string;
  cidr: string;
  macAddress: string | null;
  isUp: boolean;
};

export type AuthorizedNetwork = {
  id: string;
  interfaceName: string;
  ipv4Address: string;
  cidr: string;
  status: string;
  _count: { devices: number };
};

export type Device = {
  id: string;
  ipAddress: string;
  macAddress: string | null;
  vendor: string | null;
  hostname: string | null;
  status: string;
  riskLevel: string;
  latencyMs: number | null;
  lastSeen: string;
  authorizedNetwork?: { id: string; interfaceName: string; cidr: string } | null;
};

export type DeviceDetail = Device & {
  observations: Array<{ observedAt: string; status: string; ipAddress: string; hostname: string | null; latencyMs: number | null }>;
  services: Array<{ id: string; port: number; protocol: string; name: string; status: string; firstSeen: string; lastSeen: string }>;
  scans: Array<{ id: string; status: string; target: string; createdAt: string; results: Array<{ port: number; protocol: string; status: string; serviceName: string }> }>;
};

export const networkService = {
  interfaces() {
    return request<LocalInterface[]>("/networks/interfaces");
  },
  authorized() {
    return request<AuthorizedNetwork[]>("/networks");
  },
  authorize(payload: Pick<LocalInterface, "name" | "ipv4Address" | "cidr">) {
    return request<AuthorizedNetwork>("/networks/authorize", { method: "POST", body: { interfaceName: payload.name, ipv4Address: payload.ipv4Address, cidr: payload.cidr } });
  },
  revoke(id: string) {
    return request<AuthorizedNetwork>(`/networks/${id}`, { method: "DELETE" });
  },
  discover(id: string) {
    return request<{ devices: Device[] }>(`/networks/${id}/discover`, { method: "POST" });
  },
  devices() {
    return request<Device[]>("/devices");
  },
  device(id: string) {
    return request<DeviceDetail>(`/devices/${id}`);
  },
  scanServices(id: string) {
    return request<{ operationId: string; scanId: string }>(`/devices/${id}/services/scan`, { method: "POST", body: { startPort: 1, endPort: 1024, profile: "common" } });
  },
};