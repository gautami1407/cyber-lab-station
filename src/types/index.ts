/**
 * Shared API-ready TypeScript contracts.
 * These mirror the REST payloads the future backend will expose, so screens
 * can switch from mock services to live services without UI changes.
 */

export type OperationState = "idle" | "loading" | "success" | "error";

export type SeverityLevel = "critical" | "high" | "medium" | "low";

export type CheckStatus = "pass" | "warning" | "fail";

/* ---------------------------------- auth ---------------------------------- */

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthResponse {
  userId: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface SessionInfo {
  sessionId: string;
  status: "active" | "expiring" | "expired";
  loginTime: string;
  lastActivity: string;
  expiresAt: string;
  device: string;
  ipAddress: string;
}

export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

export type PasswordStrengthLabel =
  | "Very Weak"
  | "Weak"
  | "Medium"
  | "Strong"
  | "Very Strong";

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: PasswordStrengthLabel;
  requirements: PasswordRequirement[];
}

/* -------------------------------- scanning -------------------------------- */

export type ScanProfile = "common" | "web" | "custom";

export interface PortScanRequest {
  target: string;
  startPort: number;
  endPort: number;
  profile: ScanProfile;
  authorized: boolean;
}

export type PortStatus = "open" | "closed" | "filtered" | "error";

export interface PortResult {
  port: number;
  protocol: "TCP" | "UDP";
  status: PortStatus;
  service: string;
  responseTimeMs: number | null;
}

export interface PortScanResponse {
  target: string;
  results: PortResult[];
  totalScanned: number;
  open: number;
  closed: number;
  errors: number;
  durationMs: number;
  demo: boolean;
}

export type DiscoveryMethod = "ping" | "tcp" | "arp";

export interface IpRangeScanRequest {
  startIp: string;
  endIp: string;
  cidr?: string;
  method: DiscoveryMethod;
  authorized: boolean;
}

export type HostStatus = "active" | "inactive" | "unknown" | "error";

export interface HostResult {
  ip: string;
  status: HostStatus;
  hostname: string | null;
  responseTimeMs: number | null;
  method: DiscoveryMethod;
}

export interface IpRangeScanResponse {
  results: HostResult[];
  checked: number;
  active: number;
  inactive: number;
  errors: number;
  durationMs: number;
  demo: boolean;
}

/* --------------------------------- domains -------------------------------- */

export type SubdomainSource =
  | "DNS"
  | "Certificate Transparency"
  | "Passive Sources"
  | "Wordlist";

export interface SubdomainRequest {
  domain: string;
  methods: SubdomainSource[];
  authorized: boolean;
}

export interface SubdomainResult {
  subdomain: string;
  status: "active" | "inactive" | "found";
  ipAddress: string | null;
  source: SubdomainSource;
}

export interface SubdomainResponse {
  domain: string;
  results: SubdomainResult[];
  found: number;
  active: number;
  inactive: number;
  sources: number;
  durationMs: number;
  demo: boolean;
}

/* ---------------------------- application security ------------------------- */

export interface ValidationRequest {
  value: string;
  rules: string[];
}

export interface ValidationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface ValidationResponse {
  safe: boolean;
  sanitized: string;
  checks: ValidationCheck[];
}

export interface SecurityCheck {
  id: string;
  title: string;
  status: CheckStatus;
  description: string;
}

export interface Recommendation {
  id: string;
  severity: SeverityLevel;
  title: string;
  description: string;
}

/* --------------------------------- activity -------------------------------- */

export interface ActivityEntry {
  id: string;
  time: string;
  project: string;
  operation: string;
  target: string;
  status: "success" | "failed" | "stopped" | "running";
  durationMs: number;
}
