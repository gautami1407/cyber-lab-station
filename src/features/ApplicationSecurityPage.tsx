import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { AlertBanner } from "@/components/common/AlertBanner";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { SecurityBadge, SeverityBadge } from "@/components/common/SecurityBadge";
import { SecurityCheckCard } from "@/components/common/SecurityCheckCard";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { securityService } from "@/services/securityService";
import type { CheckStatus, Recommendation, SecurityCheck, SeverityLevel, ValidationResponse } from "@/types";

const ROLE_LABEL: Record<string, string> = {
  guest: "Guest",
  user: "User",
  moderator: "Moderator",
  admin: "Administrator",
};

const SEVERITY_ORDER: SeverityLevel[] = ["critical", "high", "medium", "low"];

export function ApplicationSecurityPage() {
  const { user } = useAuth();
  const [sample, setSample] = useState("analyst@cyberlab.demo");
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [valError, setValError] = useState<string | null>(null);
  const [checks, setChecks] = useState<SecurityCheck[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [rbac, setRbac] = useState<Awaited<ReturnType<typeof securityService.getRbac>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      securityService
        .validateInput(sample)
        .then((result) => {
          setValidation(result);
          setValError(null);
        })
        .catch((err) => setValError(err instanceof Error ? err.message : "Validation unavailable. Sign in first."));
    }, 250);
    return () => clearTimeout(handle);
  }, [sample]);

  useEffect(() => {
    Promise.all([securityService.getChecks(), securityService.getRecommendations(), securityService.getRbac()])
      .then(([nextChecks, nextRecs, nextRbac]) => {
        setChecks(nextChecks);
        setRecs(nextRecs);
        setRbac(nextRbac);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Sign in to load security data."));
  }, []);

  const score = useMemo(() => {
    if (checks.length === 0) return null;
    const weight: Record<CheckStatus, number> = { pass: 100, warning: 50, fail: 0 };
    const total = checks.reduce((sum, check) => sum + weight[check.status], 0);
    return Math.round(total / checks.length);
  }, [checks]);

  const currentRole = user?.role ?? rbac?.role ?? "guest";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project 04"
        title="Application Security"
        description="Zod-backed validation and live control status from the API. Submitted text is never executed."
        icon={Lock}
      />
      {error ? <ErrorState message={error} /> : null}
      <Tabs defaultValue="validation" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="validation">Input Validation</TabsTrigger>
          <TabsTrigger value="authentication">Authentication</TabsTrigger>
          <TabsTrigger value="authorization">Authorization</TabsTrigger>
          <TabsTrigger value="checks">Security Checks</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="validation" className="space-y-4 rounded-xl border border-border bg-card/50 p-4 sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="sample">Sample user input</Label>
            <Input id="sample" value={sample} onChange={(e) => setSample(e.target.value)} />
            <p className="text-xs text-muted-foreground">Validated by POST /api/security/validate-input. Nothing is rendered as HTML or a command.</p>
          </div>
          {valError ? <ErrorState message={valError} /> : null}
          {validation ? (
            <>
              <AlertBanner variant={validation.safe ? "info" : "danger"} title={validation.safe ? "Input classified as safe" : "Input failed one or more checks"}>
                Sanitized preview: {validation.sanitized || "—"}
              </AlertBanner>
              <ul className="grid gap-3 sm:grid-cols-2">
                {validation.checks.map((check) => (
                  <li key={check.id} className="rounded-xl border border-border bg-card/70 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{check.label}</p>
                      <SecurityBadge status={check.status} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{check.detail}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <LoadingState label="Waiting for API validation…" />
          )}
        </TabsContent>

        <TabsContent value="authentication" className="grid gap-3 sm:grid-cols-2">
          {checks
            .filter((check) => ["authn", "password", "session", "rate"].includes(check.id))
            .map((check) => (
              <SecurityCheckCard key={check.id} check={check} />
            ))}
        </TabsContent>

        <TabsContent value="authorization" className="space-y-4 rounded-xl border border-border bg-card/50 p-4 sm:p-6">
          <p className="text-sm">
            Authenticated role: <StatusBadge tone="accent">{ROLE_LABEL[currentRole] ?? currentRole}</StatusBadge>
          </p>
          <p className="text-xs text-muted-foreground">This selector is read-only. The API enforces RBAC independently of the UI.</p>
          {rbac ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">Authorization matrix</caption>
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2">Feature</th>
                    {["guest", "user", "moderator", "admin"].map((role) => (
                      <th key={role} className="px-3 py-2">
                        {ROLE_LABEL[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(rbac.matrix).map(([feature, access]) => (
                    <tr key={feature} className="border-b border-border/60">
                      <th className="px-3 py-2 text-left font-medium">{feature}</th>
                      {["guest", "user", "moderator", "admin"].map((role) => {
                        const allowed = Boolean((access as Record<string, boolean | undefined>)[role]);
                        return (
                          <td key={role} className="px-3 py-2">
                            <StatusBadge tone={allowed ? "success" : "danger"}>{allowed ? "Yes" : "No"}</StatusBadge>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="RBAC unavailable" description="Sign in to load the server-side matrix." />
          )}
        </TabsContent>

        <TabsContent value="checks" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Overall score" value={score == null ? "—" : `${score}/100`} tone="accent" />
            <StatCard label="PASS" value={checks.filter((c) => c.status === "pass").length} tone="success" />
            <StatCard label="WARNING" value={checks.filter((c) => c.status === "warning").length} tone="warning" />
            <StatCard label="FAIL" value={checks.filter((c) => c.status === "fail").length} tone="danger" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {checks.map((check) => (
              <SecurityCheckCard key={check.id} check={check} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-6">
          {SEVERITY_ORDER.map((severity) => {
            const items = recs.filter((item) => item.severity === severity);
            if (items.length === 0) return null;
            return (
              <section key={severity} className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase">
                  <SeverityBadge severity={severity} />
                  {severity}
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((item) => (
                    <article key={item.id} className="rounded-xl border border-border bg-card/70 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold">{item.title}</h4>
                        <SeverityBadge severity={item.severity} />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{item.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
