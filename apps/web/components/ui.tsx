"use client";

import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useI18n } from "@/components/providers";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "success" | "danger";
type ButtonSize = "sm" | "md";

export function buttonStyles(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  block = false,
) {
  return cx(
    "inline-flex items-center justify-center rounded-2xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
    block && "w-full",
    variant === "primary" && "bg-sky-600 text-white hover:bg-sky-700",
    variant === "secondary" && "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    variant === "ghost" && "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    variant === "success" && "bg-emerald-600 text-white hover:bg-emerald-700",
    variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
  );
}

export function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(baseFieldClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(baseFieldClass, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx("min-h-28", baseFieldClass, props.className)}
    />
  );
}

export function CheckboxCard({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300"
      />
      <span>
        <span className="block font-medium text-slate-800">{label}</span>
        {hint ? (
          <span className="mt-1 block text-xs text-slate-500">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  widthClass = "max-w-xl",
  eyebrow = "Quick create",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  widthClass?: string;
  eyebrow?: string;
}) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div
      className="drawer-root fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("common.close")}
        className="flex-1 cursor-default"
        onClick={onClose}
      />
      <div
        className={cx(
          "drawer-panel h-full w-full overflow-y-auto border-l border-slate-200 bg-white shadow-2xl",
          widthClass,
        )}
      >
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                {eyebrow}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {title}
              </h2>
              {description ? (
                <p className="mt-2 max-w-lg text-sm text-slate-500">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className={buttonStyles("ghost", "sm")}
            >
              {t("common.close")}
            </button>
          </div>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

export function SectionDivider({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-3">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

export function InfoTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <div className="mt-2 text-sm font-medium text-slate-900">{value}</div>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  actions,
  highlighted = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border px-4 py-4",
        highlighted ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
          {meta ? <div className="mt-3 text-xs text-slate-500">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

const baseFieldClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto">{children}</div>
    </div>
  );
}
