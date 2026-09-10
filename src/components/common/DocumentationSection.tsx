import type { ReactNode } from "react";

export function DocumentationSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3 border-b border-border/70 pb-8 last:border-0">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function DocList({ items }: { items: { term: string; detail: string }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term} className="rounded-xl border border-border bg-card/60 p-4">
          <dt className="text-xs font-semibold tracking-wide text-primary uppercase">
            {item.term}
          </dt>
          <dd className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
