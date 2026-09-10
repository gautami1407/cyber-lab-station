import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { DataTable } from "@/components/common/DataTable";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadTextFile, formatDateTime, formatDuration, toCsv } from "@/lib/format";
import { securityService } from "@/services/securityService";
import type { ActivityEntry } from "@/types";

const statusTone = {
  success: "success",
  failed: "danger",
  stopped: "warning",
  running: "info",
} as const;

export function ActivityPage() {
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("all");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("all");
  const [page, setPage] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, q: query };
      if (project !== "all") params["project"] = project;
      if (status !== "all")
        params["status"] =
          status === "success" ? "completed" : status === "failed" ? "failed" : status === "stopped" ? "cancelled" : "running";
      if (date === "today") params["from"] = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const result = await securityService.getActivity(params);
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activity could not be loaded. Sign in first.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, project, status, date]);

  const successful = rows.filter((row) => row.status === "success").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Security Activity"
        description="Review security operations recorded in PostgreSQL for your account."
        icon={Activity}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Operations" value={total} />
        <StatCard label="Successful (this page)" value={successful} tone="success" />
        <StatCard label="Failed (this page)" value={failed} tone="danger" />
        <StatCard label="Loaded rows" value={rows.length} tone="accent" />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Input
          placeholder="Search project, operation, or target"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => {
            setPage(0);
            void load();
          }}
          aria-label="Search activity"
        />
        <Select value={project} onValueChange={(value) => { setProject(value); setPage(0); }}>
          <SelectTrigger aria-label="Filter by project">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="Port Scanner">Port Scanner</SelectItem>
            <SelectItem value="IP Range Scanner">IP Range Scanner</SelectItem>
            <SelectItem value="Subdomain Enumeration">Subdomain Enumeration</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
            <SelectItem value="running">Running</SelectItem>
          </SelectContent>
        </Select>
        <Select value={date} onValueChange={(value) => { setDate(value); setPage(0); }}>
          <SelectTrigger aria-label="Filter by date">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dates</SelectItem>
            <SelectItem value="today">Today</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingState label="Loading activity…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!loading && !error ? (
        <DataTable<ActivityEntry>
          caption="Security activity log"
          rows={rows}
          getRowId={(row) => row.id}
          emptyState={
            <EmptyState title="No security operations have been performed yet." description="Authorized scans and logins create rows here." />
          }
          columns={[
            { key: "time", header: "Time", render: (row) => formatDateTime(row.time) },
            { key: "project", header: "Project", render: (row) => row.project },
            { key: "operation", header: "Operation", render: (row) => row.operation },
            { key: "target", header: "Target", render: (row) => <span className="font-mono">{row.target}</span> },
            {
              key: "status",
              header: "Status",
              render: (row) => <StatusBadge tone={statusTone[row.status]}>{row.status}</StatusBadge>,
            },
            { key: "duration", header: "Duration", render: (row) => formatDuration(row.durationMs) },
          ]}
        />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Page {page + 1} of {pageCount}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const csv = toCsv(
              ["Time", "Project", "Operation", "Target", "Status", "Duration"],
              rows.map((row) => [row.time, row.project, row.operation, row.target, row.status, row.durationMs]),
            );
            downloadTextFile("cyberlab-activity.csv", csv);
          }} disabled={rows.length === 0}>
            Export page
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
