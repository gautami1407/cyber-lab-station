import { createFileRoute } from "@tanstack/react-router";
import { PortScannerPage } from "@/features/PortScannerPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/projects/port-scanner")({
  component: PortScannerPage,
  head: () => pageHead("Port Scanner", "Simulated TCP port discovery for authorized lab targets."),
});
