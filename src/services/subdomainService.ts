import { delay } from "./apiClient";
import { mockSubdomains } from "@/data/mock";
import type { SubdomainRequest, SubdomainResponse } from "@/types";

/**
 * subdomainService — future endpoint: POST /api/subdomains/enumerate
 * DEMO MODE: no DNS lookups, certificate transparency queries or passive
 * source requests are performed in the frontend.
 */
export const subdomainService = {
  async enumerate(payload: SubdomainRequest): Promise<SubdomainResponse> {
    if (!payload.authorized) {
      throw new Error("Authorization confirmation is required before enumeration.");
    }
    await delay(600);

    const results = mockSubdomains
      .filter((r) => payload.methods.includes(r.source))
      .map((r) => ({
        ...r,
        subdomain: r.subdomain.replace("example.com", payload.domain || "example.com"),
      }));

    return {
      domain: payload.domain,
      results,
      found: results.length,
      active: results.filter((r) => r.status === "active").length,
      inactive: results.filter((r) => r.status === "inactive").length,
      sources: new Set(results.map((r) => r.source)).size,
      durationMs: 6100,
      demo: true,
    };
  },
};
