import { createFileRoute } from "@tanstack/react-router";
import { TopologyPage } from "@/features/TopologyPage";

export const Route = createFileRoute("/_app/topology")({ component: TopologyPage });
