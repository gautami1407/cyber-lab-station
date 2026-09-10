import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/DashboardPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
  head: () => pageHead("Dashboard", "CyberLab Security Toolkit overview."),
});
