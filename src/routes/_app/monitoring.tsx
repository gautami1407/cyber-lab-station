import { createFileRoute } from "@tanstack/react-router";
import { MonitoringPage } from "@/features/MonitoringPage";

export const Route = createFileRoute("/_app/monitoring")({ component: MonitoringPage });