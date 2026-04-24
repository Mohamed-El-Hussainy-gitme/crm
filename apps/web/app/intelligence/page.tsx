"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/layout";
import { Card, StatCard } from "@/components/cards";
import { apiFetch } from "@/lib/api";

export default function IntelligencePage() {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/intelligence/overview").then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed to load intelligence"));
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Intelligence</h1>
          <p className="mt-2 text-slate-400">Rule-based lead scoring, rescue queues, and next-best-action suggestions.</p>
        </div>
        {error ? <p className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</p> : null}
        {!data ? <p className="text-slate-400">Loading intelligence...</p> : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Contacts analysed" value={data.counts.contactsAnalysed} />
              <StatCard label="Hot / warm leads" value={data.counts.hotLeads} />
              <StatCard label="Rescue list" value={data.counts.rescueList} />
              <StatCard label="No next action" value={data.counts.noNextAction} />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Hot leads">
                <div className="space-y-3 text-sm">
                  {data.hotLeads.map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{item.fullName}</p>
                          <p className="mt-1 text-slate-400">{item.company || "No company"} · {item.stage}</p>
                          <p className="mt-2 text-sky-300">Next: {item.nextBestAction}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Score</p>
                          <p className="text-2xl font-semibold">{item.score}</p>
                        </div>
                      </div>
                      <Link href={`/contacts/view?id=${item.id}` as Route} className="mt-3 inline-block text-sm text-sky-300">Open contact</Link>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Rescue list">
                <div className="space-y-3 text-sm">
                  {data.rescueList.map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <p className="font-medium">{item.fullName}</p>
                      <p className="mt-1 text-rose-300">Risk: {item.risk}</p>
                      <p className="mt-2 text-slate-300">{item.nextBestAction}</p>
                      <p className="mt-2 text-xs text-slate-500">{(item.reasons || []).join(" · ")}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            <Card title="Broadcast suggestions">
              <div className="grid gap-3 md:grid-cols-3 text-sm">
                {data.broadcastSuggestions.map((item: any) => (
                  <div key={item.key} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-2 text-3xl font-semibold">{item.count}</p>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
