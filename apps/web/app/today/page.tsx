"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { useI18n, useToast } from "@/components/providers";
import { buttonStyles, MobileActionBar } from "@/components/ui";
import { FollowUpDrawer, type FollowUpInput } from "@/components/workflows";
import { CompletionDrawer, type ScheduledItem, RescheduleDrawer, ScheduledItemRow } from "@/components/scheduler";
import { apiFetch } from "@/lib/api";
import { invalidateQueryCache, useApiQuery } from "@/lib/query";

type PaymentItem = {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  status: string;
  contact: { fullName: string; company?: string | null };
  contactId: string;
};

type PlannerOverview = {
  counts: { overdue: number; today: number; tomorrow: number; thisWeek: number; unscheduled: number; paymentAlerts: number };
  overdue: ScheduledItem[];
  today: ScheduledItem[];
  tomorrow: ScheduledItem[];
  thisWeek: ScheduledItem[];
  unscheduled: ScheduledItem[];
  paymentAlerts: PaymentItem[];
};

export default function TodayPage() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [followUpContact, setFollowUpContact] = useState<ScheduledItem | null>(null);
  const [rescheduleItem, setRescheduleItem] = useState<ScheduledItem | null>(null);
  const [completionItem, setCompletionItem] = useState<ScheduledItem | null>(null);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const { notify } = useToast();
  const { t, formatDateTime, formatNumber, labelStatus } = useI18n();
  const overviewQuery = useApiQuery<PlannerOverview>(() => apiFetch("/follow-ups/overview"), [], { cacheKey: "today:planner" });

  const overview = overviewQuery.data;
  const totalCards = useMemo(() => overview?.counts ?? { overdue: 0, today: 0, tomorrow: 0, thisWeek: 0, unscheduled: 0, paymentAlerts: 0 }, [overview]);

  const refreshQueues = async () => {
    invalidateQueryCache("today");
    invalidateQueryCache("tasks");
    invalidateQueryCache("agenda");
    await overviewQuery.reload({ force: true });
  };

  const completeItem = async (payload: { result?: string }) => {
    if (!completionItem) return;
    try {
      setBusyId(completionItem.id);
      if (completionItem.source === "TASK") {
        await apiFetch(`/tasks/${completionItem.entityId}/complete`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch(`/contacts/${completionItem.entityId}/next-follow-up/complete`, { method: "POST", body: JSON.stringify(payload) });
      }
      notify({ tone: "success", title: t("scheduler.completionTitle"), description: t("today.plannerRefreshed") });
      setCompletionItem(null);
      await refreshQueues();
    } catch (error) {
      notify({ tone: "error", title: t("today.couldNotComplete"), description: error instanceof Error ? error.message : "Action failed." });
    } finally { setBusyId(null); }
  };

  const rescheduleItemSubmit = async (payload: { dueAt: string; hasExactTime: boolean }) => {
    if (!rescheduleItem) return;
    try {
      setBusyId(rescheduleItem.id);
      const path = rescheduleItem.source === "TASK" ? `/tasks/${rescheduleItem.entityId}/reschedule` : `/contacts/${rescheduleItem.entityId}/next-follow-up`;
      await apiFetch(path, { method: "PATCH", body: JSON.stringify(payload) });
      notify({ tone: "success", title: t("common.scheduleUpdated"), description: t("today.scheduleItemSuccess") });
      setRescheduleItem(null);
      await refreshQueues();
    } catch (error) {
      notify({ tone: "error", title: t("today.couldNotReschedule"), description: error instanceof Error ? error.message : "Action failed." });
    } finally { setBusyId(null); }
  };

  const createFollowUp = async (payload: FollowUpInput) => {
    if (!followUpContact?.contactId) return;
    try {
      setSavingFollowUp(true);
      await apiFetch(`/contacts/${followUpContact.contactId}/follow-ups`, { method: "POST", body: JSON.stringify(payload) });
      notify({ tone: "success", title: t("workflows.scheduleFollowUp"), description: t("today.scheduleLeadSuccess") });
      setFollowUpContact(null);
      await refreshQueues();
    } catch (error) {
      notify({ tone: "error", title: t("today.couldNotSchedule"), description: error instanceof Error ? error.message : "Action failed." });
    } finally { setSavingFollowUp(false); }
  };

  const markPaymentPaid = async (paymentId: string) => {
    try {
      setBusyId(paymentId);
      await apiFetch(`/payments/${paymentId}/status`, { method: "PATCH", body: JSON.stringify({ status: "PAID" }) });
      notify({ tone: "success", title: t("today.paymentUpdated"), description: t("today.paymentUpdatedDescription") });
      await refreshQueues();
    } catch (error) {
      notify({ tone: "error", title: t("today.couldNotUpdatePayment"), description: error instanceof Error ? error.message : "Action failed." });
    } finally { setBusyId(null); }
  };

  return (
    <AppShell>
      <div className="space-y-6 pb-20 lg:pb-0">
        <PageHeader
          eyebrow={t("today.eyebrow")}
          title={t("today.title")}
          description={t("today.description")}
          actions={<><Link href={"/agenda" as Route} className={buttonStyles("secondary")}>{t("today.openCalendar")}</Link><Link href={"/tasks" as Route} className={buttonStyles("primary")}>{t("today.openTaskQueue")}</Link></>}
        />

        {overviewQuery.error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{overviewQuery.error}</p> : null}
        {overviewQuery.loading && !overview ? <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{t("common.loadingPlanner")}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label={t("today.overdue")} value={totalCards.overdue} helper={t("today.overdueHint")} tone="rose" />
          <StatCard label={t("today.today")} value={totalCards.today} helper={t("today.todayHint")} tone="sky" />
          <StatCard label={t("today.tomorrow")} value={totalCards.tomorrow} helper={t("today.tomorrowHint")} tone="amber" />
          <StatCard label={t("today.thisWeek")} value={totalCards.thisWeek} helper={t("today.thisWeekHint")} tone="slate" />
          <StatCard label={t("today.unscheduled")} value={totalCards.unscheduled} helper={t("today.unscheduledHint")} tone="amber" />
          <StatCard label={t("today.payments")} value={totalCards.paymentAlerts} helper={t("today.paymentsHint")} tone="emerald" />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <PlannerBucket title={t("today.bucketOverdueTitle")} description={t("today.bucketOverdueDescription")} items={overview?.overdue ?? []} busyId={busyId} onComplete={setCompletionItem} onReschedule={setRescheduleItem} />
          <PlannerBucket title={t("today.bucketTodayTitle")} description={t("today.bucketTodayDescription")} items={overview?.today ?? []} busyId={busyId} onComplete={setCompletionItem} onReschedule={setRescheduleItem} />
          <PlannerBucket title={t("today.bucketTomorrowTitle")} description={t("today.bucketTomorrowDescription")} items={overview?.tomorrow ?? []} busyId={busyId} onComplete={setCompletionItem} onReschedule={setRescheduleItem} />
          <PlannerBucket title={t("today.bucketWeekTitle")} description={t("today.bucketWeekDescription")} items={overview?.thisWeek ?? []} busyId={busyId} onComplete={setCompletionItem} onReschedule={setRescheduleItem} />
        </div>

        <Card title={t("today.unscheduledTitle")} description={t("today.unscheduledDescription")}>
          <div className="space-y-3">
            {overview?.unscheduled.length ? overview.unscheduled.map((item) => (
              <ScheduledItemRow key={item.id} item={item} extraActions={<><button type="button" onClick={() => setFollowUpContact(item)} className={buttonStyles("primary", "sm")}>{t("common.schedule")}</button><Link href={`/contacts/view?id=${item.contactId}` as Route} className={buttonStyles("secondary", "sm")}>{t("common.openContact")}</Link></>} />
            )) : <EmptyState title={t("today.noUnscheduled")} description={t("today.noUnscheduledDescription")} />}
          </div>
        </Card>

        <Card title={t("today.paymentAlertsTitle")} description={t("today.paymentAlertsDescription")}>
          <div className="space-y-3">
            {overview?.paymentAlerts.length ? overview.paymentAlerts.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900">{payment.contact.fullName}</p>
                    <Badge tone={payment.status === "PAID" ? "emerald" : "amber"}>{labelStatus(payment.status)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{payment.label} · {formatNumber(payment.amount)} · {formatDateTime(payment.dueDate)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/contacts/view?id=${payment.contactId}` as Route} className={buttonStyles("secondary", "sm")}>{t("common.openContact")}</Link>
                  {payment.status !== "PAID" ? <button type="button" onClick={() => void markPaymentPaid(payment.id)} disabled={busyId === payment.id} className={buttonStyles("success", "sm")}>{busyId === payment.id ? t("common.saving") : t("today.markPaid")}</button> : null}
                </div>
              </div>
            )) : <EmptyState title={t("today.noPaymentAlerts")} description={t("today.noPaymentAlertsDescription")} />}
          </div>
        </Card>
      </div>

      <MobileActionBar>
        <Link href={"/agenda" as Route} className={buttonStyles("secondary", "sm", true)}>{t("common.calendar")}</Link>
        <Link href={"/tasks" as Route} className={buttonStyles("secondary", "sm", true)}>{t("nav.tasks")}</Link>
        <button type="button" onClick={() => setFollowUpContact(overview?.unscheduled[0] ?? null)} className={buttonStyles("primary", "sm", true)}>{t("today.scheduleNextStep")}</button>
      </MobileActionBar>

      <FollowUpDrawer open={Boolean(followUpContact)} onClose={() => setFollowUpContact(null)} contactLabel={followUpContact?.contactName || undefined} defaultTitle={followUpContact ? `${t("common.followUp")} ${followUpContact.contactName}` : ""} defaultDescription={followUpContact?.company ? `${t("workflows.context")}: ${followUpContact.company}` : ""} busy={savingFollowUp} onSubmit={createFollowUp} />
      <RescheduleDrawer open={Boolean(rescheduleItem)} onClose={() => setRescheduleItem(null)} item={rescheduleItem} busy={busyId === rescheduleItem?.id} onSubmit={rescheduleItemSubmit} />
      <CompletionDrawer open={Boolean(completionItem)} onClose={() => setCompletionItem(null)} item={completionItem} busy={busyId === completionItem?.id} onSubmit={completeItem} />
    </AppShell>
  );
}

function PlannerBucket({ title, description, items, busyId, onComplete, onReschedule }: { title: string; description: string; items: ScheduledItem[]; busyId: string | null; onComplete: (item: ScheduledItem) => void; onReschedule: (item: ScheduledItem) => void; }) {
  const { t } = useI18n();
  return (
    <Card title={title} description={description}>
      <div className="space-y-3">
        {items.length ? items.map((item) => (
          <ScheduledItemRow key={item.id} item={item} extraActions={<><button type="button" onClick={() => onReschedule(item)} disabled={busyId === item.id} className={buttonStyles("secondary", "sm")}>{t("common.reschedule")}</button><Link href={`/contacts/view?id=${item.contactId}` as Route} className={buttonStyles("ghost", "sm")}>{t("common.openContact")}</Link><button type="button" onClick={() => onComplete(item)} disabled={busyId === item.id} className={buttonStyles("primary", "sm")}>{t("common.complete")}</button></>} />
        )) : <EmptyState title={t("today.noBucketItems", { bucket: title })} description={t("today.bucketClear")} />}
      </div>
    </Card>
  );
}
