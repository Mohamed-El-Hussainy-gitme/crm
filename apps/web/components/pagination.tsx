"use client";

import { useI18n } from "@/components/providers";
import { buttonStyles } from "@/components/ui";

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{t("pagination.showing", { start, end, total: totalItems })}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className={buttonStyles("secondary", "sm")}>{t("pagination.previous")}</button>
        <span className="inline-flex items-center rounded-2xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
          {t("pagination.page", { page, totalPages })}
        </span>
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className={buttonStyles("secondary", "sm")}>{t("pagination.next")}</button>
      </div>
    </div>
  );
}
