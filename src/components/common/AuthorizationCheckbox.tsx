import { ShieldCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function AuthorizationCheckbox({
  id = "authorization-confirm",
  checked,
  onChange,
  label = "I confirm that I have ownership or explicit authorization to test this target.",
}: {
  id?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-warning">
        <ShieldCheck aria-hidden="true" className="size-4" />
        Authorized Use Confirmation
      </p>
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onChange(value === true)}
          aria-describedby={`${id}-description`}
        />
        <Label htmlFor={id} className="cursor-pointer text-sm leading-relaxed font-normal">
          {label}
        </Label>
      </div>
      <p id={`${id}-description`} className="mt-2 text-xs text-muted-foreground">
        Actions stay disabled until this confirmation is given. Unauthorized scanning may be
        illegal in your jurisdiction.
      </p>
    </div>
  );
}
