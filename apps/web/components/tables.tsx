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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="crm-table min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {onToggle ? <th className="px-4 py-3 font-medium">{t("contacts.table.select")}</th> : null}
              <th className="px-4 py-3 font-medium">{t("contacts.table.contact")}</th>
              <th className="px-4 py-3 font-medium">{t("contacts.table.phone")}</th>
              <th className="px-4 py-3 font-medium">{t("contacts.table.companyArea")}</th>
              <th className="px-4 py-3 font-medium">{t("contacts.table.stage")}</th>
              <th className="px-4 py-3 font-medium">{t("contacts.table.nextAction")}</th>
              <th className="px-4 py-3 font-medium">{t("contacts.table.tags")}</th>
              <th className="px-4 py-3 font-medium">{t("contacts.table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((contact) => (
              <tr key={contact.id} className="align-top">
                {onToggle ? (
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(contact.id)}
                      onChange={() => onToggle(contact.id)}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                  </td>
                ) : null}
                <td className="px-4 py-4">
                  <div>
                    <p className="font-medium text-slate-900">{contact.fullName}</p>
                    <p className="force-ltr mt-1 text-xs text-slate-500">{contact.id}</p>
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-700">
                  <div className="force-ltr">
                    <p>{contact.phone}</p>
                    {contact.normalizedPhone ? <p className="mt-1 text-xs text-slate-500">WhatsApp +{contact.normalizedPhone}</p> : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-700">
                  <div>
                    <p>{contact.companyName || contact.company || "—"}</p>
                    <p className="mt-1 text-xs text-slate-500">{contact.area || contact.locationText || t("common.noLocationYet")}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Badge tone={stageTone(contact.stage)}>{labelPipelineStage(contact.stage)}</Badge>
                </td>
                <td className="px-4 py-4 text-slate-700">{formatDateTime(contact.nextFollowUpAt)}</td>
                <td className="px-4 py-4">
                  <div className="flex max-w-xs flex-wrap gap-2">
                    {contact.tags?.length ? contact.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span className="text-slate-400">—</span>}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100">{t("common.whatsapp")}</a>
                    {onEdit ? (
                      <button type="button" onClick={() => onEdit(contact)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50">{t("common.edit")}</button>
                    ) : null}
                    <Link href={`/contacts/${contact.id}` as Route} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50">{t("common.open")}</Link>
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
