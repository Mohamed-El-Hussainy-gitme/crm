import type { ReactNode } from "react";

type Tone = "slate" | "sky" | "emerald" | "amber" | "rose";

const badgeToneMap: Record<Tone, string> = {
  slate: "border-transparent bg-enterprise-secondary text-enterprise-text shadow-panel",
  sky: "border-transparent bg-enterprise-primary/10 text-enterprise-primary shadow-panel",
  emerald: "border-transparent bg-enterprise-success/10 text-enterprise-success shadow-panel",
  amber: "border-transparent bg-enterprise-warning/10 text-enterprise-warning shadow-panel",
  rose: "border-transparent bg-enterprise-danger/10 text-enterprise-danger shadow-panel",
};

const statToneMap: Record<Tone, string> = {
  slate: "border-transparent bg-enterprise-secondary before:bg-enterprise-primary",
  sky: "border-transparent bg-enterprise-secondary before:bg-enterprise-primary",
  emerald: "border-transparent bg-enterprise-secondary before:bg-enterprise-success",
  amber: "border-transparent bg-enterprise-secondary before:bg-enterprise-warning",
  rose: "border-transparent bg-enterprise-secondary before:bg-enterprise-danger",
};

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-enterprise border border-transparent bg-enterprise-secondary shadow-panel">
      <div className="h-1.5 bg-gradient-to-r from-enterprise-primary via-enterprise-success to-enterprise-danger" />
      <div className="px-5 py-5 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            {eyebrow ? (
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-enterprise-primary">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-enterprise-text md:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-4xl text-sm leading-6 text-enterprise-muted">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-enterprise-border bg-enterprise-surface px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-enterprise-muted md:px-6">
        <span className="h-2 w-2 rounded-full bg-enterprise-primary" />
        <span>Backend driven</span>
        <span className="h-1 w-1 rounded-full bg-enterprise-border" />
        <span>Cloudflare Pages</span>
        <span className="h-1 w-1 rounded-full bg-enterprise-border" />
        <span>Supabase data</span>
      </div>
    </div>
  );
}
export function Card({
  title,
  description,
  actions,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-enterprise border border-transparent bg-enterprise-secondary shadow-panel ${className}`.trim()}>
      {title || description || actions || action ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-enterprise-border bg-enterprise-secondary px-5 py-4 md:px-6">
          <div className="max-w-2xl">
            {title ? <h2 className="font-display text-xl font-semibold text-enterprise-text">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-enterprise-muted">{description}</p> : null}
          </div>
          {actions || action ? <div className="flex flex-wrap gap-2">{actions || action}</div> : null}
        </div>
      ) : null}
      <div className="px-5 py-5 md:px-6">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: Tone;
}) {
  return (
    <div className={`relative overflow-hidden rounded-enterprise border p-4 shadow-panel before:absolute before:inset-y-0 before:start-0 before:w-1 ${statToneMap[tone]}`}>
      <div className="ps-2">
        <p className="text-sm font-semibold text-enterprise-muted">{label}</p>
        <p className="font-display mt-2 text-4xl font-semibold tracking-tight text-enterprise-text">{value}</p>
        {helper ? <p className="mt-2 text-sm leading-6 text-enterprise-muted">{helper}</p> : null}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-enterprise border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] ${badgeToneMap[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-enterprise border border-dashed border-enterprise-border bg-enterprise-surface px-4 py-10 text-center shadow-insetSoft">
      <p className="font-display text-xl font-semibold text-enterprise-text">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-enterprise-muted">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
