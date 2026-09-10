import { Fingerprint, Globe, Lock, Radar, ScanSearch } from "lucide-react";
import type { ProjectSummary } from "@/components/common/ProjectCard";

export const SECURITY_PROJECTS: ProjectSummary[] = [
  {
    number: 1,
    title: "Authentication Toolkit",
    description:
      "Explore secure authentication, password policies, hashing concepts, and session management.",
    concept: "Identity · hashing · sessions",
    status: "Ready",
    progress: 100,
    to: "/projects/authentication",
    icon: Fingerprint,
  },
  {
    number: 2,
    title: "Port Scanner",
    description: "Demonstrate controlled TCP port discovery and open/closed port identification.",
    concept: "Network reconnaissance · TCP",
    status: "Ready",
    progress: 100,
    to: "/projects/port-scanner",
    icon: ScanSearch,
  },
  {
    number: 3,
    title: "IP Range Scanner",
    description: "Discover active and inactive hosts within an authorized lab network.",
    concept: "Host discovery · lab scope",
    status: "Ready",
    progress: 100,
    to: "/projects/ip-range-scanner",
    icon: Radar,
  },
  {
    number: 4,
    title: "Application Security",
    description:
      "Explore input validation, authentication, authorization, and application security controls.",
    concept: "OWASP-aligned controls",
    status: "Ready",
    progress: 100,
    to: "/projects/application-security",
    icon: Lock,
  },
  {
    number: 5,
    title: "Subdomain Enumeration",
    description: "Demonstrate controlled subdomain discovery during an authorized assessment.",
    concept: "Passive enumeration · DNS",
    status: "Ready",
    progress: 100,
    to: "/projects/subdomain-enumeration",
    icon: Globe,
  },
];
