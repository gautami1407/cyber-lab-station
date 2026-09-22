import { useEffect, useState } from "react";
import { AlertTriangle, Clock3, Radio } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { monitoringService, type MonitoringStatus, type SecurityAlert, type SecurityEvent } from "@/services/monitoringService";
import { connectRealtime } from "@/services/realtimeClient";

export function MonitoringPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<MonitoringStatus>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    try { const [nextStatus, nextEvents, nextAlerts] = await Promise.all([monitoringService.status(), monitoringService.events(), monitoringService.alerts()]); setStatus(nextStatus); setEvents(nextEvents); setAlerts(nextAlerts); } catch (cause) { setError(cause instanceof Error ? cause.message : "Monitoring data is unavailable."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => connectRealtime((event) => { if (["ALERT_CREATED", "SECURITY_EVENT", "DEVICE_OFFLINE"].includes(event.type)) void load(); }), []);
  async function update(id: string, status: "ACKNOWLEDGED" | "RESOLVED") { try { await monitoringService.updateAlert(id, status); await load(); toast.success(`Alert ${status.toLowerCase()}.`); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Alert update failed."); } }
  async function toggleMonitoring() { setBusy(true); try { const next = status?.enabled ? await monitoringService.stop() : await monitoringService.start(); setStatus(next); await load(); toast.success(status?.enabled ? "Monitoring stopped." : "Monitoring started."); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Monitoring update failed."); } finally { setBusy(false); } }
  return <div className="space-y-6">
    <PageHeader eyebrow="Security monitoring" title="Events & Alerts" description="Evidence-based changes recorded by controlled monitoring." icon={Radio} />
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/70 p-4"><div><p className="font-medium">Monitoring {status?.enabled ? "active" : "stopped"}</p><p className="text-xs text-muted-foreground">{status?.enabled ? `Tick interval: ${status.intervalSeconds}s` : "Start an authorized observation cycle."}</p></div><Button size="sm" variant={status?.enabled ? "outline" : "default"} onClick={() => void toggleMonitoring()} disabled={busy}>{status?.enabled ? "Stop monitoring" : "Start monitoring"}</Button></section>
    {loading ? <LoadingState label="Loading monitoring history..." /> : null}
    {error ? <ErrorState message={error} /> : null}
    <section className="space-y-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="size-4 text-primary" aria-hidden="true" /> Alerts</h2>{alerts.length === 0 ? <EmptyState title="No data available" description="No security alerts have been generated." /> : <div className="space-y-3">{alerts.map((alert) => <article key={alert.id} className="rounded-xl border border-border bg-card/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{alert.title}</p><p className="mt-1 text-sm text-muted-foreground">{alert.explanation}</p><p className="mt-2 text-xs text-muted-foreground">{alert.device?.hostname ?? alert.device?.ipAddress ?? "Unknown device"}</p></div><StatusBadge tone={alert.severity === "HIGH" || alert.severity === "CRITICAL" ? "danger" : "warning"}>{alert.severity} · {alert.status}</StatusBadge></div>{alert.status !== "RESOLVED" ? <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => void update(alert.id, "ACKNOWLEDGED")} disabled={alert.status === "ACKNOWLEDGED"}>Acknowledge</Button><Button size="sm" onClick={() => void update(alert.id, "RESOLVED")}>Resolve</Button></div> : null}</article>)}</div>}</section>
    <section className="space-y-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Clock3 className="size-4 text-primary" aria-hidden="true" /> Timeline</h2>{events.length === 0 ? <EmptyState title="No data available" description="Monitoring events will appear here after an authorized cycle." /> : <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/70">{events.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="font-medium">{event.type}</p><p className="text-xs text-muted-foreground">{event.description} · {event.device?.ipAddress ?? "Unknown device"}</p></div><StatusBadge tone={event.severity === "HIGH" || event.severity === "CRITICAL" ? "danger" : "accent"}>{event.severity}</StatusBadge></div>)}</div>}</section>
  </div>;
}