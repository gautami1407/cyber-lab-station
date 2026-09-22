import { createFileRoute } from "@tanstack/react-router";
import { AuditLogsPage } from "@/features/AuditLogsPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/audit-logs")({
  component: AuditLogsPage,
  head: () => pageHead("Audit Logs", "Review persisted account security actions."),
});