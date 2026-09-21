import { createFileRoute } from "@tanstack/react-router";
import { NetworksPage } from "@/features/NetworksPage";

export const Route = createFileRoute("/_app/networks")({
  component: NetworksPage,
});