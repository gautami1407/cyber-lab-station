import { createFileRoute } from "@tanstack/react-router";
import { DiagnosticsPage } from "@/features/DiagnosticsPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/diagnostics")({
  component: DiagnosticsPage,
  head: () => pageHead("Diagnostics", "Run allowlisted network diagnostics."),
});