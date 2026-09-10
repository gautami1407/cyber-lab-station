import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/features/ActivityPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/activity")({
  component: ActivityPage,
  head: () => pageHead("Security Activity", "Review recent security operations performed in this environment."),
});
