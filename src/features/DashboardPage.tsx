import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight, BookOpen, FolderKanban, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { AlertBanner } from "@/components/common/AlertBanner";
import { PageHeader } from "@/components/common/PageHeader";
import { ProjectCard } from "@/components/common/ProjectCard";
import { SecurityCheckCard } from "@/components/common/SecurityCheckCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { AUTHORIZED_USE_NOTICE } from "@/data/mock";
import { formatDateTime } from "@/lib/format";
import { SECURITY_PROJECTS } from "@/lib/projects";
import { BRAND } from "@/lib/navigation";
import { securityService } from "@/services/securityService";
import type { SecurityCheck } from "@/types";

const QUICK_START = [
  {
    step: "01",
    title: "Create an account",
    detail: "Register so sessions, operations, and audit records persist in PostgreSQL.",
  },
  {
    step: "02",
    title: "Confirm authorized use",
    detail: "Only assess systems and domains on the administrator allowlist.",
  },
  {
    step: "03",
    title: "Run a lab operation",
    detail: "Port, IP, and subdomain tools call the API. Empty results mean nothing was found.",
  },
];

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof securityService.getDashboard>> | null>(null);
  const [checks, setChecks] = useState<SecurityCheck[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([securityService.getDashboard(), securityService.getChecks()])
      .then(([dashboard, nextChecks]) => {
        if (!active) return;
        setStats(dashboard);
        setChecks(nextChecks);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Dashboard data is unavailable until you sign in.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card/70 p-6 shadow-[var(--shadow-panel)] panel-grid sm:p-8">
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">University capstone lab</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{BRAND.product}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Interactive cybersecurity learning and authorized security assessment toolkit.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <StatusBadge tone="accent">LAB ENVIRONMENT</StatusBadge>
          <StatusBadge
            tone={error ? "danger" : !stats ? "accent" : stats.database ? "success" : "warning"}
          >
            {!stats ? "Checking" : stats.database ? "Connected" : "Disconnected"}
          </StatusBadge>
        </div>
      </section>

      <AlertBanner variant="warning" title="Authorized Use Only">
        {AUTHORIZED_USE_NOTICE}
      </AlertBanner>

      {loading ? <LoadingState label="Loading dashboard from the API…" /> : null}
      {error ? <ErrorState message={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects" value={stats?.projects ?? 5} hint="Educational modules" icon={FolderKanban} tone="accent" />
        <StatCard
          label="Security Controls"
          value={stats?.securityControls ?? "—"}
          hint="From live API configuration"
          icon={ShieldCheck}
          tone="success"
        />
        <StatCard
          label="Recent Operations"
          value={stats?.recentOperations ?? "—"}
          hint="Your recorded jobs"
          icon={Activity}
        />
        <StatCard
          label="System Status"
          value={!stats ? "Checking" : stats.database ? "Connected" : "Disconnected"}
          hint="Verified via API/database"
          icon={Zap}
          tone={!stats ? "accent" : stats.database ? "success" : "warning"}
        />
      </div>

      <section className="space-y-4">
        <PageHeader
          eyebrow="Projects"
          title="Security Projects"
          description="Five focused demonstrations backed by the CyberLab API and PostgreSQL."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SECURITY_PROJECTS.map((project) => (
            <ProjectCard key={project.number} project={project} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          {!stats || stats.recent.length === 0 ? (
            <EmptyState title="No operations yet" description="Run an authorized lab scan or sign in to see database records." />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/70">
              {stats.recent.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{entry.operation}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.project} · {entry.target}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge tone={entry.status === "completed" ? "success" : entry.status === "failed" ? "danger" : "info"}>
                      {entry.status}
                    </StatusBadge>
                    <span className="font-mono text-xs text-muted-foreground">{formatDateTime(entry.time)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/activity">
              View activity log
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Security Controls</h2>
          {checks.length === 0 ? (
            <EmptyState title="Controls unavailable" description="Sign in to load live configuration checks." />
          ) : (
            <div className="space-y-3">
              {checks.slice(0, 4).map((check) => (
                <SecurityCheckCard key={check.id} check={check} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen aria-hidden="true" className="size-4 text-primary" />
          Quick Start
        </h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {QUICK_START.map((item) => (
            <li key={item.step} className="rounded-xl border border-border bg-card/70 p-4">
              <p className="font-mono text-xs text-primary">{item.step}</p>
              <p className="mt-1 text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
