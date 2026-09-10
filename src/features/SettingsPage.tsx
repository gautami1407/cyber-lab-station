import { useEffect, useState } from "react";
import { AlertBanner } from "@/components/common/AlertBanner";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { API_BASE_URL } from "@/services/apiClient";
import { securityService } from "@/services/securityService";
import type { HealthStatus } from "@/types";

export function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [autoLogout, setAutoLogout] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof securityService.getPublicSettings>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([securityService.getHealth(), securityService.getPublicSettings().catch(() => null)])
      .then(([nextHealth, nextSettings]) => {
        setHealth(nextHealth);
        setSettings(nextSettings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Health check failed."))
      .finally(() => setLoading(false));
  }, []);

  const connected = Boolean(health?.api && health.database);
  const backendState = loading ? "Checking" : error ? "Unavailable" : connected ? "Connected" : "Disconnected";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Live backend visibility and local UI preferences. Secrets are never displayed."
      />
      {loading ? <LoadingState label="Checking backend health…" /> : null}
      {error ? <ErrorState message={error} /> : null}

      <section className="space-y-4 rounded-xl border border-border bg-card/60 p-5">
        <h2 className="text-lg font-semibold">General</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="theme">High contrast</Label>
            <p className="text-xs text-muted-foreground">SOC dark remains the default CyberLab theme.</p>
          </div>
          <Switch id="theme" checked={highContrast} onCheckedChange={setHighContrast} aria-label="High contrast theme" />
        </div>
        <p className="text-sm">
          Language: <span className="font-medium">English</span>
        </p>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="notifications">Notifications</Label>
          <Switch id="notifications" checked={notifications} onCheckedChange={setNotifications} />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card/60 p-5">
        <h2 className="text-lg font-semibold">Backend</h2>
        <AlertBanner variant={connected ? "info" : "warning"} title={connected ? "LAB ENVIRONMENT" : "Backend unavailable"}>
          Status is taken from GET /api/health. Database credentials are never shown.
        </AlertBanner>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Backend URL</dt>
            <dd className="font-mono text-sm">{API_BASE_URL}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Connection status</dt>
            <dd>
              <StatusBadge tone={backendState === "Connected" ? "success" : backendState === "Checking" ? "accent" : backendState === "Disconnected" ? "warning" : "danger"}>
                {backendState}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">API version</dt>
            <dd className="font-mono text-sm">{health?.apiVersion ?? settings?.apiVersion ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Environment</dt>
            <dd className="text-sm">{health?.environment ?? settings?.environment ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card/60 p-5">
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="text-sm text-muted-foreground">
          Session idle timeout: {settings?.sessionIdleMinutes ?? "—"} minutes. Absolute lifetime:{" "}
          {settings?.sessionAbsoluteHours ?? "—"} hours.
        </p>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="auto-logout">Auto logout (UI reminder)</Label>
          <Switch id="auto-logout" checked={autoLogout} onCheckedChange={setAutoLogout} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="sec-alerts">Security notifications</Label>
          <Switch id="sec-alerts" checked={securityAlerts} onCheckedChange={setSecurityAlerts} />
        </div>
        <p className="text-sm">
          Lab mode: <StatusBadge tone="accent">{settings?.labMode || health?.labMode ? "LAB" : "—"}</StatusBadge>
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card/60 p-5">
        <h2 className="text-lg font-semibold">About</h2>
        <p className="text-sm font-medium">CyberLab Security Toolkit</p>
        <p className="text-sm text-muted-foreground">Version 1.0.0 · Educational / authorized lab use</p>
        <p className="text-xs text-muted-foreground">
          React, TypeScript, TanStack Router, Tailwind, Express, Prisma, PostgreSQL, Argon2id.
        </p>
      </section>
    </div>
  );
}
