import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "accent";
  className?: string;
}) {
  const toneText = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    accent: "text-primary",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/80 p-4 shadow-[var(--shadow-panel)] backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {Icon ? <Icon aria-hidden="true" className={cn("size-4", toneText)} /> : null}
      </div>
      <p className={cn("mt-2 font-mono text-2xl font-semibold", toneText)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
