"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/layout";
import { Card } from "@/components/cards";
import { apiFetch } from "@/lib/api";

const stageOptions = [
  "LEAD",
  "INTERESTED",
  "POTENTIAL",
  "VISIT",
  "FREE_TRIAL",
  "CLIENT",
  "ON_HOLD",
  "LOST",
];

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [content, setContent] = useState("Hello from Smart CRM");
  const [selectedBroadcastId, setSelectedBroadcastId] = useState("");
  const [delivery, setDelivery] = useState<any>(null);
  const [filters, setFilters] = useState({
    stages: ["INTERESTED", "POTENTIAL"],
    inactiveDays: "",
    tags: "",
    withoutNextAction: false,
    overduePaymentsOnly: false,
  });

  const payloadFilters = {
    stages: filters.stages,
    optedInOnly: true,
    withoutNextAction: filters.withoutNextAction,
    overduePaymentsOnly: filters.overduePaymentsOnly,
    inactiveDays: filters.inactiveDays
      ? Number(filters.inactiveDays)
      : undefined,
    tags: filters.tags
      ? filters.tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined,
  };

  const load = async () => {
    const data = await apiFetch<any[]>("/broadcasts");
    setBroadcasts(data);
    if (!selectedBroadcastId && data[0]?.id) setSelectedBroadcastId(data[0].id);
  };

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!selectedBroadcastId) return;
    apiFetch(`/whatsapp/broadcasts/${selectedBroadcastId}/delivery`)
      .then(setDelivery)
      .catch(console.error);
  }, [selectedBroadcastId]);

  async function handlePreview(event: FormEvent) {
    event.preventDefault();
    const result = await apiFetch<any>("/broadcasts/preview", {
      method: "POST",
      body: JSON.stringify(payloadFilters),
    });
    setPreview(result);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const created = await apiFetch<any>("/broadcasts", {
      method: "POST",
      body: JSON.stringify({
        name: `Broadcast ${new Date().toISOString()}`,
        content,
        filters: payloadFilters,
      }),
    });
    setBroadcasts((prev) => [created, ...prev]);
    setSelectedBroadcastId(created.id);
  }

  const toggleStage = (stage: string) =>
    setFilters((prev) => ({
      ...prev,
      stages: prev.stages.includes(stage)
        ? prev.stages.filter((item) => item !== stage)
        : [...prev.stages, stage],
    }));

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Broadcasts</h1>
          <p className="mt-2 text-slate-400">
            Build smart WhatsApp audiences before saving any campaign, then
            inspect delivery notes locally for each contact.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Create Broadcast">
            <form onSubmit={handleCreate} className="space-y-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-36 w-full rounded-xl border border-slate-700 bg-slate-950 p-4"
              />
              <div className="flex flex-wrap gap-2">
                {stageOptions.map((stage) => (
                  <button
                    type="button"
                    key={stage}
                    onClick={() => toggleStage(stage)}
                    className={`rounded-full border px-3 py-2 text-xs ${filters.stages.includes(stage) ? "border-sky-500 bg-sky-950 text-sky-300" : "border-slate-700 text-slate-300"}`}
                  >
                    {stage}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={filters.tags}
                  onChange={(e) =>
                    setFilters({ ...filters, tags: e.target.value })
                  }
                  placeholder="Tags: vip,priority"
                  className="rounded-xl border border-slate-700 bg-slate-950 p-3"
                />
                <input
                  value={filters.inactiveDays}
                  onChange={(e) =>
                    setFilters({ ...filters, inactiveDays: e.target.value })
                  }
                  placeholder="Inactive days"
                  type="number"
                  min="1"
                  className="rounded-xl border border-slate-700 bg-slate-950 p-3"
                />
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.withoutNextAction}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        withoutNextAction: e.target.checked,
                      })
                    }
                  />
                  Without next action
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.overduePaymentsOnly}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        overduePaymentsOnly: e.target.checked,
                      })
                    }
                  />
                  Overdue payments only
                </label>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handlePreview}
                  className="rounded-xl border border-slate-700 px-4 py-3"
                >
                  Preview Audience
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-sky-600 px-4 py-3 text-white"
                >
                  Save Broadcast
                </button>
              </div>
              {preview ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
                  Audience size: {preview.count}
                  <div className="mt-3 space-y-2">
                    {preview.contacts.slice(0, 5).map((contact: any) => (
                      <p key={contact.id}>
                        {contact.fullName} · {contact.stage}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </form>
          </Card>
          <Card title="History">
            <div className="space-y-3">
              {broadcasts.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedBroadcastId(item.id)}
                  className={`w-full rounded-xl border p-4 text-left ${selectedBroadcastId === item.id ? "border-sky-600 bg-slate-950" : "border-slate-800 bg-slate-950"}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        Audience: {item.audience?.length || 0}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-xs">
                      {item.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
        <Card title="Delivery states">
          <div className="space-y-3">
            {(delivery?.audience ?? []).map((item: any) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{item.contact.fullName}</p>
                    <p className="mt-1 text-slate-400">{item.contact.phone}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Sent:{" "}
                      {item.sentAt
                        ? new Date(item.sentAt).toLocaleString()
                        : "Not sent"}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {item.deliveryNote || "Pending"}
                  </p>
                </div>
              </div>
            ))}
            {!delivery?.audience?.length ? (
              <p className="text-sm text-slate-400">
                Select a broadcast to inspect local delivery states.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
