import { ArrowRight, type LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

export interface ProjectSummary {
  number: number;
  title: string;
  description: string;
  concept: string;
  status: "Ready" | "Demo Mode" | "In Progress";
  progress: number;
  to: string;
  icon: LucideIcon;
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const { icon: Icon } = project;
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-border bg-card/80 p-5 shadow-[var(--shadow-panel)] transition-all hover:border-primary/50 hover:shadow-[var(--shadow-glow)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-primary">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              PROJECT {String(project.number).padStart(2, "0")}
            </p>
            <h3 className="text-base font-semibold">{project.title}</h3>
          </div>
        </div>
        <StatusBadge tone={project.status === "Ready" ? "success" : "accent"}>
          {project.status}
        </StatusBadge>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{project.description}</p>

      <dl className="mt-4 text-xs">
        <dt className="tracking-wide text-muted-foreground uppercase">Security concept</dt>
        <dd className="mt-1 font-medium text-foreground/90">{project.concept}</dd>
      </dl>

      <ProgressBar className="mt-4" value={project.progress} label="Completion" tone="accent" />

      <div className="mt-5 pt-1">
        <Button asChild className="w-full">
          <Link to={project.to} aria-label={`Open ${project.title}`}>
            Open Project
            <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </article>
  );
}
