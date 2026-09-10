import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { CheckStatus, SeverityLevel } from "@/types";

const statusMap = {
  pass: { tone: "success", label: "PASS", Icon: CheckCircle2 },
  warning: { tone: "warning", label: "WARNING", Icon: AlertTriangle },
  fail: { tone: "danger", label: "FAIL", Icon: XCircle },
} as const;

export function SecurityBadge({ status }: { status: CheckStatus }) {
  const { tone, label, Icon } = statusMap[status];
  return (
    <StatusBadge tone={tone} icon={<Icon aria-hidden="true" className="size-3.5" />}>
      {label}
    </StatusBadge>
  );
}

const severityTone = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
} as const;

export function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  return (
    <StatusBadge tone={severityTone[severity]} className="uppercase">
      {severity}
    </StatusBadge>
  );
}
