import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Fingerprint,
  Globe,
  LayoutDashboard,
  Lock,
  Radar,
  ScanSearch,
  Settings,
  Shield,
} from "lucide-react";

export type AppPath =
  | "/dashboard"
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
    description: "Overview of CyberLab projects, activity, and demo status.",
    icon: LayoutDashboard,
    group: "overview",
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
    description: "Simulated TCP port discovery against an authorized lab target.",
    icon: ScanSearch,
    group: "projects",
  },
  {
    to: "/projects/ip-range-scanner",
    label: "IP Range Scanner",
    title: "IP Range Scanner",
    description: "Simulated host discovery for an authorized lab network.",
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
    description: "Simulated subdomain discovery for an authorized domain.",
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
  name: "CyberLab",
  product: "CyberLab Security Toolkit",
  icon: Shield,
};

export function getPageMeta(pathname: string): NavItem {
  const exact = NAV_ITEMS.find((item) => item.to === pathname);
  return exact ?? NAV_ITEMS[0]!;
}

export function pageHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} · CyberLab` },
      { name: "description", content: description },
    ],
  };
}
