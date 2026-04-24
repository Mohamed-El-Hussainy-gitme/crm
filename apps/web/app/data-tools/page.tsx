"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/layout";
import { RolePageGuard } from "@/components/permissions";
import { Card } from "@/components/cards";
import { apiFetch } from "@/lib/api";

const template = `firstName,lastName,phone,email,company,source,stage,tags\nJohn,Doe,201011111111,john@example.local,Acme,CSV Import,LEAD,new`; 

export default function DataToolsPage() {
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [csv, setCsv] = useState(template);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const loadDuplicates = async () => {
    try {
      const data = await apiFetch<any>("/data-tools/duplicates");
      setDuplicates(data.groups || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data tools");
    }
  };

  useEffect(() => { void loadDuplicates(); }, []);

  const importCsv = async (e: FormEvent) => {
    e.preventDefault();
    const data = await apiFetch<any>("/data-tools/import/contacts", { method: "POST", body: JSON.stringify({ csv }) });
    setResult(data);
    await loadDuplicates();
  };

  return (
    <AppShell>
      <RolePageGuard minimumRole="SALES_MANAGER">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Data Tools</h1>
          <p className="mt-2 text-slate-400">Import CSV data, export filtered contacts, and review duplicate groups before they pollute the local CRM.</p>
        </div>
        {error ? <p className="text-rose-400">{error}</p> : null}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Import contacts from CSV text">
            <form onSubmit={importCsv} className="space-y-3">
              <textarea value={csv} onChange={(e) => setCsv(e.target.value)} className="min-h-72 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm" />
              <button className="rounded-xl bg-sky-600 px-4 py-3 font-medium text-white">Import CSV</button>
              {result ? <p className="text-sm text-slate-300">Created: {result.created} · Skipped: {result.skipped} · Total: {result.total}</p> : null}
            </form>
          </Card>
          <Card title="Duplicate groups">
            <div className="space-y-3">
              {duplicates.map((group: any, index: number) => (
                <div key={`${group.type}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm">
                  <p className="font-medium">{group.type} · {group.value}</p>
                  <div className="mt-3 space-y-2">
                    {group.contacts.map((contact: any) => <p key={contact.id} className="text-slate-400">{contact.fullName} · {contact.phone}</p>)}
                  </div>
                </div>
              ))}
              {!duplicates.length ? <p className="text-sm text-slate-400">No duplicates detected.</p> : null}
            </div>
          </Card>
        </div>
      </div>
      </RolePageGuard>
    </AppShell>
  );
}
