import { Loader2, Inbox, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-surface/40 px-6 py-12 text-center">
      <div className="rounded-full border border-border bg-muted p-3 text-muted-foreground">
        {icon ?? <Inbox aria-hidden="true" className="size-5" />}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Working…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface/40 p-6" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 animate-spin text-primary" />
        {label}
      </p>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Operation failed",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 p-5"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <TriangleAlert aria-hidden="true" className="size-4" />
        {title}
      </p>
      <p className="text-xs text-foreground/80">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
