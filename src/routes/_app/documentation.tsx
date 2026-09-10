import { createFileRoute } from "@tanstack/react-router";
import { DocumentationPage } from "@/features/DocumentationPage";
import { pageHead } from "@/lib/navigation";

export const Route = createFileRoute("/_app/documentation")({
  component: DocumentationPage,
  head: () => pageHead("Documentation", "CyberLab architecture, modules, and authorized use."),
});
