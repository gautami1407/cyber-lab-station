import { useMemo, useState } from "react";
import { Globe } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLabOperation } from "@/hooks/useLabOperation";
import { downloadTextFile, formatDuration, toCsv } from "@/lib/format";
import { subdomainService } from "@/services/subdomainService";
import type { SubdomainResponse, SubdomainResult, SubdomainSource } from "@/types";

const ALL_METHODS: SubdomainSource[] = ["DNS", "Certificate Transparency"];

const statusTone = {
  active: "success",
  inactive: "neutral",
  found: "info",
} as const;

export function SubdomainPage() {
  const [domain, setDomain] = useState("localhost");
  const [authorized, setAuthorized] = useState(false);
  const [methods, setMethods] = useState<SubdomainSource[]>(["DNS"]);
  const scan = useLabOperation<SubdomainResponse>();

  function toggleMethod(method: SubdomainSource, on: boolean) {
    setMethods((prev) => (on ? [...new Set([...prev, method])] : prev.filter((item) => item !== method)));
  }

  function start() {
    void scan.start(() =>
      subdomainService.enumerate({
        domain,
        methods,
        authorized,
      }),
    );
  }

  function exportResults() {
    if (!scan.data) return;
    const csv = toCsv(
      ["Subdomain", "Status", "IP Address", "Source"],
      scan.data.results.map((row) => [row.subdomain, row.status, row.ipAddress, row.source]),
    );
    downloadTextFile("cyberlab-subdomains.csv", csv);
    toast.success("Exported current enumeration results.");
  }

  const results = scan.data?.results ?? [];
  const filtered = useMemo(() => results, [results]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project 05"
        title="Subdomain Enumeration"
        description="DNS (and optional Certificate Transparency) for domains on ALLOWED_ENUMERATION_DOMAINS only."
        icon={Globe}
      />
      <AlertBanner variant="warning" title="Authorized domains only">
        Enumerate only domains you own or have explicit permission to assess.
      </AlertBanner>
      <AlertBanner variant="info" title="LAB ENVIRONMENT">
        Names and addresses come from live lookups. If nothing resolves, the table stays empty.
      </AlertBanner>

      <section className="grid gap-6 rounded-xl border border-border bg-card/60 p-4 sm:p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="localhost" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Enumeration methods</legend>
            {ALL_METHODS.map((method) => (
              <div key={method} className="flex items-center gap-2">
                <Checkbox
                  id={method}
                  checked={methods.includes(method)}
                  onCheckedChange={(value) => toggleMethod(method, value === true)}
                />
                <Label htmlFor={method} className="font-normal">
                  {method}
                </Label>
              </div>
            ))}
          </fieldset>
          <AuthorizationCheckbox
            checked={authorized}
            onChange={setAuthorized}
            label="I confirm that I own this domain or have explicit permission to assess it."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={start} disabled={!authorized || scan.state === "loading" || methods.length === 0}>
              Start Enumeration
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
            <ProgressBar value={scan.progress ?? 0} label="Enumeration progress" />
          )}
          <p className="text-xs text-muted-foreground">
            {scan.state === "loading" ? "Backend job running…" : "Idle until an authorized run starts."}
          </p>
        </div>
      </section>

      {scan.state === "error" && scan.error ? <ErrorState message={scan.error} onRetry={start} /> : null}

      {scan.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Subdomains Found" value={scan.data.found} />
          <StatCard label="Active" value={scan.data.active} tone="success" />
          <StatCard label="Inactive" value={scan.data.inactive} />
          <StatCard label="Sources" value={scan.data.sources} tone="accent" />
        </div>
      ) : null}

      {scan.data ? <p className="text-xs text-muted-foreground">Duration {formatDuration(scan.data.durationMs)}</p> : null}

      <DataTable<SubdomainResult>
        caption="Enumeration results"
        rows={filtered}
        getRowId={(row) => `${row.subdomain}-${row.source}`}
        emptyState={
          <EmptyState
            title="No scan results available"
            description="Start an authorized enumeration to begin. Unauthorized domains are rejected."
          />
        }
        columns={[
          { key: "name", header: "Subdomain", render: (row) => <span className="font-mono">{row.subdomain}</span> },
          {
            key: "status",
            header: "Status",
            render: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>,
          },
          { key: "ip", header: "IP Address", render: (row) => row.ipAddress ?? "—" },
          { key: "source", header: "Source", render: (row) => row.source },
        ]}
      />
    </div>
  );
}
