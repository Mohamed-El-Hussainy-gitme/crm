import type { ReactNode } from "react";

type Tone = "slate" | "sky" | "emerald" | "amber" | "rose";

const badgeToneMap: Record<Tone, string> = {
  slate: "border-slate-200 bg-slate-100 text-slate-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
};

const statToneMap: Record<Tone, string> = {
  slate: "bg-white border-slate-200",
  sky: "bg-sky-50 border-sky-100",
  emerald: "bg-emerald-50 border-emerald-100",
  amber: "bg-amber-50 border-amber-100",
  rose: "bg-rose-50 border-rose-100",
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow ? <p className="text-sm font-semibold text-sky-700">{eyebrow}</p> : null}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">{title}</h1>
        {description ? <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
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
    <section className={`overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm ${className}`.trim()}>
      {title || description || actions || action ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
          <div className="max-w-2xl">
            {title ? <h2 className="text-base font-semibold text-slate-900">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
          </div>
          {actions || action ? <div className="flex flex-wrap gap-2">{actions || action}</div> : null}
        </div>
      ) : null}
      <div className="px-5 py-4 md:px-6">{children}</div>
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
    <div className={`rounded-[24px] border p-5 shadow-sm ${statToneMap[tone]}`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
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
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${badgeToneMap[tone]}`}>
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
    <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
