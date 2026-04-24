"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/layout";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { buttonStyles, Drawer, FieldShell, Input, ListRow } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Company = {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
  openPipelineValue?: number;
  _count?: { contacts?: number; deals?: number };
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", industry: "", website: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = async () => {
    try {
      const data = await apiFetch<Company[]>(`/companies${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setCompanies(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load companies");
    }
  };

  useEffect(() => {
    void load();
  }, [search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      await apiFetch("/companies", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", industry: "", website: "" });
      setDrawerOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save company");
    } finally {
      setSaving(false);
    }
  };

  const openValue = useMemo(() => companies.reduce((sum, item) => sum + Number(item.openPipelineValue || 0), 0), [companies]);
  const linkedDeals = useMemo(() => companies.reduce((sum, item) => sum + Number(item._count?.deals || 0), 0), [companies]);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Account directory"
          title="Companies"
          description="Accounts stay available for reporting and grouping, but remain secondary to the main contact workflow."
          actions={
            <button type="button" onClick={() => setDrawerOpen(true)} className={buttonStyles("primary")}>
              Add company
            </button>
          }
        />

        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Companies" value={companies.length} helper="Account records" />
          <StatCard label="Open pipeline value" value={openValue.toLocaleString()} helper="Rollup from linked deals" tone="sky" />
          <StatCard label="Linked deals" value={linkedDeals} helper="Total opportunities across accounts" tone="emerald" />
        </div>

        <Card title="Company list" description="Search and open an account when you need account-level context.">
          <div className="mb-4 max-w-sm">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search companies" />
          </div>
          <div className="space-y-3">
            {companies.length ? (
              companies.map((company) => (
                <ListRow
                  key={company.id}
                  title={<Link href={`/companies/${company.id}` as Route} className="hover:text-sky-700">{company.name}</Link>}
                  subtitle={company.industry || "No industry set"}
                  meta={`Contacts ${company._count?.contacts || 0} · Deals ${company._count?.deals || 0} · Open ${Number(company.openPipelineValue || 0).toLocaleString()}`}
                  actions={
                    <Link href={`/companies/${company.id}` as Route} className={buttonStyles("secondary", "sm")}>
                      Open account
                    </Link>
                  }
                />
              ))
            ) : (
              <EmptyState title="No companies found" description="Create an account only when company-level reporting or grouping is useful." />
            )}
          </div>
        </Card>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Add company" description="Keep account data light. Add more detail only when account reporting requires it.">
        <form onSubmit={submit} className="space-y-4">
          <FieldShell label="Company name">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Acme LLC" required />
          </FieldShell>
          <FieldShell label="Industry">
            <Input value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} placeholder="Construction" />
          </FieldShell>
          <FieldShell label="Website">
            <Input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="https://example.com" />
          </FieldShell>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={saving} className={buttonStyles("primary")}>
              {saving ? "Saving..." : "Save company"}
            </button>
            <button type="button" onClick={() => setDrawerOpen(false)} className={buttonStyles("secondary")}>Cancel</button>
          </div>
        </form>
      </Drawer>
    </AppShell>
  );
}
