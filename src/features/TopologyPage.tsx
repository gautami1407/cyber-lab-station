import { useEffect, useState } from "react";
import { ExternalLink, GitBranch, Network } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { topologyService, type Topology } from "@/services/topologyService";

export function TopologyPage() {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void topologyService.getTopology().then(setTopology).catch((cause) => setError(cause instanceof Error ? cause.message : "Topology is unavailable."));
  }, []);
  return <div className="space-y-6">
    <PageHeader eyebrow="Observed relationships" title="Network Topology" description="Logical topology derived from authorized networks and observed devices." icon={Network} />
    {error ? <ErrorState message={error} /> : null}
    {!topology && !error ? <LoadingState label="Loading observed topology..." /> : null}
    {topology ? <>
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card/70 p-4 text-sm"><GitBranch className="mt-0.5 size-4 text-primary" aria-hidden="true" /><p><strong>Logical view.</strong> {topology.note}</p></div>
      {topology.networks.length === 0 ? <EmptyState title="No data available" description="Authorize a network and run discovery to populate topology." /> : <div className="space-y-4">{topology.networks.map((network) => <section key={network.id} className="rounded-xl border border-border bg-card/70 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{network.cidr}</h2><p className="text-xs text-muted-foreground">Interface {network.interfaceName}</p></div><StatusBadge tone="accent">{network.devices.length} device(s)</StatusBadge></div><div className="mt-4 grid gap-3 md:grid-cols-2">{network.devices.map((device) => <Link key={device.id} to="/devices/$id" params={{ id: device.id }} className="rounded-lg border border-border p-3 transition-colors hover:border-primary/50"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{device.hostname ?? "Unknown host"}</p><p className="font-mono text-xs text-muted-foreground">{device.ipAddress}</p></div><ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" /></div><p className="mt-2 text-xs text-muted-foreground">{device.serviceCount} service(s) · risk {device.riskLevel}</p></Link>)}</div></section>)}</div>}
    </> : null}
  </div>;
}
