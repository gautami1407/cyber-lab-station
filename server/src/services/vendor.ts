const OUI_VENDOR_MAP = new Map<string, string>([
  ["001A2B", "Cisco Systems, Inc."],
  ["001E63", "Cisco Systems, Inc."],
  ["001B63", "Cisco Systems, Inc."],
  ["0022B0", "Intel Corporate"],
  ["001122", "Intel Corporate"],
  ["000A95", "Apple Inc."],
  ["0030AB", "Dell Inc."],
  ["A0B3CC", "Hewlett Packard"],
  ["B4C0C1", "Ubiquiti Networks Inc."],
  ["ECB1D7", "Raspberry Pi Foundation"],
]);

export function normalizeMacAddress(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const compact = trimmed.replace(/[-:\s]/g, "").toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(compact)) return null;
  return compact;
}

export function lookupMacVendor(value: string | null | undefined): string | null {
  const normalized = normalizeMacAddress(value);
  if (!normalized) return null;
  const oui = normalized.slice(0, 6);
  return OUI_VENDOR_MAP.get(oui) ?? null;
}

export function resolveDeviceVendor(value: string | null | undefined): { normalized: string | null; vendor: string | null } {
  const normalized = normalizeMacAddress(value);
  return { normalized, vendor: normalized ? lookupMacVendor(normalized) : null };
}
