import { createFileRoute } from "@tanstack/react-router";
import { ApplicationSecurityPage } from "@/features/ApplicationSecurityPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/projects/application-security")({
  component: ApplicationSecurityPage,
  head: () => pageHead("Application Security", "Validation, authentication, authorization, and checks."),
});
