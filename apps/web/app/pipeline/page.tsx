"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { useI18n } from "@/components/providers";
import { buttonStyles, Input } from "@/components/ui";
import { FollowUpDrawer, type FollowUpInput } from "@/components/workflows";
import { apiFetch } from "@/lib/api";

const stages = ["LEAD", "INTERESTED", "POTENTIAL", "VISIT", "FREE_TRIAL", "CLIENT", "ON_HOLD", "LOST"] as const;
type Stage = (typeof stages)[number];

type Contact = {
  id: string;
  fullName: string;
  company?: string | null;
  companyName?: string | null;
  stage: Stage;
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

function nextStage(current: Stage) { const index = stages.indexOf(current); return stages[Math.min(index + 1, stages.length - 1)]; }
function previousStage(current: Stage) { const index = stages.indexOf(current); return stages[Math.max(index - 1, 0)]; }

export default function PipelinePage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [followUpContact, setFollowUpContact] = useState<Contact | null>(null);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const { t, formatDateTime, labelPipelineStage } = useI18n();

  const load = async () => {
    try {
      setError("");
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      const data = await apiFetch<Contact[]>(`/contacts${query.toString() ? `?${query.toString()}` : ""}`);
      setContacts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pipeline.loadFailed"));
    }
  };

  useEffect(() => { void load(); }, [search]);

  const grouped = useMemo(() => stages.reduce<Record<string, Contact[]>>((acc, stage) => { acc[stage] = contacts.filter((contact) => contact.stage === stage); return acc; }, {}), [contacts]);
  const activePipelineCount = contacts.filter((contact) => !["CLIENT", "LOST"].includes(contact.stage)).length;

  const moveStage = async (contact: Contact, stage: Stage) => {
    if (contact.stage === stage) return;
    try {
      setBusyId(contact.id);
      await apiFetch(`/contacts/${contact.id}/stage`, { method: "POST", body: JSON.stringify({ stage }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pipeline.moveFailed"));
    } finally { setBusyId(null); }
  };

  const scheduleFollowUp = async (payload: FollowUpInput) => {
    if (!followUpContact) return;
    try {
      setSavingFollowUp(true);
      await apiFetch(`/contacts/${followUpContact.id}/follow-ups`, { method: "POST", body: JSON.stringify(payload) });
      setFollowUpContact(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pipeline.scheduleFailed"));
    } finally { setSavingFollowUp(false); }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader eyebrow={t("pipeline.eyebrow")} title={t("pipeline.title")} description={t("pipeline.description")} actions={<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("pipeline.searchPlaceholder")} className="min-w-[280px]" />} />
        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {stages.map((stage) => <StatCard key={stage} label={labelPipelineStage(stage)} value={grouped[stage]?.length ?? 0} tone={stageTone(stage)} />)}
        </div>

        <Card title={t("pipeline.boardTitle")} description={t("pipeline.boardDescription", { count: activePipelineCount })}>
          <div className="grid gap-4 xl:grid-cols-6">
            {stages.map((stage) => (
              <div key={stage} className="min-h-[240px] rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{labelPipelineStage(stage)}</p>
                  <Badge tone={stageTone(stage)}>{grouped[stage]?.length ?? 0}</Badge>
                </div>

                <div className="space-y-3">
                  {grouped[stage]?.length ? grouped[stage].map((contact) => {
                    const previous = previousStage(contact.stage);
                    const next = nextStage(contact.stage);
                    const stageBusy = busyId === contact.id;
                    return (
                      <div key={contact.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-900">{contact.fullName}</p>
                            <p className="mt-1 text-xs text-slate-500">{contact.companyName || contact.company || t("common.noCompany")}</p>
                          </div>
                          {contact.tags?.[0] ? <Badge>{contact.tags[0]}</Badge> : null}
                        </div>
                        <p className="mt-3 text-xs text-slate-500">{contact.nextFollowUpAt ? formatDateTime(contact.nextFollowUpAt) : t("pipeline.noFollowUpScheduled")}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" disabled={stageBusy || previous === contact.stage} onClick={() => void moveStage(contact, previous)} className={buttonStyles("ghost", "sm")}>{t("pipeline.back")}</button>
                          <button type="button" disabled={stageBusy || next === contact.stage} onClick={() => void moveStage(contact, next)} className={buttonStyles("primary", "sm")}>{stageBusy ? t("common.saving") : t("pipeline.advance")}</button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => setFollowUpContact(contact)} className={buttonStyles("secondary", "sm")}>{t("pipeline.schedule")}</button>
                          <Link href={`/contacts/${contact.id}` as Route} className={buttonStyles("secondary", "sm")}>{t("common.open")}</Link>
                          <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className={buttonStyles("success", "sm")}>{t("common.whatsapp")}</a>
                        </div>
                      </div>
                    );
                  }) : <EmptyState title={t("pipeline.noContacts")} description={t("pipeline.noContactsDescription")} />}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <FollowUpDrawer open={Boolean(followUpContact)} onClose={() => setFollowUpContact(null)} contactLabel={followUpContact?.fullName} defaultTitle={followUpContact ? `${t("common.followUp")} ${followUpContact.fullName}` : ""} defaultDescription={followUpContact ? `${t("common.stage")}: ${labelPipelineStage(followUpContact.stage)}` : ""} busy={savingFollowUp} onSubmit={scheduleFollowUp} />
    </AppShell>
  );
}
