import { FormEvent, useState } from "react";
import { Activity, Network, Route, Search, Wrench } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { diagnosticsService, type DiagnosticMethod } from "@/services/diagnosticsService";

const methods: Array<{ id: DiagnosticMethod; label: string; icon: typeof Activity }> = [
  { id: "ping", label: "Ping", icon: Activity },
  { id: "dns", label: "DNS", icon: Search },
  { id: "latency", label: "Latency", icon: Network },
  { id: "traceroute", label: "Traceroute", icon: Route },
];

export function DiagnosticsPage() {
  const [target, setTarget] = useState("127.0.0.1");
  const [method, setMethod] = useState<DiagnosticMethod>("ping");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await diagnosticsService.run(method, target));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Diagnostic request failed.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Authorized network checks" title="Diagnostics" description="Run real diagnostics against targets covered by an authorized network." icon={Wrench} />
    <form onSubmit={run} className="space-y-4 rounded-xl border border-border bg-card/70 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <Input value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Diagnostic target" placeholder="127.0.0.1" required />
        <Button type="submit" disabled={loading || !target.trim()}><Wrench aria-hidden="true" /> Run diagnostic</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {methods.map(({ id, label, icon: Icon }) => <Button key={id} type="button" variant={method === id ? "default" : "outline"} onClick={() => setMethod(id)}><Icon aria-hidden="true" /> {label}</Button>)}
      </div>
    </form>
    {loading ? <p role="status" className="text-sm text-muted-foreground">Running {method} against {target}...</p> : null}
    {error ? <ErrorState message={error} /> : null}
    {!loading && !error && !result ? <EmptyState title="No diagnostic result" description="Choose a supported check and run it against an authorized target." /> : null}
    {result ? <section className="space-y-3 rounded-xl border border-border bg-card/70 p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{method} response</h2><StatusBadge tone="success">Returned by API</StatusBadge></div><pre className="overflow-auto rounded-lg bg-muted p-4 text-xs">{JSON.stringify(result, null, 2)}</pre></section> : null}
  </div>;
}