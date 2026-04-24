"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout";
import { Card } from "@/components/cards";
import { apiFetch } from "@/lib/api";

export default function AutomationsPage() {
  const [data, setData] = useState<any>({ runs: [] });
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const load = () => apiFetch("/automations").then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed to load automation runs"));

  useEffect(() => {
    void load();
  }, []);

  const run = async () => {
    try {
      setRunning(true);
      setError("");
      await apiFetch("/automations/run", { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run automations");
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Automations</h1>
            <p className="mt-2 text-slate-400">Run local automations for stale contacts and overdue payments.</p>
          </div>
          <button disabled={running} onClick={() => void run()} className="rounded-xl bg-sky-600 px-4 py-3 font-medium text-white disabled:opacity-50">{running ? "Running..." : "Run automations now"}</button>
        </div>
        {error ? <p className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</p> : null}
        <Card title="Recent runs">
          <div className="space-y-3 text-sm">
            {(data.runs || []).map((run: any) => (
              <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{run.kind}</p>
                    <p className="mt-1 text-slate-400">{run.status}</p>
                    <p className="mt-2 text-slate-300">{run.summary}</p>
                  </div>
                  <p className="text-xs text-slate-500">{new Date(run.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
