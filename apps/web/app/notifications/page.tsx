"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/layout";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { buttonStyles, ListRow } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type NotificationItem = {
  id: string;
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  subtitle?: string | null;
  dueAt?: string | null;
  contactId?: string | null;
  taskId?: string | null;
  paymentId?: string | null;
  broadcastId?: string | null;
};

type NotificationsResponse = {
  counts: {
    total: number;
    overdueTasks: number;
    dueToday: number;
    paymentAlerts: number;
    staleContacts: number;
    queuedBroadcasts: number;
  };
  items: NotificationItem[];
};

function formatDate(value?: string | null) {
  if (!value) return "No due time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No due time" : date.toLocaleString();
}

function severityTone(severity: NotificationItem["severity"]) {
  if (severity === "high") return "rose" as const;
  if (severity === "medium") return "amber" as const;
  return "sky" as const;
}

export default function NotificationsPage() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const load = async () => {
    try {
      setError("");
      const result = await apiFetch<NotificationsResponse>("/notifications");
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const markDone = async (taskId: string) => {
    try {
      setBusyId(taskId);
      await apiFetch(`/tasks/${taskId}/status`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const snooze = async (taskId: string, days: number) => {
    try {
      setBusyId(taskId);
      const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await apiFetch(`/tasks/${taskId}/reschedule`, { method: "PATCH", body: JSON.stringify({ dueAt }) });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const queueFollowUp = async (contactId: string, title: string) => {
    try {
      setBusyId(contactId);
      const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await apiFetch(`/contacts/${contactId}/follow-ups`, {
        method: "POST",
        body: JSON.stringify({ title, dueAt, priority: "HIGH" }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const visibleItems = useMemo(() => {
    if (!data?.items) return [];
    if (severityFilter === "all") return data.items;
    return data.items.filter((item) => item.severity === severityFilter);
  }, [data, severityFilter]);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Priority inbox"
          title="Notifications"
          description="A calmer action inbox for overdue work, stale leads, collections risk, and queued broadcasts."
          actions={
            <div className="flex flex-wrap gap-2">
              {(["all", "high", "medium", "low"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setSeverityFilter(value)} className={buttonStyles(severityFilter === value ? "primary" : "secondary", "sm")}>
                  {value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          }
        />

        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-5">
          <StatCard label="Total" value={data?.counts.total ?? 0} helper="All active notifications" />
          <StatCard label="Overdue tasks" value={data?.counts.overdueTasks ?? 0} helper="Recover first" tone="rose" />
          <StatCard label="Due today" value={data?.counts.dueToday ?? 0} helper="Complete today" tone="sky" />
          <StatCard label="Payment alerts" value={data?.counts.paymentAlerts ?? 0} helper="Collections pressure" tone="amber" />
          <StatCard label="Stale contacts" value={data?.counts.staleContacts ?? 0} helper="Needs re-engagement" tone="emerald" />
        </div>

        <Card title="Action inbox" description={`Showing ${visibleItems.length} items for the current severity filter.`}>
          <div className="space-y-3">
            {visibleItems.length ? (
              visibleItems.map((item) => (
                <ListRow
                  key={item.id}
                  title={<div className="flex flex-wrap items-center gap-2"><span>{item.title}</span><Badge tone={severityTone(item.severity)}>{item.kind.replaceAll("_", " ")}</Badge></div>}
                  subtitle={item.subtitle || "No subtitle"}
                  meta={formatDate(item.dueAt)}
                  actions={
                    <>
                      {item.contactId ? <Link href={`/contacts/${item.contactId}` as Route} className={buttonStyles("secondary", "sm")}>Open contact</Link> : null}
                      {item.broadcastId ? <Link href={"/broadcasts" as Route} className={buttonStyles("secondary", "sm")}>Open broadcast</Link> : null}
                      {item.paymentId ? <Link href={"/payments" as Route} className={buttonStyles("secondary", "sm")}>Open payments</Link> : null}
                      {item.taskId ? (
                        <>
                          <button type="button" disabled={busyId === item.taskId} onClick={() => void markDone(item.taskId!)} className={buttonStyles("primary", "sm")}>Done</button>
                          <button type="button" disabled={busyId === item.taskId} onClick={() => void snooze(item.taskId!, 1)} className={buttonStyles("secondary", "sm")}>Tomorrow</button>
                          <button type="button" disabled={busyId === item.taskId} onClick={() => void snooze(item.taskId!, 3)} className={buttonStyles("secondary", "sm")}>+3 days</button>
                        </>
                      ) : null}
                      {!item.taskId && item.contactId && item.kind === "CONTACT_STALE" ? (
                        <button type="button" disabled={busyId === item.contactId} onClick={() => void queueFollowUp(item.contactId!, `Re-engage ${item.title}`)} className={buttonStyles("primary", "sm")}>Queue follow-up</button>
                      ) : null}
                    </>
                  }
                  highlighted={item.severity === "high"}
                />
              ))
            ) : (
              <EmptyState title="No notifications" description="The inbox is clear for the current severity filter." />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
