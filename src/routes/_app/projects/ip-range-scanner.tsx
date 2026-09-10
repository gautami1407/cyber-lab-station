import { createFileRoute } from "@tanstack/react-router";
import { IpRangeScannerPage } from "@/features/IpRangeScannerPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/projects/ip-range-scanner")({
  component: IpRangeScannerPage,
  head: () => pageHead("IP Range Scanner", "Simulated host discovery for authorized lab networks."),
});
