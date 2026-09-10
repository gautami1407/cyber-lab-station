import { request } from "./apiClient";
import type {
  IpRangeScanRequest,
  OperationHandle,
  OperationSnapshot,
  PortScanRequest,
  PortScanResponse,
  IpRangeScanResponse,
} from "@/types";

export const scannerService = {
  scanPorts(payload: PortScanRequest) {
    return request<OperationHandle>("/scanner/ports", { method: "POST", body: payload });
  },
};

export const ipScannerService = {
  scanRange(payload: IpRangeScanRequest) {
    return request<OperationHandle>("/scanner/ip-range", { method: "POST", body: payload });
  },
};

export function getOperation<T>(id: string) {
  return request<OperationSnapshot<T>>(`/operations/${id}`);
}

export function cancelOperation(id: string) {
  return request<{ cancelled: boolean }>(`/operations/${id}/cancel`, { method: "POST" });
}

export type { PortScanResponse, IpRangeScanResponse };
