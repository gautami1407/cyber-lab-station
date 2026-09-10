import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

/**
 * Responsive data table: a real table from `md` up, stacked cards below so
 * every column stays readable on phones.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  emptyState,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  caption?: string;
  emptyState?: ReactNode;
}) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-border bg-surface/70 text-left">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowId(row)}
                className="border-b border-border/60 last:border-0 hover:bg-accent/40"
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border/60 md:hidden">
        {rows.map((row) => (
          <li key={getRowId(row)} className="space-y-2 p-4">
            {columns.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-4">
                <span className="text-xs tracking-wide text-muted-foreground uppercase">
                  {c.header}
                </span>
                <span className="text-right text-sm">{c.render(row)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
