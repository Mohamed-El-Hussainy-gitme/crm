"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { AppShell } from "@/components/layout";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { useToast } from "@/components/providers";
import { buttonStyles } from "@/components/ui";
import { FollowUpDrawer, type FollowUpInput } from "@/components/workflows";
import {
  CompletionDrawer,
  type ScheduledItem,
  RescheduleDrawer,
  ScheduledItemRow,
} from "@/components/scheduler";
import { apiFetch } from "@/lib/api";
import { invalidateQueryCache, useApiQuery } from "@/lib/query";

type FollowUpsResponse = {
  counts: {
    overdue: number;
    today: number;
    tomorrow: number;
    thisWeek: number;
    unscheduled: number;
    paymentAlerts: number;
  };
  overdue: ScheduledItem[];
  today: ScheduledItem[];
  tomorrow: ScheduledItem[];
  thisWeek: ScheduledItem[];
  unscheduled: ScheduledItem[];
};

export default function FollowUpsPage() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [followUpContact, setFollowUpContact] = useState<ScheduledItem | null>(null);
  const [rescheduleItem, setRescheduleItem] = useState<ScheduledItem | null>(null);
  const [completionItem, setCompletionItem] = useState<ScheduledItem | null>(null);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const { notify } = useToast();
  const query = useApiQuery<FollowUpsResponse>(() => apiFetch("/follow-ups/overview"), [], { cacheKey: "followups:center" });
  const data = query.data;

  const refresh = async () => {
    invalidateQueryCache("today");
    invalidateQueryCache("tasks");
    invalidateQueryCache("followups");
    invalidateQueryCache("agenda");
    await query.reload({ force: true });
  };

  const handleComplete = async (payload: { result?: string }) => {
    if (!completionItem) return;
    try {
      setBusyId(completionItem.id);
      const path = completionItem.source === "TASK"
        ? `/tasks/${completionItem.entityId}/complete`
        : `/contacts/${completionItem.entityId}/next-follow-up/complete`;
      const method = completionItem.source === "TASK" ? "PATCH" : "POST";
      await apiFetch(path, { method, body: JSON.stringify(payload) });
      notify({ tone: "success", title: "Completed", description: "The follow-up center has been updated." });
      setCompletionItem(null);
      await refresh();
    } catch (error) {
      notify({ tone: "error", title: "Could not complete", description: error instanceof Error ? error.message : "Action failed." });
    } finally {
      setBusyId(null);
    }
  };

  const handleReschedule = async (payload: { dueAt: string; hasExactTime: boolean }) => {
    if (!rescheduleItem) return;
    try {
      setBusyId(rescheduleItem.id);
      const path = rescheduleItem.source === "TASK"
        ? `/tasks/${rescheduleItem.entityId}/reschedule`
        : `/contacts/${rescheduleItem.entityId}/next-follow-up`;
      await apiFetch(path, { method: "PATCH", body: JSON.stringify(payload) });
      notify({ tone: "success", title: "Rescheduled", description: "The item moved to a better slot." });
      setRescheduleItem(null);
      await refresh();
    } catch (error) {
      notify({ tone: "error", title: "Could not reschedule", description: error instanceof Error ? error.message : "Action failed." });
    } finally {
      setBusyId(null);
    }
  };

  const scheduleUnscheduled = async (payload: FollowUpInput) => {
    if (!followUpContact?.contactId) return;
    try {
      setSavingFollowUp(true);
      await apiFetch(`/contacts/${followUpContact.contactId}/follow-ups`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      notify({ tone: "success", title: "Scheduled", description: "The lead is now in the managed schedule." });
      setFollowUpContact(null);
      await refresh();
    } catch (error) {
      notify({ tone: "error", title: "Could not schedule", description: error instanceof Error ? error.message : "Action failed." });
    } finally {
      setSavingFollowUp(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Follow-up center"
          title="Managed schedule"
          description="A scheduling-first view across overdue work, today, tomorrow, the rest of the week, and leads still missing a real slot."
          actions={
            <>
              <Link href={"/today" as Route} className={buttonStyles("secondary")}>Today</Link>
              <Link href={"/agenda" as Route} className={buttonStyles("primary")}>Calendar</Link>
            </>
          }
        />

        {query.error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{query.error}</p> : null}

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Overdue" value={data?.counts.overdue ?? 0} helper="Recovery queue" tone="rose" />
          <StatCard label="Today" value={data?.counts.today ?? 0} helper="Active day plan" tone="sky" />
          <StatCard label="Tomorrow" value={data?.counts.tomorrow ?? 0} helper="Next 24 hours" tone="amber" />
          <StatCard label="This week" value={data?.counts.thisWeek ?? 0} helper="Upcoming work" tone="slate" />
          <StatCard label="Unscheduled" value={data?.counts.unscheduled ?? 0} helper="Needs slot" tone="amber" />
          <StatCard label="Payments" value={data?.counts.paymentAlerts ?? 0} helper="Separate queue" tone="emerald" />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SchedulePanel title="Overdue" items={data?.overdue ?? []} busyId={busyId} onComplete={setCompletionItem} onReschedule={setRescheduleItem} />
          <SchedulePanel title="Today" items={data?.today ?? []} busyId={busyId} onComplete={setCompletionItem} onReschedule={setRescheduleItem} />
          <SchedulePanel title="Tomorrow" items={data?.tomorrow ?? []} busyId={busyId} onComplete={setCompletionItem} onReschedule={setRescheduleItem} />
          <SchedulePanel title="This week" items={data?.thisWeek ?? []} busyId={busyId} onComplete={setCompletionItem} onReschedule={setRescheduleItem} />
        </div>

        <Card title="Without a real slot" description="These leads still need a real scheduled follow-up instead of sitting in a static queue.">
          <div className="space-y-3">
            {data?.unscheduled.length ? (
              data.unscheduled.map((item) => (
                <ScheduledItemRow
                  key={item.id}
                  item={item}
                  extraActions={
                    <>
                      <button type="button" onClick={() => setFollowUpContact(item)} className={buttonStyles("primary", "sm")}>Schedule</button>
                      <Link href={`/contacts/${item.contactId}` as Route} className={buttonStyles("secondary", "sm")}>Open</Link>
                    </>
                  }
                />
              ))
            ) : (
              <EmptyState title="Every lead is scheduled" description="No one is sitting outside the managed schedule right now." />
            )}
          </div>
        </Card>
      </div>

      <FollowUpDrawer
        open={Boolean(followUpContact)}
        onClose={() => setFollowUpContact(null)}
        contactLabel={followUpContact?.contactName || undefined}
        defaultTitle={followUpContact ? `Follow up with ${followUpContact.contactName}` : ""}
        defaultDescription={followUpContact?.company ? `Context: ${followUpContact.company}` : ""}
        busy={savingFollowUp}
        onSubmit={scheduleUnscheduled}
      />
      <RescheduleDrawer open={Boolean(rescheduleItem)} onClose={() => setRescheduleItem(null)} item={rescheduleItem} busy={busyId === rescheduleItem?.id} onSubmit={handleReschedule} />
      <CompletionDrawer open={Boolean(completionItem)} onClose={() => setCompletionItem(null)} item={completionItem} busy={busyId === completionItem?.id} onSubmit={handleComplete} />
    </AppShell>
  );
}

function SchedulePanel({
  title,
  items,
  busyId,
  onComplete,
  onReschedule,
}: {
  title: string;
  items: ScheduledItem[];
  busyId: string | null;
  onComplete: (item: ScheduledItem) => void;
  onReschedule: (item: ScheduledItem) => void;
}) {
  return (
    <Card title={title}>
      <div className="space-y-3">
        {items.length ? items.map((item) => (
          <ScheduledItemRow
            key={item.id}
            item={item}
            extraActions={
              <>
                <button type="button" onClick={() => onReschedule(item)} disabled={busyId === item.id} className={buttonStyles("secondary", "sm")}>Reschedule</button>
                <button type="button" onClick={() => onComplete(item)} disabled={busyId === item.id} className={buttonStyles("primary", "sm")}>Complete</button>
              </>
            }
          />
        )) : <EmptyState title={`No ${title.toLowerCase()} items`} description="This section is clear." />}
      </div>
    </Card>
  );
}
