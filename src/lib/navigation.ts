import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Fingerprint,
  Globe,
  LayoutDashboard,
  Lock,
  Monitor,
  Radar,
  ScanSearch,
  Settings,
  Shield,
} from "lucide-react";

export type AppPath =
  | "/dashboard"
  | "/networks"
  | "/topology"
  | "/monitoring"
  | "/remote-devices"
  | "/devices/$id"
  | "/projects/authentication"
  | "/projects/port-scanner"
  | "/projects/ip-range-scanner"
  | "/projects/application-security"
  | "/projects/subdomain-enumeration"
  | "/activity"
  | "/documentation"
  | "/settings";

export interface NavItem {
  to: AppPath;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  group: "overview" | "projects" | "ops";
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    title: "Dashboard",
    description: "Overview of NetLink network state, security activity, and service health.",
    icon: LayoutDashboard,
    group: "overview",
  },
  {
    to: "/networks",
    label: "Networks & Devices",
    title: "Networks & Devices",
    description: "Authorize local networks and inspect observed devices.",
    icon: Radar,
    group: "overview",
  },
  {
    to: "/topology",
    label: "Topology",
    title: "Network Topology",
    description: "Inspect observed logical relationships between networks and devices.",
    icon: Radar,
    group: "overview",
  },
  {
    to: "/monitoring",
    label: "Monitoring",
    title: "Events & Alerts",
    description: "Review evidence-based events and manage security alerts.",
    icon: Activity,
    group: "ops",
  },
  {
    to: "/remote-devices",
    label: "Remote Devices",
    title: "Remote Devices",
    description: "Pair authorized agents and request real system information.",
    icon: Monitor,
    group: "ops",
  },
  {
    to: "/projects/authentication",
    label: "Authentication",
    title: "Authentication Toolkit",
    description: "Registration, login, password policy, and session controls.",
    icon: Fingerprint,
    group: "projects",
  },
  {
    to: "/projects/port-scanner",
    label: "Port Scanner",
    title: "Port Scanner",
    description: "TCP service discovery against an explicitly authorized local target.",
    icon: ScanSearch,
    group: "projects",
  },
  {
    to: "/projects/ip-range-scanner",
    label: "IP Range Scanner",
    title: "IP Range Scanner",
    description: "Host discovery for a network explicitly authorized by the operator.",
    icon: Radar,
    group: "projects",
  },
  {
    to: "/projects/application-security",
    label: "Application Security",
    title: "Application Security",
    description: "Input validation, authentication, authorization, and checks.",
    icon: Lock,
    group: "projects",
  },
  {
    to: "/projects/subdomain-enumeration",
    label: "Subdomain Enumeration",
    title: "Subdomain Enumeration",
    description: "DNS discovery for an explicitly authorized domain.",
    icon: Globe,
    group: "projects",
  },
  {
    to: "/activity",
    label: "Activity",
    title: "Security Activity",
    description: "Review recent security operations performed in this environment.",
    icon: Activity,
    group: "ops",
  },
  {
    to: "/documentation",
    label: "Documentation",
    title: "Documentation",
    description: "How CyberLab works, authorized use, and API integration notes.",
    icon: BookOpen,
    group: "ops",
  },
  {
    to: "/settings",
    label: "Settings",
    title: "Settings",
    description: "Theme, notifications, backend status, and project information.",
    icon: Settings,
    group: "ops",
  },
];

export const BRAND = {
  name: "NetLink",
  product: "NetLink Network Intelligence Platform",
  icon: Shield,
};

export function getPageMeta(pathname: string): NavItem {
  const exact = NAV_ITEMS.find((item) => item.to === pathname);
  return exact ?? NAV_ITEMS[0]!;
}

export function pageHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} · NetLink` },
      { name: "description", content: description },
    ],
  };
}
