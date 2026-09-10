import { ArrowDown } from "lucide-react";
import { AlertBanner } from "@/components/common/AlertBanner";
import { DocList, DocumentationSection } from "@/components/common/DocumentationSection";
import { PageHeader } from "@/components/common/PageHeader";
import { AUTHORIZED_USE_NOTICE } from "@/data/mock";

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "authentication", label: "Authentication" },
  { id: "port-scanner", label: "Port Scanner" },
  { id: "ip-scanner", label: "IP Range Scanner" },
  { id: "app-security", label: "Application Security" },
  { id: "subdomains", label: "Subdomain Enumeration" },
  { id: "architecture", label: "Security Architecture" },
  { id: "authorized-use", label: "Authorized Use" },
  { id: "api", label: "API Integration" },
  { id: "errors", label: "Error Handling" },
  { id: "recommendations", label: "Security Recommendations" },
];

const LAYERS = [
  "React Frontend",
  "Service Layer",
  "REST API",
  "Backend Services",
  "Prisma",
  "PostgreSQL",
];

export function DocumentationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentation"
        description="How the running CyberLab stack authenticates, scans allowlisted labs, and records audit events."
      />
      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Documentation" className="h-fit rounded-xl border border-border bg-card/60 p-4 lg:sticky lg:top-20">
          <p className="mb-3 font-mono text-xs tracking-widest text-muted-foreground uppercase">Contents</p>
          <ul className="space-y-1 text-sm">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-8">
          <DocumentationSection id="overview" title="Overview">
            <p>
              CyberLab is an educational toolkit. The UI talks only to the service layer. Security-sensitive work
              (password hashing, TCP connect scans, DNS lookups, audit writes) runs in the Node API against PostgreSQL.
            </p>
          </DocumentationSection>
          <DocumentationSection id="authentication" title="Authentication">
            <DocList
              items={[
                { term: "Objective", detail: "Create users, issue HttpOnly sessions, revoke them." },
                { term: "How it works", detail: "Argon2id hashes in PostgreSQL. Cookies named cyberlab.sid." },
                { term: "CSRF", detail: "Double-submit cookie cyberlab.csrf plus X-CSRF-Token header." },
                { term: "Lockout", detail: "10 failed logins lock the account; login is also rate limited." },
                { term: "Limitations", detail: "MFA is not implemented." },
              ]}
            />
          </DocumentationSection>
          <DocumentationSection id="port-scanner" title="Port Scanner">
            <DocList
              items={[
                { term: "Method", detail: "TCP connect only. No SYN, UDP, stealth, or exploitation." },
                { term: "Allowlist", detail: "ALLOWED_SCAN_TARGETS. Other hosts return 403." },
                { term: "Service names", detail: "Well-known ports only; otherwise unknown." },
                { term: "Progress", detail: "Polled from SecurityOperation rows (queued/running/completed)." },
              ]}
            />
          </DocumentationSection>
          <DocumentationSection id="ip-scanner" title="IP Range Scanner">
            <DocList
              items={[
                { term: "Method", detail: "TCP probes on PROBE_PORTS for each host in range." },
                { term: "Limits", detail: "MAX_HOSTS_PER_SCAN. Every IP must be allowlisted." },
                { term: "Hostname", detail: "Reverse DNS when it succeeds; otherwise null." },
              ]}
            />
          </DocumentationSection>
          <DocumentationSection id="app-security" title="Application Security">
            <DocList
              items={[
                { term: "Validation", detail: "POST /api/security/validate-input with Zod. Input is never executed." },
                { term: "RBAC", detail: "guest/user/moderator/admin enforced in middleware." },
                { term: "Controls", detail: "GET /api/security/checks reports live configuration, not fake scores." },
              ]}
            />
          </DocumentationSection>
          <DocumentationSection id="subdomains" title="Subdomain Enumeration">
            <DocList
              items={[
                { term: "Allowlist", detail: "ALLOWED_ENUMERATION_DOMAINS only." },
                { term: "Methods", detail: "DNS lookup of apex and common labels; optional crt.sh for CT." },
                { term: "IPs", detail: "Returned only when DNS resolves; otherwise null." },
              ]}
            />
          </DocumentationSection>
          <DocumentationSection id="architecture" title="Security Architecture">
            <ol className="mx-auto flex max-w-sm flex-col items-center gap-2 py-4">
              {LAYERS.map((layer, index) => (
                <li key={layer} className="flex w-full flex-col items-center gap-2">
                  <div className="w-full rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-center text-sm font-medium">
                    {layer}
                  </div>
                  {index < LAYERS.length - 1 ? <ArrowDown aria-hidden="true" className="size-4 text-primary" /> : null}
                </li>
              ))}
            </ol>
          </DocumentationSection>
          <DocumentationSection id="authorized-use" title="Authorized Use">
            <AlertBanner variant="danger" title="Authorized Use Only">
              {AUTHORIZED_USE_NOTICE} Scanning or enumeration must only be performed against systems and domains for
              which the operator has explicit authorization.
            </AlertBanner>
          </DocumentationSection>
          <DocumentationSection id="api" title="API Integration">
            <p>
              Cookie credentials, CSRF header, JSON envelope <code>{`{ success, data | error }`}</code>. See{" "}
              <code>docs/API.md</code> in the repository.
            </p>
          </DocumentationSection>
          <DocumentationSection id="errors" title="Error Handling">
            <p>Generic codes only. Stack traces, SQL, and secrets are not returned to the browser.</p>
          </DocumentationSection>
          <DocumentationSection id="recommendations" title="Security Recommendations">
            <p>
              Keep allowlists explicit, rotate SESSION_SECRET, restrict FRONTEND_URL, and treat Lab Mode as authorized
              local targets — never as a restriction bypass.
            </p>
          </DocumentationSection>
        </div>
      </div>
    </div>
  );
}
