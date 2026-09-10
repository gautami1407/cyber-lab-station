import { useMemo, useState } from "react";
import { ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { AlertBanner } from "@/components/common/AlertBanner";
import { AuthorizationCheckbox } from "@/components/common/AuthorizationCheckbox";
import { DataTable } from "@/components/common/DataTable";
import { EmptyState, ErrorState } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { ProgressBar } from "@/components/common/ProgressBar";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TerminalOutput } from "@/components/common/TerminalOutput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLabOperation } from "@/hooks/useLabOperation";
import { downloadTextFile, formatDuration, formatMs, toCsv } from "@/lib/format";
import { scannerService } from "@/services/scannerService";
import type { PortResult, PortScanResponse, PortStatus, ScanProfile } from "@/types";

const statusTone: Record<PortStatus, "success" | "neutral" | "warning" | "danger"> = {
  open: "success",
  closed: "neutral",
  filtered: "warning",
  timeout: "warning",
  error: "danger",
};

export function PortScannerPage() {
  const [target, setTarget] = useState("127.0.0.1");
  const [startPort, setStartPort] = useState(1);
  const [endPort, setEndPort] = useState(1024);
  const [profile, setProfile] = useState<ScanProfile>("common");
  const [authorized, setAuthorized] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | PortStatus>("all");
  const scan = useLabOperation<PortScanResponse>();

  const results = scan.data?.results ?? [];
  const filtered = useMemo(() => {
    return results.filter((row) => {
      const matchesFilter = filter === "all" || row.status === filter;
      const haystack = `${row.port} ${row.service} ${row.status}`.toLowerCase();
      return matchesFilter && haystack.includes(query.toLowerCase());
    });
  }, [results, filter, query]);

  function startScan() {
    void scan.start(() =>
      scannerService.scanPorts({
        target,
        startPort,
        endPort,
        profile,
        authorized,
      }),
    );
  }

  function exportResults() {
    if (!scan.data) return;
    const csv = toCsv(
      ["Port", "Protocol", "Status", "Service", "Response Time"],
      scan.data.results.map((row) => [row.port, row.protocol, row.status, row.service, row.responseTimeMs]),
    );
    downloadTextFile("cyberlab-port-scan.csv", csv);
    toast.success("Exported current scan results.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project 02"
        title="Port Scanner"
        description="Backend TCP connect scanning against administrator-allowlisted lab targets only."
        icon={ScanSearch}
      />
      <AlertBanner variant="warning" title="Authorized systems only">
        Only scan systems you own or have explicit permission to test. Targets not on ALLOWED_SCAN_TARGETS are rejected.
      </AlertBanner>
      <AlertBanner variant="info" title="LAB ENVIRONMENT">
        Results are produced by the API from actual TCP connect attempts. Empty tables mean no scan has completed yet.
      </AlertBanner>

      <section className="grid gap-6 rounded-xl border border-border bg-card/60 p-4 sm:p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target">Target hostname / IP</Label>
            <Input id="target" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start-port">Start port</Label>
              <Input
                id="start-port"
                type="number"
                min={1}
                max={65535}
                value={startPort}
                onChange={(e) => setStartPort(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-port">End port</Label>
              <Input
                id="end-port"
                type="number"
                min={1}
                max={65535}
                value={endPort}
                onChange={(e) => setEndPort(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Scan profile</Label>
            <Select value={profile} onValueChange={(value) => setProfile(value as ScanProfile)}>
              <SelectTrigger aria-label="Scan profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="common">Common Ports</SelectItem>
                <SelectItem value="web">Web Ports</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AuthorizationCheckbox
            checked={authorized}
            onChange={setAuthorized}
            label="I confirm that I own this system or have explicit permission to test it."
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
            <ProgressBar value={scan.progress ?? 0} label="Scan progress" />
          )}
          <StatCard label="Operation" value={scan.opStatus ?? "idle"} />
          <TerminalOutput
            title="scanner · tcp connect"
            lines={
              scan.state === "idle"
                ? []
                : [
                    { text: `profile=${profile} target=${target}`, tone: "muted" },
                    { text: scan.state === "loading" ? "backend job running" : "job finished", tone: "default" },
                    { text: "SYN/UDP/stealth scanning are not implemented", tone: "muted" },
                  ]
            }
          />
        </div>
      </section>

      {scan.state === "error" && scan.error ? <ErrorState message={scan.error} onRetry={startScan} /> : null}

      {scan.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Ports scanned" value={scan.data.totalScanned} />
          <StatCard label="Open ports" value={scan.data.open} tone="success" />
          <StatCard label="Closed ports" value={scan.data.closed} />
          <StatCard label="Errors" value={scan.data.errors} tone="danger" />
          <StatCard label="Duration" value={formatDuration(scan.data.durationMs)} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search port or service"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search results"
        />
        <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="timeout">Timeout</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable<PortResult>
        caption="TCP connect scan results"
        rows={filtered}
        getRowId={(row) => String(row.port)}
        emptyState={
          <EmptyState
            title="No scan results available"
            description="Start an authorized scan to begin. Only allowlisted lab targets are accepted."
          />
        }
        columns={[
          { key: "port", header: "Port", render: (row) => <span className="font-mono">{row.port}</span> },
          { key: "protocol", header: "Protocol", render: (row) => row.protocol },
          {
            key: "status",
            header: "Status",
            render: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>,
          },
          { key: "service", header: "Service", render: (row) => row.service },
          { key: "rtt", header: "Response Time", render: (row) => formatMs(row.responseTimeMs) },
        ]}
      />
    </div>
  );
}
