"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/layout";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { buttonStyles, Drawer, FieldShell, Input, ListRow, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/api";

const stages = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ON_HOLD"];

type Deal = {
  id: string;
  title: string;
  amount: number;
  probability: number;
  stage: string;
  expectedCloseAt?: string | null;
  contactId: string;
  contact?: { fullName: string } | null;
  company?: { name: string } | null;
};

type Contact = { id: string; fullName: string };
type Company = { id: string; name: string };

function datetimeLocalValue(offsetDays = 14) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function stageTone(stage: string) {
  if (stage === "WON") return "emerald" as const;
  if (stage === "LOST") return "rose" as const;
  if (stage === "ON_HOLD") return "amber" as const;
  return "sky" as const;
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filters, setFilters] = useState({ stage: "", companyId: "", search: "" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    contactId: "",
    title: "",
    amount: "0",
    probability: "50",
    expectedCloseAt: datetimeLocalValue(14),
    notes: "",
  });

  const load = async () => {
    try {
      const qs = new URLSearchParams();
      if (filters.stage) qs.set("stage", filters.stage);
      if (filters.companyId) qs.set("companyId", filters.companyId);
      if (filters.search) qs.set("search", filters.search);
      const [dealsData, contactsData, companiesData] = await Promise.all([
        apiFetch<Deal[]>(`/deals${qs.toString() ? `?${qs.toString()}` : ""}`),
        apiFetch<Contact[]>("/contacts"),
        apiFetch<Company[]>("/companies"),
      ]);
      setDeals(dealsData);
      setContacts(contactsData);
      setCompanies(companiesData);
      if (!form.contactId && contactsData[0]?.id) {
        setForm((current) => ({ ...current, contactId: contactsData[0].id }));
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deals");
    }
  };

  useEffect(() => {
    void load();
  }, [filters.stage, filters.companyId, filters.search]);

  const grouped = useMemo(
    () => stages.reduce<Record<string, Deal[]>>((acc, stage) => ({ ...acc, [stage]: deals.filter((deal) => deal.stage === stage) }), {} as Record<string, Deal[]>),
    [deals],
  );
  const wonValue = useMemo(() => deals.filter((item) => item.stage === "WON").reduce((sum, item) => sum + Number(item.amount || 0), 0), [deals]);
  const openValue = useMemo(() => deals.filter((item) => !["WON", "LOST"].includes(item.stage)).reduce((sum, item) => sum + Number(item.amount || 0), 0), [deals]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      await apiFetch("/deals", {
        method: "POST",
        body: JSON.stringify({
          contactId: form.contactId,
          title: form.title,
          amount: Number(form.amount || 0),
          probability: Number(form.probability || 0),
          expectedCloseAt: form.expectedCloseAt ? new Date(form.expectedCloseAt).toISOString() : undefined,
          notes: form.notes || undefined,
        }),
      });
      setForm({ contactId: contacts[0]?.id || "", title: "", amount: "0", probability: "50", expectedCloseAt: datetimeLocalValue(14), notes: "" });
      setDrawerOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create deal");
    } finally {
      setSaving(false);
    }
  };

  const moveStage = async (dealId: string, stage: string) => {
    await apiFetch(`/deals/${dealId}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) });
    await load();
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Opportunity tracking"
          title="Deals"
          description="Opportunities remain available for formal commercial tracking, but the workflow stays lighter than a traditional CRM deal desk."
          actions={<button type="button" onClick={() => setDrawerOpen(true)} className={buttonStyles("primary")}>Add deal</button>}
        />

        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Total deals" value={deals.length} helper="All opportunity records" />
          <StatCard label="Open pipeline value" value={openValue.toLocaleString()} helper="Deals not won or lost" tone="sky" />
          <StatCard label="Won value" value={wonValue.toLocaleString()} helper="Closed won commercial value" tone="emerald" />
        </div>

        <Card title="Filters" description="Keep the opportunity view simple and searchable.">
          <div className="grid gap-3 md:grid-cols-3">
            <FieldShell label="Search">
              <Input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search deals" />
            </FieldShell>
            <FieldShell label="Stage">
              <Select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}>
                <option value="">All stages</option>
                {stages.map((stage) => (
                  <option key={stage} value={stage}>{stage.replaceAll("_", " ")}</option>
                ))}
              </Select>
            </FieldShell>
            <FieldShell label="Company">
              <Select value={filters.companyId} onChange={(event) => setFilters({ ...filters, companyId: event.target.value })}>
                <option value="">All companies</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </Select>
            </FieldShell>
          </div>
        </Card>

        <Card title="Pipeline buckets" description="Focus on stage coverage and the next contact, not on an overloaded board.">
          <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-7">
            {stages.map((stage) => (
              <div key={stage} className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{stage.replaceAll("_", " ")}</p>
                  <Badge tone={stageTone(stage)}>{grouped[stage]?.length ?? 0}</Badge>
                </div>
                <div className="space-y-3">
                  {grouped[stage]?.length ? (
                    grouped[stage].map((deal) => (
                      <div key={deal.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <p className="font-medium text-slate-900">{deal.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{deal.contact?.fullName || "No contact"}</p>
                        <p className="mt-1 text-xs text-slate-500">{deal.company?.name || "No company"}</p>
                        <p className="mt-3 text-sm font-medium text-slate-800">{Number(deal.amount || 0).toLocaleString()}</p>
                        <p className="mt-1 text-xs text-slate-500">{deal.probability}% probability</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Select value={deal.stage} onChange={(event) => void moveStage(deal.id, event.target.value)} className="!px-3 !py-2 text-xs">
                            {stages.map((value) => (
                              <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
                            ))}
                          </Select>
                          {deal.contactId ? <Link href={`/contacts/${deal.contactId}` as Route} className={buttonStyles("secondary", "sm")}>Open contact</Link> : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState title="No deals" description="Nothing is currently in this stage." />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Add deal" description="Create an opportunity only when you need formal commercial tracking.">
        <form onSubmit={submit} className="space-y-4">
          <FieldShell label="Contact">
            <Select value={form.contactId} onChange={(event) => setForm({ ...form, contactId: event.target.value })}>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.fullName}</option>
              ))}
            </Select>
          </FieldShell>
          <FieldShell label="Deal title">
            <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Website redesign" required />
          </FieldShell>
          <div className="grid gap-4 md:grid-cols-2">
            <FieldShell label="Amount">
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </FieldShell>
            <FieldShell label="Probability %">
              <Input type="number" min="0" max="100" value={form.probability} onChange={(event) => setForm({ ...form, probability: event.target.value })} />
            </FieldShell>
            <FieldShell label="Expected close">
              <Input type="datetime-local" value={form.expectedCloseAt} onChange={(event) => setForm({ ...form, expectedCloseAt: event.target.value })} />
            </FieldShell>
          </div>
          <FieldShell label="Notes">
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Commercial notes or scope details" />
          </FieldShell>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={saving} className={buttonStyles("primary")}>{saving ? "Saving..." : "Create deal"}</button>
            <button type="button" onClick={() => setDrawerOpen(false)} className={buttonStyles("secondary")}>Cancel</button>
          </div>
        </form>
      </Drawer>
    </AppShell>
  );
}
