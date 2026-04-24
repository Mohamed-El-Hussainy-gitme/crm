"use client";

import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/cards";
import { useI18n } from "@/components/providers";

type Contact = {
  id: string;
  fullName: string;
  phone: string;
  normalizedPhone?: string | null;
  company?: string | null;
  companyName?: string | null;
  area?: string | null;
  locationText?: string | null;
  stage: string;
  nextFollowUpAt?: string | null;
  whatsappUrl: string;
  tags?: string[];
};

function stageTone(stage: string) {
  if (stage === "CLIENT") return "emerald" as const;
  if (stage === "LOST") return "rose" as const;
  if (stage === "ON_HOLD") return "amber" as const;
  if (["INTERESTED", "POTENTIAL", "VISIT", "FREE_TRIAL"].includes(stage)) return "sky" as const;
  return "slate" as const;
}

function rowButtonClass(tone: "neutral" | "success" = "neutral") {
  if (tone === "success") {
    return "rounded-md border border-enterprise-success/30 bg-enterprise-success/10 px-3 py-2 text-xs font-semibold text-enterprise-success transition hover:bg-enterprise-success/20";
  }
  return "rounded-md border border-enterprise-border bg-white px-3 py-2 text-xs font-semibold text-enterprise-muted transition hover:border-enterprise-primary hover:bg-enterprise-surface50 hover:text-enterprise-primary";
}

export function ContactsTable({
  contacts,
  selectedIds = [],
  onToggle,
  onEdit,
}: {
  contacts: Contact[];
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  onEdit?: (contact: Contact) => void;
}) {
  const { t, formatDateTime, labelPipelineStage } = useI18n();

  return (
    <div className="overflow-hidden rounded-xl border border-enterprise-border bg-white shadow-panel">
      <div className="border-b border-enterprise-border bg-enterprise-surface50 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">{t("contacts.title")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="crm-table min-w-full divide-y divide-enterprise-border text-sm">
          <thead className="bg-enterprise-primary text-white">
            <tr>
              {onToggle ? <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white/70">{t("contacts.table.select")}</th> : null}
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white/70">{t("contacts.table.contact")}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white/70">{t("contacts.table.phone")}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white/70">{t("contacts.table.companyArea")}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white/70">{t("contacts.table.stage")}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white/70">{t("contacts.table.nextAction")}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white/70">{t("contacts.table.tags")}</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white/70">{t("contacts.table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-enterprise-border bg-white">
            {contacts.map((contact) => (
              <tr key={contact.id} className="align-top">
                {onToggle ? (
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(contact.id)}
                      onChange={() => onToggle(contact.id)}
                      className="h-4 w-4 rounded border-enterprise-border text-enterprise-secondary focus:ring-enterprise-secondary"
                    />
                  </td>
                ) : null}
                <td className="px-4 py-4">
                  <div>
                    <p className="font-semibold text-enterprise-text">{contact.fullName}</p>
                    <p className="force-ltr mt-1 max-w-[13rem] truncate text-xs text-enterprise-muted">{contact.id}</p>
                  </div>
                </td>
                <td className="px-4 py-4 text-enterprise-muted">
                  <div className="force-ltr">
                    <p>{contact.phone}</p>
                    {contact.normalizedPhone ? <p className="mt-1 text-xs text-enterprise-muted">WhatsApp +{contact.normalizedPhone}</p> : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-enterprise-muted">
                  <div>
                    <p className="font-medium text-enterprise-text">{contact.companyName || contact.company || "—"}</p>
                    <p className="mt-1 text-xs text-enterprise-muted">{contact.area || contact.locationText || t("common.noLocationYet")}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Badge tone={stageTone(contact.stage)}>{labelPipelineStage(contact.stage)}</Badge>
                </td>
                <td className="px-4 py-4 text-enterprise-muted">{formatDateTime(contact.nextFollowUpAt)}</td>
                <td className="px-4 py-4">
                  <div className="flex max-w-xs flex-wrap gap-2">
                    {contact.tags?.length ? contact.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span className="text-enterprise-muted">—</span>}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className={rowButtonClass("success")}>{t("common.whatsapp")}</a>
                    {onEdit ? (
                      <button type="button" onClick={() => onEdit(contact)} className={rowButtonClass()}>{t("common.edit")}</button>
                    ) : null}
                    <Link href={`/contacts/view?id=${contact.id}` as Route} className={rowButtonClass()}>{t("common.open")}</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
