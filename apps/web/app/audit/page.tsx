"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout";
import { Card } from "@/components/cards";
import { apiFetch } from "@/lib/api";

export default function AuditPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<any[]>("/audit?limit=100").then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Failed to load audit logs"));
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Audit trail</h1>
          <p className="mt-2 text-slate-400">Review important mutations and automation runs.</p>
        </div>
        {error ? <p className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</p> : null}
        <Card title="Recent changes">
          <div className="space-y-3 text-sm">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{row.action}</p>
                    <p className="mt-1 text-slate-400">{row.entityType} · {row.entityId}</p>
                    <p className="mt-2 text-xs text-slate-500">{row.actorEmail || "System"}</p>
                  </div>
                  <p className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()}</p>
                </div>
                {row.after ? <pre className="mt-3 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300">{JSON.stringify(row.after, null, 2)}</pre> : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
