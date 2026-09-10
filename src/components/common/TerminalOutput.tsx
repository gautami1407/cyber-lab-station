import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TerminalLine {
  text: string;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}

export function TerminalOutput({
  title = "console",
  lines,
  className,
}: {
  title?: string;
  lines: TerminalLine[];
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  };

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-background/80", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-surface/70 px-4 py-2">
        <Terminal aria-hidden="true" className="size-3.5 text-primary" />
        <span className="font-mono text-xs text-muted-foreground">{title}</span>
      </div>
      <div
        className="max-h-72 overflow-auto p-4 font-mono text-xs leading-6"
        role="log"
        aria-live="polite"
      >
        {lines.length === 0 ? (
          <p className="text-muted-foreground">$ awaiting operation…</p>
        ) : (
          lines.map((line, i) => (
            <p key={i} className={toneClass[line.tone ?? "default"]}>
              <span className="mr-2 text-primary/70">$</span>
              {line.text}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
