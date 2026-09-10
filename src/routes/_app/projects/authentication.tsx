import { createFileRoute } from "@tanstack/react-router";
import { AuthenticationPage } from "@/features/AuthenticationPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/projects/authentication")({
  component: AuthenticationPage,
  head: () => pageHead("Authentication Toolkit", "Registration, login, password policy, and sessions."),
});
