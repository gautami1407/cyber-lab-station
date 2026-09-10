import { lookup, resolve4 } from "node:dns/promises";
import { config } from "../config.js";
import { Errors } from "../errors.js";
import { assertDomainAllowed } from "../lib/allowlist.js";
import { audit } from "./audit.js";
import { createOperation, finishOperation, markRunning, updateProgress, wasCancelled } from "./operations.js";

const LAB_LABELS = ["www", "mail", "api", "dev", "ns1"];

async function dnsLookup(name: string): Promise<string | null> {
  try {
    const result = await lookup(name, { family: 4 });
    return result.address;
  } catch {
    try {
      const records = await resolve4(name);
      return records[0] ?? null;
    } catch {
      return null;
    }
  }
}

async function certificateTransparency(domain: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url = `https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`;
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const body = (await response.json()) as Array<{ name_value?: string }>;
    const names = new Set<string>();
    for (const row of body.slice(0, 50)) {
      for (const name of String(row.name_value ?? "").split("\n")) {
        const cleaned = name.trim().toLowerCase().replace(/^\*\./, "");
        if (cleaned === domain || cleaned.endsWith(`.${domain}`)) names.add(cleaned);
      }
    }
    return [...names];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function startEnumeration(params: {
  userId: string;
  ip: string;
  domain: string;
  methods: string[];
  authorized: boolean;
}) {
  if (!params.authorized) throw Errors.confirmation();
  const domain = assertDomainAllowed(params.domain, config.allowedEnumerationDomains);
  const methods = params.methods.length > 0 ? params.methods : ["DNS"];
  const op = await createOperation({
    userId: params.userId,
    type: "SUBDOMAIN",
    project: "Subdomain Enumeration",
    operation: "Authorized enumeration",
    target: domain,
    total: 8,
  });
  await audit({
    userId: params.userId,
    action: "SUBDOMAIN_ENUMERATION_STARTED",
    success: true,
    target: domain,
    ip: params.ip,
  });
  void runEnumeration(op.id, domain, methods, params.userId, params.ip);
  return { operationId: op.id };
}

async function runEnumeration(operationId: string, domain: string, methods: string[], userId: string, ip: string) {
  await markRunning(operationId);
  const results: Array<{ subdomain: string; status: string; ipAddress: string | null; source: string }> = [];
  try {
    if (methods.includes("DNS")) {
      const apex = await dnsLookup(domain);
      results.push({
        subdomain: domain,
        status: apex ? "active" : "inactive",
        ipAddress: apex,
        source: "DNS",
      });
      for (const label of LAB_LABELS) {
        if (await wasCancelled(operationId)) break;
        const name = `${label}.${domain}`;
        const address = await dnsLookup(name);
        if (address) {
          results.push({ subdomain: name, status: "active", ipAddress: address, source: "DNS" });
        }
      }
      await updateProgress(operationId, 4);
    }
    if (methods.includes("Certificate Transparency")) {
      const names = await certificateTransparency(domain);
      for (const name of names.slice(0, 20)) {
        if (results.some((row) => row.subdomain === name)) continue;
        const address = await dnsLookup(name);
        results.push({
          subdomain: name,
          status: address ? "active" : "found",
          ipAddress: address,
          source: "Certificate Transparency",
        });
      }
      await updateProgress(operationId, 7);
    }
    if (await wasCancelled(operationId)) {
      await finishOperation(operationId, "cancelled", { results });
      return;
    }
    const payload = {
      domain,
      results,
      found: results.length,
      active: results.filter((row) => row.status === "active").length,
      inactive: results.filter((row) => row.status === "inactive").length,
      sources: new Set(results.map((row) => row.source)).size,
      lab: true,
    };
    const finished = await finishOperation(operationId, "completed", payload);
    const { prisma } = await import("../prisma.js");
    await prisma.securityOperation.update({
      where: { id: operationId },
      data: { resultJson: { ...payload, durationMs: finished.durationMs }, progressDone: 8 },
    });
    await audit({
      userId,
      action: "SUBDOMAIN_ENUMERATION_COMPLETED",
      success: true,
      target: domain,
      ip,
    });
  } catch {
    await finishOperation(operationId, "failed", undefined, {
      code: "ENUM_FAILED",
      message: "Enumeration could not be completed.",
    });
    await audit({
      userId,
      action: "SUBDOMAIN_ENUMERATION_COMPLETED",
      success: false,
      target: domain,
      ip,
    });
  }
}
