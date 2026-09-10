import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PasswordStrengthResult } from "@/types";

const toneByScore = [
  "bg-destructive",
  "bg-destructive",
  "bg-warning",
  "bg-info",
  "bg-success",
] as const;

const textByScore = [
  "text-destructive",
  "text-destructive",
  "text-warning",
  "text-info",
  "text-success",
] as const;

export function PasswordStrengthMeter({
  result,
  showRequirements = true,
}: {
  result: PasswordStrengthResult;
  showRequirements?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Password strength</span>
        <span className={cn("font-semibold", textByScore[result.score])}>{result.label}</span>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < result.score ? toneByScore[result.score] : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        Password strength: {result.label}
      </p>
      {showRequirements ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {result.requirements.map((req) => (
            <li key={req.id} className="flex items-center gap-2 text-xs">
              {req.met ? (
                <Check aria-hidden="true" className="size-3.5 text-success" />
              ) : (
                <X aria-hidden="true" className="size-3.5 text-muted-foreground" />
              )}
              <span className={req.met ? "text-success" : "text-muted-foreground"}>
                {req.label}
              </span>
              <span className="sr-only">{req.met ? "requirement met" : "requirement not met"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
