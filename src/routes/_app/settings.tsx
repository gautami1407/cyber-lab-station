import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/SettingsPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
  head: () => pageHead("Settings", "General, backend, security, and about."),
});
