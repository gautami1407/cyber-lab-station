import { createHash, createHmac } from "node:crypto";
import { config } from "../config.js";

export function hashValue(value: string): string {
  return createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function maskIp(ip: string): string {
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 2).join(":")}:••••`;
  }
  const octets = ip.split(".");
  if (octets.length !== 4) return "•••";
  return `${octets[0]}.${octets[1]}.•••.•••`;
}

export function maskTarget(target: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(target)) return maskIp(target);
  const labels = target.split(".");
  if (labels.length < 2) return `${target.slice(0, 2)}•••`;
  return `${labels[0]!.slice(0, 2)}•••.${labels.slice(-2).join(".")}`;
}

export function maskSessionLabel(publicId: string): string {
  return `sess_••••${publicId.slice(-4)}`;
}
