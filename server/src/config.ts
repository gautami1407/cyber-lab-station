import "dotenv/config";

function csv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

if (nodeEnv === "production") {
  for (const name of ["DATABASE_URL", "SESSION_SECRET"] as const) {
    if (!process.env[name]) throw new Error(`Missing required environment variable ${name}`);
  }
}

export const config = {
  nodeEnv,
  port: num("PORT", 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "development-session-secret",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:8080",
  allowedScanTargets: csv("ALLOWED_SCAN_TARGETS").length
    ? csv("ALLOWED_SCAN_TARGETS")
    : ["127.0.0.1", "localhost"],
  allowedEnumerationDomains: csv("ALLOWED_ENUMERATION_DOMAINS").length
    ? csv("ALLOWED_ENUMERATION_DOMAINS")
    : ["localhost"],
  maxPortsPerScan: num("MAX_PORTS_PER_SCAN", 1024),
  maxHostsPerScan: num("MAX_HOSTS_PER_SCAN", 256),
  scanTimeoutMs: num("SCAN_TIMEOUT_MS", 1000),
  scanConcurrency: num("SCAN_CONCURRENCY", 20),
  probePorts: csv("PROBE_PORTS").map(Number).filter((n) => n > 0 && n <= 65535).length
    ? csv("PROBE_PORTS").map(Number).filter((n) => n > 0 && n <= 65535)
    : [22, 80, 443],
  sessionIdleMinutes: num("SESSION_IDLE_MINUTES", 30),
  sessionAbsoluteHours: num("SESSION_ABSOLUTE_HOURS", 12),
  loginMaxAttempts: num("LOGIN_MAX_ATTEMPTS", 10),
  lockoutMinutes: num("LOCKOUT_MINUTES", 15),
  authRateLimit: num("AUTH_RATE_LIMIT", 5),
  scannerRateLimit: num("SCANNER_RATE_LIMIT", 10),
  enumerationRateLimit: num("ENUMERATION_RATE_LIMIT", 10),
  agentHeartbeatIntervalMs: num("AGENT_HEARTBEAT_INTERVAL_MS", 10_000),
  agentHeartbeatTimeoutMs: num("AGENT_HEARTBEAT_TIMEOUT_MS", 30_000),
  screenCaptureMaxBytes: num("SCREEN_CAPTURE_MAX_BYTES", 2 * 1024 * 1024),
  screenCaptureChunkBytes: num("SCREEN_CAPTURE_CHUNK_BYTES", 8 * 1024),
  screenCaptureTimeoutMs: num("SCREEN_CAPTURE_TIMEOUT_MS", 15_000),
  cookieName: "cyberlab.sid",
  apiVersion: "v1",
};

export const isProduction = config.nodeEnv === "production";
