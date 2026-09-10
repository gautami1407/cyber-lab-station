import { createFileRoute } from "@tanstack/react-router";
import { SubdomainPage } from "@/features/SubdomainPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/projects/subdomain-enumeration")({
  component: SubdomainPage,
  head: () => pageHead("Subdomain Enumeration", "Simulated subdomain discovery for authorized domains."),
});
