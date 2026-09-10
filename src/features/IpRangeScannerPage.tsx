import { useMemo, useState } from "react";
import { Radar } from "lucide-react";
import { toast } from "sonner";
import { AlertBanner } from "@/components/common/AlertBanner";
import { AuthorizationCheckbox } from "@/components/common/AuthorizationCheckbox";
import { DataTable } from "@/components/common/DataTable";
import { EmptyState, ErrorState } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgressBar } from "@/components/common/ProgressBar";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLabOperation } from "@/hooks/useLabOperation";
import { downloadTextFile, formatDuration, formatMs, toCsv } from "@/lib/format";
import { ipScannerService } from "@/services/scannerService";
import type { DiscoveryMethod, HostResult, HostStatus, IpRangeScanResponse } from "@/types";

const statusTone: Record<HostStatus, "success" | "neutral" | "warning" | "danger"> = {
  active: "success",
  inactive: "neutral",
  unknown: "warning",
  error: "danger",
};

export function IpRangeScannerPage() {
  const [startIp, setStartIp] = useState("127.0.0.1");
  const [endIp, setEndIp] = useState("127.0.0.1");
  const [cidr, setCidr] = useState("127.0.0.1/32");
  const [method, setMethod] = useState<DiscoveryMethod>("tcp");
  const [authorized, setAuthorized] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | HostStatus>("all");
  const scan = useLabOperation<IpRangeScanResponse>();

  const results = scan.data?.results ?? [];
  const filtered = useMemo(() => {
    return results.filter((row) => {
      const matches = filter === "all" || row.status === filter;
      const haystack = `${row.ip} ${row.hostname ?? ""} ${row.status}`.toLowerCase();
      return matches && haystack.includes(query.toLowerCase());
    });
  }, [results, filter, query]);

  function startScan() {
    void scan.start(() =>
      ipScannerService.scanRange({
        startIp,
        endIp,
        ...(cidr ? { cidr } : {}),
        method: "tcp",
        authorized,
      }),
    );
  }

  function exportResults() {
    if (!scan.data) return;
    const csv = toCsv(
      ["IP Address", "Status", "Hostname", "Response Time", "Method"],
      scan.data.results.map((row) => [row.ip, row.status, row.hostname, row.responseTimeMs, row.method]),
    );
    downloadTextFile("cyberlab-host-scan.csv", csv);
    toast.success("Exported current host results.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project 03"
        title="IP Range Scanner"
        description="TCP probe discovery for allowlisted lab addresses only. Hostnames are reverse-DNS when available."
        icon={Radar}
      />
      <AlertBanner variant="warning" title="Authorized networks only">
        Every address in the requested range must also appear on ALLOWED_SCAN_TARGETS.
      </AlertBanner>
      <AlertBanner variant="info" title="LAB ENVIRONMENT">
        ICMP/ARP are not used. The API probes configured TCP ports (PROBE_PORTS).
      </AlertBanner>

      <section className="grid gap-6 rounded-xl border border-border bg-card/60 p-4 sm:p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-ip">Start IP</Label>
              <Input id="start-ip" value={startIp} onChange={(e) => setStartIp(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-ip">End IP</Label>
              <Input id="end-ip" value={endIp} onChange={(e) => setEndIp(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cidr">CIDR (optional)</Label>
            <Input id="cidr" value={cidr} onChange={(e) => setCidr(e.target.value)} />
            <p className="text-xs text-muted-foreground">Example: 127.0.0.1/32</p>
          </div>
          <div className="space-y-2">
            <Label>Discovery method</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as DiscoveryMethod)}>
              <SelectTrigger aria-label="Discovery method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tcp">TCP probe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AuthorizationCheckbox
            checked={authorized}
            onChange={setAuthorized}
            label="I confirm that I have ownership or explicit authorization to test this network."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={startScan} disabled={!authorized || scan.state === "loading"}>
              Start Scan
            </Button>
            <Button type="button" variant="outline" onClick={() => void scan.stop()} disabled={scan.state !== "loading"}>
              Stop
            </Button>
            <Button type="button" variant="ghost" onClick={scan.reset}>
              Clear
            </Button>
            <Button type="button" variant="outline" onClick={exportResults} disabled={!scan.data}>
              Export
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          {scan.progress == null && scan.state === "loading" ? (
            <p className="text-sm font-medium text-primary">Running</p>
          ) : (
            <ProgressBar value={scan.progress ?? 0} label="Discovery progress" />
          )}
          <StatCard label="Operation" value={scan.opStatus ?? "idle"} />
        </div>
      </section>

      {scan.state === "error" && scan.error ? <ErrorState message={scan.error} onRetry={startScan} /> : null}

      {scan.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Addresses Checked" value={scan.data.checked} />
          <StatCard label="Active Hosts" value={scan.data.active} tone="success" />
          <StatCard label="Inactive Hosts" value={scan.data.inactive} />
          <StatCard label="Errors" value={scan.data.errors} tone="danger" />
        </div>
      ) : null}

      {scan.data ? <p className="text-xs text-muted-foreground">Duration {formatDuration(scan.data.durationMs)}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input placeholder="Search IP or hostname" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search hosts" />
        <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable<HostResult>
        caption="Host discovery results"
        rows={filtered}
        getRowId={(row) => row.ip}
        emptyState={
          <EmptyState
            title="No scan results available"
            description="Start an authorized scan to begin. Unauthorized ranges are rejected by the API."
          />
        }
        columns={[
          { key: "ip", header: "IP Address", render: (row) => <span className="font-mono">{row.ip}</span> },
          {
            key: "status",
            header: "Status",
            render: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>,
          },
          { key: "hostname", header: "Hostname", render: (row) => row.hostname ?? "—" },
          { key: "rtt", header: "Response Time", render: (row) => formatMs(row.responseTimeMs) },
          { key: "method", header: "Method", render: (row) => row.method.toUpperCase() },
        ]}
      />
    </div>
  );
}
