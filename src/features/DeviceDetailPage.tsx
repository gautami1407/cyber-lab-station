import { useEffect, useState } from "react";
import { Activity, Cpu, Radar } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { networkService, type DeviceDetail } from "@/services/networkService";

export function DeviceDetailPage() {
  const { id } = useParams({ from: "/_app/devices/$id" });
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  async function load() {
    try { setDevice(await networkService.device(id)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Device data is unavailable."); }
  }
  useEffect(() => {
    void load();
  }, [id]);
  async function scanServices() {
    setScanning(true);
    setError(null);
    try {
      await networkService.scanServices(id);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const next = await networkService.device(id);
        setDevice(next);
        if (next.scans[0]?.status === "COMPLETED" || next.scans[0]?.status === "FAILED") break;
      }
      toast.success("Service scan finished.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Service scan failed.");
    } finally {
      setScanning(false);
    }
  }
  if (error) return <ErrorState message={error} />;
  if (!device) return <LoadingState label="Loading device history..." />;
  return <div className="space-y-6">
    <PageHeader eyebrow="Observed device" title={device.hostname ?? device.ipAddress} description="Live inventory, service history, and observations from the authorized network." icon={Cpu} />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["IP address", device.ipAddress], ["MAC address", device.macAddress ?? "Unknown"], ["Status", device.status], ["Risk", device.riskLevel]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card/70 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>)}</section>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Radar className="size-4 text-primary" aria-hidden="true" /> Services</h2><Button size="sm" onClick={() => void scanServices()} disabled={scanning}>{scanning ? "Scanning..." : "Scan services"}</Button></div>{device.services.length === 0 ? <EmptyState title="No data available" description="Run a service scan for this device." /> : <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/70">{device.services.map((service) => <div key={service.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-medium">{service.name}</p><p className="font-mono text-xs text-muted-foreground">{service.protocol}/{service.port}</p></div><StatusBadge tone={service.status === "OPEN" ? "warning" : "accent"}>{service.status}</StatusBadge></div>)}</div>}</section>
    <section className="space-y-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="size-4 text-primary" aria-hidden="true" /> Observation history</h2>{device.observations.length === 0 ? <EmptyState title="No data available" description="Discovery has not recorded observations for this device." /> : <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/70">{device.observations.map((observation) => <div key={observation.observedAt} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="font-medium">{observation.status}</p><p className="text-xs text-muted-foreground">{observation.ipAddress} · {observation.hostname ?? "Hostname unknown"}</p></div><time className="font-mono text-xs text-muted-foreground">{new Date(observation.observedAt).toLocaleString()}</time></div>)}</div>}</section>
  </div>;
}
