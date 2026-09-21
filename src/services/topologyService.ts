import { request } from "./apiClient";

export type Topology = {
  relationshipType: "LOGICAL";
  note: string;
  gateways: Array<{ id: string; address: string }>;
  networks: Array<{
    id: string;
    cidr: string;
    interfaceName: string;
    devices: Array<{ id: string; ipAddress: string; hostname: string | null; status: string; riskLevel: string; serviceCount: number }>;
  }>;
};

export function getTopology() {
  return request<Topology>("/topology");
}

export const topologyService = { getTopology };
