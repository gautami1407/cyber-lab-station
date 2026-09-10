import { SecurityBadge } from "./SecurityBadge";
import type { SecurityCheck } from "@/types";

export function SecurityCheckCard({ check }: { check: SecurityCheck }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">{check.title}</h3>
        <SecurityBadge status={check.status} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{check.description}</p>
    </div>
  );
}
