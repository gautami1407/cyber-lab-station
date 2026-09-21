export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function calculateRisk(input: { newDevice?: boolean; newServices?: number; identityChanged?: boolean; repeatedFlaps?: boolean; latencyAnomaly?: boolean }): { level: RiskLevel; reason: string } {
  const score = (input.newDevice ? 3 : 0) + Math.min(input.newServices ?? 0, 3) + (input.identityChanged ? 3 : 0) + (input.repeatedFlaps ? 2 : 0) + (input.latencyAnomaly ? 1 : 0);
  if (score >= 8) return { level: "CRITICAL", reason: "Multiple high-signal network changes were observed." };
  if (score >= 5) return { level: "HIGH", reason: "A new or changed identity exposed multiple risk indicators." };
  if (score >= 2) return { level: "MEDIUM", reason: "A network change differs from the recorded baseline." };
  return { level: "LOW", reason: "No significant deviation from the recorded baseline was observed." };
}
