import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  label,
  tone = "accent",
  showValue = true,
  className,
}: {
  value: number;
  label?: string;
  tone?: "accent" | "success" | "warning" | "danger" | "secondary";
  showValue?: boolean;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  const bar = {
    accent: "bg-primary",
    secondary: "bg-secondary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
  }[tone];

  return (
    <div className={cn("space-y-1.5", className)}>
      {label || showValue ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {showValue ? <span className="font-mono">{clamped}%</span> : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", bar)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
