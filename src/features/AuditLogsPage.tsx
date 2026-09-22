import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { auditService, type AuditLog } from "@/services/auditService";

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try { setLogs(await auditService.list()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Audit logs are unavailable."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return <div className="space-y-6">
    <PageHeader eyebrow="Account security" title="Audit Logs" description="Persisted actions recorded for this account and their masked targets." icon={ClipboardList} />
    {loading ? <LoadingState label="Loading audit records..." /> : null}
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
    {!loading && !error && logs.length === 0 ? <EmptyState title="No audit records" description="Security actions will appear here after they are recorded." /> : null}
    {!loading && !error && logs.length > 0 ? <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/70">{logs.map((log) => <article key={log.id} className="grid gap-2 px-4 py-4 md:grid-cols-[1.2fr_1fr_1fr_auto]"><div><p className="font-medium">{log.action}</p><p className="text-xs text-muted-foreground">{log.user?.username ?? "System"}</p></div><p className="text-sm text-muted-foreground">{log.targetMasked ?? "No target"}</p><p className="text-sm text-muted-foreground">{formatDateTime(log.createdAt)}</p><StatusBadge tone={log.success ? "success" : "danger"}>{log.success ? "Success" : "Failed"}</StatusBadge>{log.metadata ? <pre className="overflow-auto text-xs text-muted-foreground md:col-span-4">{JSON.stringify(log.metadata)}</pre> : null}</article>)}</div> : null}
  </div>;
}