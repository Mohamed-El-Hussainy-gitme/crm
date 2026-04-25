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
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-enterprise border font-bold tracking-[-0.03em] transition active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-enterprise-primary focus-visible:ring-offset-2 focus-visible:ring-offset-enterprise-surface disabled:cursor-not-allowed disabled:opacity-55",
    size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm",
    block && "w-full",
    variant === "primary" && "border-enterprise-primary bg-enterprise-primary text-white shadow-panel hover:bg-enterprise-primaryMuted",
    variant === "secondary" && "border-transparent bg-enterprise-secondary text-enterprise-text shadow-panel hover:text-enterprise-primary",
    variant === "ghost" && "border-transparent bg-transparent text-enterprise-muted hover:bg-enterprise-secondary hover:text-enterprise-text hover:shadow-panel",
    variant === "success" && "border-enterprise-success bg-enterprise-success text-white shadow-panel hover:brightness-95",
    variant === "danger" && "border-enterprise-danger bg-enterprise-danger text-white shadow-panel hover:brightness-95",
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
        <p className="text-sm font-semibold text-enterprise-text">{label}</p>
        {hint ? <p className="mt-1 text-xs leading-5 text-enterprise-muted">{hint}</p> : null}
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
    <label className="flex min-h-12 items-start gap-3 rounded-enterprise border border-transparent bg-enterprise-secondary px-4 py-3 text-sm text-enterprise-muted shadow-panel hover:text-enterprise-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-enterprise-border text-enterprise-secondary focus:ring-enterprise-secondary"
      />
      <span>
        <span className="block font-semibold text-enterprise-text">{label}</span>
        {hint ? (
          <span className="mt-1 block text-xs leading-5 text-enterprise-muted">{hint}</span>
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
      className="drawer-root fixed inset-0 z-50 flex justify-end bg-enterprise-primary/50 backdrop-blur-sm"
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
          "drawer-panel h-full w-full overflow-y-auto border-l border-enterprise-border bg-white shadow-2xl",
          widthClass,
        )}
      >
        <div className="sticky top-0 z-10 border-b border-enterprise-border bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-enterprise-secondary">
                {eyebrow}
              </p>
              <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-enterprise-text">
                {title}
              </h2>
              {description ? (
                <p className="mt-2 max-w-lg text-sm leading-6 text-enterprise-muted">
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
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-enterprise-border pb-3">
      <div>
        <h3 className="font-display text-base font-semibold text-enterprise-text">{title}</h3>
        {hint ? <p className="mt-1 text-sm leading-6 text-enterprise-muted">{hint}</p> : null}
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
    <div className="rounded-enterprise border border-transparent bg-enterprise-surface px-4 py-4 shadow-insetSoft">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">
        {label}
      </p>
      <div className="mt-2 text-sm font-semibold text-enterprise-text">{value}</div>
      {hint ? <p className="mt-2 text-xs leading-5 text-enterprise-muted">{hint}</p> : null}
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
        "rounded-enterprise border px-4 py-4",
        highlighted
          ? "border-enterprise-primary bg-enterprise-primary/10 shadow-insetSoft"
          : "border-transparent bg-enterprise-secondary shadow-panel",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-enterprise-text">{title}</div>
          {subtitle ? <div className="mt-1 text-sm leading-6 text-enterprise-muted">{subtitle}</div> : null}
          {meta ? <div className="mt-3 text-xs text-enterprise-muted">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

const baseFieldClass =
  "w-full rounded-enterprise border border-transparent bg-enterprise-surface px-4 py-2.5 text-sm text-enterprise-text placeholder:text-enterprise-muted/70 shadow-insetSoft focus:border-enterprise-primary focus:ring-2 focus:ring-enterprise-primary/25";

export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-enterprise-border bg-enterprise-surface/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-panel backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto">{children}</div>
    </div>
  );
}
