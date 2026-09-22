import { describe, expect, it } from "vitest";
import { lookupMacVendor, normalizeMacAddress, resolveDeviceVendor } from "./vendor.js";

describe("vendor lookup", () => {
  it("normalizes common MAC formats", () => {
    expect(normalizeMacAddress("00:1a:2b:aa:bb:cc")).toBe("001A2BAABBCC");
    expect(normalizeMacAddress("00-1A-2B-AA-BB-CC")).toBe("001A2BAABBCC");
    expect(normalizeMacAddress("00 1A 2B AA BB CC")).toBe("001A2BAABBCC");
  });

  it("resolves known OUI entries", () => {
    expect(lookupMacVendor("00:1A:2B:AA:BB:CC")).toBe("Cisco Systems, Inc.");
    expect(lookupMacVendor("00-22-B0-12-34-56")).toBe("Intel Corporate");
    expect(lookupMacVendor("A0:B3:CC:DE:AD:BE")).toBe("Hewlett Packard");
  });

  it("returns null for unknown or malformed values", () => {
    expect(lookupMacVendor("not-a-mac")).toBeNull();
    expect(resolveDeviceVendor(null)).toEqual({ normalized: null, vendor: null });
    expect(resolveDeviceVendor("00:99:88:77:66:55").vendor).toBeNull();
  });
});
