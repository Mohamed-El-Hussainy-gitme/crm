"use client";

import { useEffect, useMemo, useState } from "react";
import { PIPELINE_STAGES, updateStageSchema } from "@smartcrm/shared";
import { AppShell } from "@/components/layout";
import { useI18n } from "@/components/providers";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { ContactEditorDrawer } from "@/components/contact-editor";
import { PaginationControls } from "@/components/pagination";
import { ContactsTable } from "@/components/tables";
import { buttonStyles, CheckboxCard, FieldShell, Input, Select } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { validateSchema } from "@/lib/forms";

const stages = ["", ...PIPELINE_STAGES];

type Company = { id: string; name: string };
type Contact = {
  id: string;
  fullName: string;
  firstName: string;
  lastName?: string | null;
  phone: string;
  normalizedPhone?: string | null;
  email?: string | null;
  company?: string | null;
  companyName?: string | null;
  source?: string | null;
  locationText?: string | null;
  area?: string | null;
  mapUrl?: string | null;
  placeLabel?: string | null;
  stage: string;
  expectedDealValue?: number;
  tags?: string[];
  nextFollowUpAt?: string | null;
  lastContactedAt?: string | null;
  isWhatsappOptedIn?: boolean;
  whatsappUrl: string;
};

export default function ContactsPage() {
  const { t, labelPipelineStage } = useI18n();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [source, setSource] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [tag, setTag] = useState("");
  const [noNextAction, setNoNextAction] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStage, setBulkStage] = useState("INTERESTED");
  const [bulkTags, setBulkTags] = useState("priority");
  const [error, setError] = useState("");
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [page, setPage] = useState(1);

  const load = async () => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (stage) query.set("stage", stage);
    if (source) query.set("source", source);
    if (companyId) query.set("companyId", companyId);
    if (tag) query.set("tag", tag);
    if (noNextAction) query.set("noNextAction", "true");
    if (staleOnly) query.set("staleDays", "7");

    try {
      setError("");
      const [contactsData, companiesData] = await Promise.all([
        apiFetch<Contact[]>(`/contacts${query.toString() ? `?${query.toString()}` : ""}`),
        apiFetch<Company[]>("/companies"),
      ]);
      setContacts(contactsData);
      setCompanies(companiesData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts");
    }
  };

  useEffect(() => {
    void load();
  }, [search, stage, source, companyId, tag, noNextAction, staleOnly]);

  useEffect(() => {
    setPage(1);
  }, [search, stage, source, companyId, tag, noNextAction, staleOnly]);

  const sources = useMemo(
    () =>
      Array.from(new Set(contacts.map((contact) => contact.source).filter((value): value is string => Boolean(value)))).sort(),
    [contacts],
  );
  const clientCount = useMemo(() => contacts.filter((contact) => contact.stage === "CLIENT").length, [contacts]);
  const pipelineCount = useMemo(() => contacts.filter((contact) => !["CLIENT", "LOST"].includes(contact.stage)).length, [contacts]);
  const withLocationCount = useMemo(() => contacts.filter((contact) => contact.locationText || contact.area || contact.mapUrl).length, [contacts]);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(contacts.length / pageSize));
  const visibleContacts = useMemo(() => contacts.slice((page - 1) * pageSize, page * pageSize), [contacts, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggle = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const applyBulkStage = async () => {
    if (!selectedIds.length) return;
    const parsed = validateSchema(updateStageSchema, { stage: bulkStage });
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    await apiFetch("/contacts/bulk/stage", {
      method: "POST",
      body: JSON.stringify({ ids: selectedIds, stage: parsed.data.stage }),
    });
    setSelectedIds([]);
    await load();
  };

  const applyBulkTags = async () => {
    const tags = bulkTags.split(",").map((item) => item.trim()).filter(Boolean);
    if (!selectedIds.length || !tags.length) return;
    await apiFetch("/contacts/bulk/tags", {
      method: "POST",
      body: JSON.stringify({ ids: selectedIds, tags }),
    });
    setSelectedIds([]);
    await load();
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("contacts.eyebrow")}
          title={t("contacts.title")}
          description={t("contacts.description")}
          actions={
            <button type="button" onClick={() => { setEditingContact(null); setEditorMode("create"); }} className={buttonStyles("primary")}>
              {t("contacts.addContact")}
            </button>
          }
        />

        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("contacts.visibleContacts")} value={contacts.length} helper={t("contacts.filteredResultSet")} />
          <StatCard label={t("contacts.activePipeline")} value={pipelineCount} helper={t("contacts.notClientOrLost")} tone="sky" />
          <StatCard label={t("contacts.clients")} value={clientCount} helper={t("contacts.convertedContacts")} tone="emerald" />
          <StatCard label={t("contacts.locationReady")} value={withLocationCount} helper={t("contacts.locationReadyHint")} tone="amber" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card title={t("contacts.filtersTitle")} description={t("contacts.filtersDescription")}>
            <div className="grid gap-3 md:grid-cols-2">
              <FieldShell label={t("common.search")}>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("contacts.searchPlaceholder")} />
              </FieldShell>
              <FieldShell label={t("common.stage")}>
                <Select value={stage} onChange={(event) => setStage(event.target.value)}>
                  {stages.map((value) => (
                    <option key={value} value={value}>{value ? labelPipelineStage(value) : t("contacts.allStages")}</option>
                  ))}
                </Select>
              </FieldShell>
              <FieldShell label={t("common.source")}>
                <Select value={source} onChange={(event) => setSource(event.target.value)}>
                  <option value="">{t("contacts.allSources")}</option>
                  {sources.map((value) => <option key={value} value={value}>{value}</option>)}
                </Select>
              </FieldShell>
              <FieldShell label={t("common.company")}>
                <Select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                  <option value="">{t("contacts.allCompanies")}</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </Select>
              </FieldShell>
              <div className="md:col-span-2">
                <FieldShell label={t("contacts.tagContains")}>
                  <Input value={tag} onChange={(event) => setTag(event.target.value)} placeholder={t("contacts.tagPlaceholder")} />
                </FieldShell>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <CheckboxCard checked={noNextAction} onChange={setNoNextAction} label={t("contacts.noNextActionOnly")} hint={t("contacts.noNextActionHint")} />
              <CheckboxCard checked={staleOnly} onChange={setStaleOnly} label={t("contacts.staleLast7Days")} hint={t("contacts.staleLast7DaysHint")} />
            </div>
          </Card>

          <Card title={t("contacts.bulkActions")} description={t("contacts.bulkDescription")}>
            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-800">{t("common.selectedRows")}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{selectedIds.length}</p>
                <p className="mt-2 text-sm text-slate-500">{t("contacts.selectedRowsHint")}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FieldShell label={t("contacts.moveStage")}>
                  <Select value={bulkStage} onChange={(event) => setBulkStage(event.target.value)}>
                    {PIPELINE_STAGES.map((value) => <option key={value} value={value}>{labelPipelineStage(value)}</option>)}
                  </Select>
                </FieldShell>
                <FieldShell label={t("contacts.appendTags")} hint={t("contacts.commaSeparated")}>
                  <Input value={bulkTags} onChange={(event) => setBulkTags(event.target.value)} placeholder="priority, maps" />
                </FieldShell>
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void applyBulkStage()} className={buttonStyles("secondary")}>{t("contacts.applyStage")}</button>
                <button type="button" onClick={() => void applyBulkTags()} className={buttonStyles("secondary")}>{t("contacts.applyTags")}</button>
              </div>
            </div>
          </Card>
        </div>

        {contacts.length ? (
          <>
            <ContactsTable contacts={visibleContacts} selectedIds={selectedIds} onToggle={toggle} onEdit={(contact) => { const match = contacts.find((item) => item.id === contact.id) ?? null; setEditingContact(match); setEditorMode("edit"); }} />
            <PaginationControls page={page} totalPages={totalPages} totalItems={contacts.length} pageSize={pageSize} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState title={t("contacts.noContacts")} description={t("contacts.noContactsDescription")} />
        )}
      </div>

      <ContactEditorDrawer
        open={editorMode !== null}
        mode={editorMode || "create"}
        contact={editingContact}
        onClose={() => {
          setEditorMode(null);
          setEditingContact(null);
        }}
        onSaved={load}
      />
    </AppShell>
  );
}
