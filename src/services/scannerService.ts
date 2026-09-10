import { delay } from "./apiClient";
import { mockHostResults, mockPortResults } from "@/data/mock";
import type {
  IpRangeScanRequest,
  IpRangeScanResponse,
  PortScanRequest,
  PortScanResponse,
} from "@/types";

/**
 * scannerService / ipScannerService — future endpoints:
 *   POST /api/scanner/ports
 *   POST /api/scanner/ip-range
 *
 * DEMO MODE: results are simulated locally. No sockets are opened and no
 * network request leaves the browser.
 */

export const scannerService = {
  async scanPorts(payload: PortScanRequest): Promise<PortScanResponse> {
    if (!payload.authorized) {
      throw new Error("Authorization confirmation is required before scanning.");
    }
    await delay(600);

    const results =
      payload.profile === "web"
        ? mockPortResults.filter((r) => [80, 443, 8080].includes(r.port))
        : payload.profile === "custom"
          ? mockPortResults.filter(
              (r) => r.port >= payload.startPort && r.port <= payload.endPort,
            )
          : mockPortResults;

    return {
      target: payload.target,
      results,
      totalScanned: results.length,
      open: results.filter((r) => r.status === "open").length,
      closed: results.filter((r) => r.status === "closed").length,
      errors: results.filter((r) => r.status === "error").length,
      durationMs: 4200,
      demo: true,
    };
  },
};

export const ipScannerService = {
  async scanRange(payload: IpRangeScanRequest): Promise<IpRangeScanResponse> {
    if (!payload.authorized) {
      throw new Error("Authorization confirmation is required before scanning.");
    }
    await delay(600);

    const results = mockHostResults.map((h) => ({ ...h, method: payload.method }));
    return {
      results,
      checked: results.length,
      active: results.filter((r) => r.status === "active").length,
      inactive: results.filter((r) => r.status === "inactive").length,
      errors: results.filter((r) => r.status === "error").length,
      durationMs: 5100,
      demo: true,
    };
  },
};
