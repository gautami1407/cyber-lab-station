import type {
  ActivityEntry,
  HostResult,
  PortResult,
  Recommendation,
  SecurityCheck,
  SessionInfo,
  SubdomainResult,
} from "@/types";

export const DEMO_NOTICE =
  "DEMO DATA — simulated results generated in the browser. No real scan, lookup or network request is performed.";

export const AUTHORIZED_USE_NOTICE =
  "Authorized Use Only — Network scanning and enumeration features must only be used against systems and domains you own or have explicit permission to assess.";

export const mockPortResults: PortResult[] = [
  { port: 22, protocol: "TCP", status: "open", service: "SSH", responseTimeMs: 18 },
  { port: 25, protocol: "TCP", status: "filtered", service: "SMTP", responseTimeMs: 240 },
  { port: 53, protocol: "TCP", status: "closed", service: "DNS", responseTimeMs: null },
  { port: 80, protocol: "TCP", status: "open", service: "HTTP", responseTimeMs: 21 },
  { port: 110, protocol: "TCP", status: "closed", service: "POP3", responseTimeMs: null },
  { port: 143, protocol: "TCP", status: "closed", service: "IMAP", responseTimeMs: null },
  { port: 443, protocol: "TCP", status: "open", service: "HTTPS", responseTimeMs: 19 },
  { port: 445, protocol: "TCP", status: "filtered", service: "SMB", responseTimeMs: 310 },
  { port: 3306, protocol: "TCP", status: "closed", service: "MySQL", responseTimeMs: null },
  { port: 3389, protocol: "TCP", status: "error", service: "RDP", responseTimeMs: null },
  { port: 5432, protocol: "TCP", status: "closed", service: "PostgreSQL", responseTimeMs: null },
  { port: 8080, protocol: "TCP", status: "open", service: "HTTP-ALT", responseTimeMs: 26 },
];

export const mockHostResults: HostResult[] = [
  { ip: "192.168.1.1", status: "active", hostname: "gateway.lab.local", responseTimeMs: 3, method: "ping" },
  { ip: "192.168.1.10", status: "active", hostname: "nas.lab.local", responseTimeMs: 6, method: "ping" },
  { ip: "192.168.1.24", status: "inactive", hostname: null, responseTimeMs: null, method: "ping" },
  { ip: "192.168.1.42", status: "active", hostname: "workstation-04.lab.local", responseTimeMs: 11, method: "tcp" },
  { ip: "192.168.1.77", status: "unknown", hostname: null, responseTimeMs: null, method: "tcp" },
  { ip: "192.168.1.101", status: "active", hostname: "printer.lab.local", responseTimeMs: 14, method: "arp" },
  { ip: "192.168.1.128", status: "inactive", hostname: null, responseTimeMs: null, method: "ping" },
  { ip: "192.168.1.200", status: "error", hostname: null, responseTimeMs: null, method: "tcp" },
  { ip: "192.168.1.254", status: "active", hostname: "ap-north.lab.local", responseTimeMs: 8, method: "ping" },
];

export const mockSubdomains: SubdomainResult[] = [
  { subdomain: "www.example.com", status: "active", ipAddress: "93.184.x.x", source: "DNS" },
  { subdomain: "mail.example.com", status: "active", ipAddress: "93.184.x.x", source: "DNS" },
  { subdomain: "api.example.com", status: "active", ipAddress: "93.184.x.x", source: "Passive Sources" },
  { subdomain: "dev.example.com", status: "found", ipAddress: null, source: "Certificate Transparency" },
  { subdomain: "staging.example.com", status: "found", ipAddress: null, source: "Certificate Transparency" },
  { subdomain: "vpn.example.com", status: "inactive", ipAddress: null, source: "Wordlist" },
  { subdomain: "docs.example.com", status: "active", ipAddress: "93.184.x.x", source: "Passive Sources" },
  { subdomain: "legacy.example.com", status: "inactive", ipAddress: null, source: "Wordlist" },
];

export const mockSession: SessionInfo = {
  sessionId: "sess_9f2c••••••••••4d1a",
  status: "active",
  loginTime: "2026-09-10T08:42:00Z",
  lastActivity: "2026-09-10T09:58:00Z",
  expiresAt: "2026-09-10T10:42:00Z",
  device: "Chrome 128 · macOS",
  ipAddress: "192.168.1.•••",
};

export const authSecurityControls: SecurityCheck[] = [
  { id: "hash", title: "Password hashing", status: "pass", description: "Backend will store Argon2id hashes with per-user salts. Plaintext never leaves the request scope." },
  { id: "expiry", title: "Session expiration", status: "pass", description: "Idle sessions expire after 30 minutes; absolute lifetime capped at 12 hours." },
  { id: "cookies", title: "Secure cookies", status: "pass", description: "HttpOnly, Secure and SameSite=Lax flags prevent script access and cross-site replay." },
  { id: "rate", title: "Login rate limiting", status: "warning", description: "Demo build has no limiter. Production target: 5 attempts per minute per IP." },
  { id: "lockout", title: "Account lockout", status: "warning", description: "Progressive lockout after 10 failed attempts is planned for the backend milestone." },
  { id: "validation", title: "Input validation", status: "pass", description: "Schema validation on both client and server, with strict length and character rules." },
  { id: "csrf", title: "CSRF protection", status: "pass", description: "Double-submit token bound to the session for every state-changing request." },
  { id: "errors", title: "Generic auth errors", status: "pass", description: "Login failures return one generic message so accounts cannot be enumerated." },
];

export const appSecurityChecks: SecurityCheck[] = [
  { id: "input", title: "Input validation", status: "pass", description: "All user input is schema-validated and length-limited before use." },
  { id: "authn", title: "Authentication", status: "pass", description: "Credential flow uses strong password policy and generic failure messages." },
  { id: "authz", title: "Authorization", status: "warning", description: "Role checks exist client-side for the demo; server-side enforcement is required." },
  { id: "password", title: "Password handling", status: "pass", description: "No password is logged, cached or echoed back by the interface." },
  { id: "session", title: "Session security", status: "pass", description: "Short-lived sessions with rotation on privilege change." },
  { id: "errors", title: "Error handling", status: "pass", description: "User-friendly errors only — no stack traces or internal details surfaced." },
  { id: "headers", title: "Security headers", status: "warning", description: "CSP, HSTS and X-Content-Type-Options must be set by the hosting layer." },
  { id: "rate", title: "Rate limiting", status: "fail", description: "No request throttling in the demo frontend. Required before any live testing." },
];

export const recommendations: Recommendation[] = [
  { id: "r1", severity: "critical", title: "Enforce authorization server-side", description: "Role and ownership checks must be re-validated on every API call; UI gating alone is bypassable." },
  { id: "r2", severity: "critical", title: "Never run scans without written permission", description: "Store scope agreements and validate targets against an allow-list before any scan job executes." },
  { id: "r3", severity: "high", title: "Add rate limiting and lockout", description: "Throttle authentication and scan endpoints to blunt brute-force and abuse." },
  { id: "r4", severity: "high", title: "Ship a strict Content Security Policy", description: "Restrict script, style and connect sources to trusted origins." },
  { id: "r5", severity: "medium", title: "Centralise audit logging", description: "Record who ran which operation against which target, with sensitive values masked." },
  { id: "r6", severity: "medium", title: "Rotate sessions on privilege change", description: "Issue a new session identifier whenever a role or password changes." },
  { id: "r7", severity: "low", title: "Document data retention", description: "Define how long scan results and activity history are stored before deletion." },
];

export const mockActivity: ActivityEntry[] = [
  { id: "a1", time: "2026-09-10T09:58:00Z", project: "Port Scanner", operation: "Port scan (common)", target: "lab-host-01.•••.local", status: "success", durationMs: 4200 },
  { id: "a2", time: "2026-09-10T09:31:00Z", project: "Subdomain Enumeration", operation: "Passive enumeration", target: "example.com", status: "success", durationMs: 6100 },
  { id: "a3", time: "2026-09-10T09:12:00Z", project: "IP Range Scanner", operation: "Host discovery", target: "192.168.1.0/24", status: "stopped", durationMs: 2400 },
  { id: "a4", time: "2026-09-10T08:55:00Z", project: "Authentication Toolkit", operation: "Password strength check", target: "local session", status: "success", durationMs: 120 },
  { id: "a5", time: "2026-09-10T08:44:00Z", project: "Application Security", operation: "Input validation review", target: "contact form sample", status: "success", durationMs: 340 },
  { id: "a6", time: "2026-09-10T08:42:00Z", project: "Authentication Toolkit", operation: "Session created", target: "192.168.1.•••", status: "success", durationMs: 210 },
  { id: "a7", time: "2026-09-09T18:20:00Z", project: "Port Scanner", operation: "Port scan (custom 1-1024)", target: "10.0.0.•••", status: "failed", durationMs: 900 },
  { id: "a8", time: "2026-09-09T17:02:00Z", project: "IP Range Scanner", operation: "Host discovery", target: "10.0.0.0/25", status: "success", durationMs: 8300 },
];
