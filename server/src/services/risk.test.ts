import { describe, expect, it } from "vitest";
import { calculateRisk } from "./risk.js";

describe("risk engine", () => {
  it("is deterministic and explainable", () => {
    expect(calculateRisk({ newDevice: true, newServices: 3, identityChanged: true })).toEqual({
      level: "CRITICAL",
      reason: "Multiple high-signal network changes were observed.",
    });
  });

  it("does not classify a quiet observation as an incident", () => {
    expect(calculateRisk({})).toEqual({
      level: "LOW",
      reason: "No significant deviation from the recorded baseline was observed.",
    });
  });
});
