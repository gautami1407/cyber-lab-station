import { AlertTriangle, Info, ShieldAlert, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Variant = "warning" | "info" | "danger" | "demo";

const variantStyles: Record<Variant, { wrap: string; Icon: typeof Info }> = {
  warning: { wrap: "border-warning/35 bg-warning/10 text-warning", Icon: AlertTriangle },
  info: { wrap: "border-info/35 bg-info/10 text-info", Icon: Info },
  danger: { wrap: "border-destructive/35 bg-destructive/10 text-destructive", Icon: ShieldAlert },
  demo: { wrap: "border-primary/35 bg-primary/10 text-primary", Icon: FlaskConical },
};

export function AlertBanner({
  variant = "warning",
  title,
  children,
  className,
}: {
  variant?: Variant;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const { wrap, Icon } = variantStyles[variant];
  return (
    <div
      role="note"
      className={cn("flex gap-3 rounded-xl border px-4 py-3", wrap, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        {children ? (
          <div className="text-xs leading-relaxed text-foreground/75">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
