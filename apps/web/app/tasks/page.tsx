"use client";

import Link from "next/link";
import type { Route } from "next";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createTaskSchema, quickFollowUpSchema } from "@smartcrm/shared";
import { AppShell } from "@/components/layout";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { PaginationControls } from "@/components/pagination";
import { useI18n, useToast } from "@/components/providers";
import { buttonStyles, Drawer, FieldShell, Input, MobileActionBar, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { validateSchema } from "@/lib/forms";
import { invalidateQueryCache, useApiQuery } from "@/lib/query";
import { localInputToIso, nextLocalDatetime } from "@/components/workflows";

type Task = {
  id: string;
  title: string;
  dueAt: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  type: "FOLLOW_UP" | "CALL" | "WHATSAPP" | "MEETING" | "PAYMENT" | "GENERAL";
  hasExactTime?: boolean;
  durationMins?: number | null;
  owner?: { fullName: string } | null;
  description?: string | null;
  contactId?: string | null;
  contact?: { id: string; fullName: string } | null;
};

type ContactOption = { id: string; fullName: string };
const priorities = ["LOW", "MEDIUM", "HIGH"] as const;
const taskTypes = ["FOLLOW_UP", "CALL", "WHATSAPP", "MEETING", "PAYMENT", "GENERAL"] as const;

export default function TasksPage() {
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [page, setPage] = useState(1);
  const { notify } = useToast();
  const { t, formatDateTime, labelPriority, labelTaskType, labelStatus } = useI18n();
  const [form, setForm] = useState({ contactId: "", title: "", type: "FOLLOW_UP", priority: "HIGH", dueAt: nextLocalDatetime(1), description: "" });

  const taskQuery = useApiQuery<Task[]>(() => apiFetch<Task[]>("/tasks"), [], { cacheKey: "tasks:list" });
  const tasks = taskQuery.data ?? [];

  useEffect(() => {
    apiFetch<ContactOption[]>("/contacts").then((items) => setContacts(items.map((contact) => ({ id: contact.id, fullName: contact.fullName })))).catch(() => setContacts([]));
  }, []);

  const visible = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return tasks.filter((task) => {
      const due = new Date(task.dueAt);
      const matchesType = typeFilter === "all" || task.type === typeFilter;
      if (!matchesType) return false;
      if (filter === "today") return task.status === "PENDING" && due >= start && due <= end;
      if (filter === "overdue") return task.status === "PENDING" && due < start;
      if (filter === "upcoming") return task.status === "PENDING" && due > end;
      if (filter === "completed") return task.status === "COMPLETED";
      if (filter === "cancelled") return task.status === "CANCELLED";
      return true;
    });
  }, [tasks, filter, typeFilter]);

  const overdueCount = useMemo(() => { const start = new Date(); start.setHours(0, 0, 0, 0); return tasks.filter((task) => task.status === "PENDING" && new Date(task.dueAt) < start).length; }, [tasks]);
  const todayCount = useMemo(() => { const start = new Date(); start.setHours(0, 0, 0, 0); const end = new Date(); end.setHours(23, 59, 59, 999); return tasks.filter((task) => task.status === "PENDING" && new Date(task.dueAt) >= start && new Date(task.dueAt) <= end).length; }, [tasks]);
  const completedCount = useMemo(() => tasks.filter((task) => task.status === "COMPLETED").length, [tasks]);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pagedVisible = useMemo(() => visible.slice((page - 1) * pageSize, page * pageSize), [page, visible]);

  useEffect(() => { setPage(1); }, [filter, typeFilter]);

  const refreshQueues = async () => { invalidateQueryCache("tasks"); invalidateQueryCache("today"); await taskQuery.reload({ force: true }); };
  const updateTaskStatusLocally = (taskId: string, updates: Partial<Task>) => { taskQuery.setData((current) => (current ?? []).map((task) => (task.id === taskId ? { ...task, ...updates } : task))); };

  const completeTask = async (taskId: string) => {
    const snapshot = taskQuery.data;
    try {
      setBusyId(taskId); updateTaskStatusLocally(taskId, { status: "COMPLETED" });
      await apiFetch(`/tasks/${taskId}/complete`, { method: "PATCH" });
      notify({ tone: "success", title: t("common.complete"), description: t("tasks.queueUpdated") });
    } catch (error) {
      taskQuery.setData(snapshot ?? null);
      notify({ tone: "error", title: t("tasks.couldNotComplete"), description: error instanceof Error ? error.message : "Action failed." });
    } finally { setBusyId(null); await refreshQueues(); }
  };

  const rescheduleTask = async (taskId: string, days = 1) => {
    const snapshot = taskQuery.data;
    const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    try {
      setBusyId(taskId); updateTaskStatusLocally(taskId, { dueAt });
      await apiFetch(`/tasks/${taskId}/reschedule`, { method: "PATCH", body: JSON.stringify({ dueAt }) });
      notify({ tone: "success", title: t("common.reschedule"), description: days === 1 ? t("tasks.movedTomorrow") : t("tasks.movedNextWeek") });
    } catch (error) {
      taskQuery.setData(snapshot ?? null);
      notify({ tone: "error", title: t("tasks.couldNotReschedule"), description: error instanceof Error ? error.message : "Action failed." });
    } finally { setBusyId(null); await refreshQueues(); }
  };

  const cancelTask = async (taskId: string) => {
    const snapshot = taskQuery.data;
    try {
      setBusyId(taskId); updateTaskStatusLocally(taskId, { status: "CANCELLED" });
      await apiFetch(`/tasks/${taskId}/status`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) });
      notify({ tone: "success", title: t("tasks.cancel"), description: t("tasks.cancelledDescription") });
    } catch (error) {
      taskQuery.setData(snapshot ?? null);
      notify({ tone: "error", title: t("tasks.couldNotCancel"), description: error instanceof Error ? error.message : "Action failed." });
    } finally { setBusyId(null); await refreshQueues(); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.contactId) {
      notify({ tone: "error", title: t("tasks.contactRequired"), description: t("tasks.contactRequiredDescription") });
      return;
    }
    const dueAt = localInputToIso(form.dueAt);
    const parsedTask = validateSchema(createTaskSchema, { contactId: form.contactId, title: form.title, type: form.type, priority: form.priority, dueAt, description: form.description || undefined });
    if (!parsedTask.success) { notify({ tone: "error", title: t("tasks.invalidTask"), description: parsedTask.error.message }); return; }
    try {
      setSaving(true);
      if (form.type === "FOLLOW_UP") {
        const parsedFollowUp = validateSchema(quickFollowUpSchema, { title: form.title, dueAt, description: form.description || undefined, priority: form.priority });
        if (!parsedFollowUp.success) { notify({ tone: "error", title: t("tasks.invalidFollowUp"), description: parsedFollowUp.error.message }); return; }
        await apiFetch(`/contacts/${form.contactId}/follow-ups`, { method: "POST", body: JSON.stringify(parsedFollowUp.data) });
      } else {
        await apiFetch(`/tasks`, { method: "POST", body: JSON.stringify(parsedTask.data) });
      }
      setForm({ contactId: "", title: "", type: "FOLLOW_UP", priority: "HIGH", dueAt: nextLocalDatetime(1), description: "" });
      setDrawerOpen(false);
      notify({ tone: "success", title: t("tasks.taskCreated"), description: t("tasks.taskCreatedDescription") });
      await refreshQueues();
    } catch (error) {
      notify({ tone: "error", title: t("tasks.couldNotCreate"), description: error instanceof Error ? error.message : "Action failed." });
    } finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="space-y-6 pb-20 lg:pb-0">
        <PageHeader eyebrow={t("tasks.eyebrow")} title={t("tasks.title")} description={t("tasks.description")} actions={<div className="flex flex-wrap gap-3"><Select value={filter} onChange={(event) => setFilter(event.target.value)} className="min-w-[180px]"><option value="all">{t("tasks.allTasks")}</option><option value="today">{t("tasks.dueToday")}</option><option value="overdue">{t("tasks.overdue")}</option><option value="upcoming">{t("tasks.upcoming")}</option><option value="completed">{t("tasks.completed")}</option><option value="cancelled">{t("tasks.cancelled")}</option></Select><Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="min-w-[180px]"><option value="all">{t("tasks.allTasks")}</option>{taskTypes.map((type) => <option key={type} value={type}>{labelTaskType(type)}</option>)}</Select><button type="button" onClick={() => setDrawerOpen(true)} className={buttonStyles("primary")}>{t("tasks.newTask")}</button></div>} />
        {taskQuery.error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{taskQuery.error}</p> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label={t("tasks.overdue")} value={overdueCount} helper={t("tasks.overdueHint")} tone="rose" />
          <StatCard label={t("tasks.dueToday")} value={todayCount} helper={t("tasks.todayHint")} tone="sky" />
          <StatCard label={t("tasks.completed")} value={completedCount} helper={t("tasks.completedHint")} tone="emerald" />
        </div>

        <Card title={t("tasks.taskQueue")} description={t("tasks.taskQueueDescription", { count: visible.length })}>
          <div className="space-y-3">
            {visible.length ? pagedVisible.map((task) => (
              <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{task.title}</p>
                      <Badge tone={task.status === "COMPLETED" ? "emerald" : task.status === "CANCELLED" ? "slate" : task.priority === "HIGH" ? "rose" : "amber"}>{labelStatus(task.status)}</Badge>
                      <Badge>{labelTaskType(task.type)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{task.contact?.fullName || t("tasks.unassignedContact")}</p>
                    <p className="mt-1 text-sm text-slate-500">{t("tasks.duePrefix", { value: formatDateTime(task.dueAt) })}</p>
                    {task.description ? <p className="mt-2 text-sm text-slate-600">{task.description}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {task.contactId ? <Link href={`/contacts/${task.contactId}` as Route} className={buttonStyles("secondary", "sm")}>{t("common.openContact")}</Link> : null}
                    {task.status === "PENDING" ? <><button type="button" onClick={() => void rescheduleTask(task.id, 1)} disabled={busyId === task.id} className={buttonStyles("secondary", "sm")}>{t("tasks.tomorrow")}</button><button type="button" onClick={() => void rescheduleTask(task.id, 7)} disabled={busyId === task.id} className={buttonStyles("ghost", "sm")}>{t("tasks.nextWeek")}</button><button type="button" onClick={() => void cancelTask(task.id)} disabled={busyId === task.id} className={buttonStyles("danger", "sm")}>{t("tasks.cancel")}</button><button type="button" onClick={() => void completeTask(task.id)} disabled={busyId === task.id} className={buttonStyles("primary", "sm")}>{busyId === task.id ? t("common.saving") : t("tasks.complete")}</button></> : null}
                  </div>
                </div>
              </div>
            )) : <EmptyState title={t("tasks.noTasks")} description={t("tasks.noTasksDescription")} />}
          </div>
          <div className="mt-4"><PaginationControls page={page} totalPages={totalPages} totalItems={visible.length} pageSize={pageSize} onPageChange={setPage} /></div>
        </Card>
      </div>

      <MobileActionBar>
        <button type="button" onClick={() => setDrawerOpen(true)} className={buttonStyles("primary", "sm", true)}>{t("tasks.newTask")}</button>
        <Link href={"/today" as Route} className={buttonStyles("secondary", "sm", true)}>{t("nav.today")}</Link>
        <Link href={"/contacts" as Route} className={buttonStyles("secondary", "sm", true)}>{t("nav.contacts")}</Link>
      </MobileActionBar>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={t("tasks.createTitle")} description={t("tasks.createDescription")}>
        <form onSubmit={submit} className="space-y-4">
          <FieldShell label={t("common.contact")}>
            <Select value={form.contactId} onChange={(event) => setForm((current) => ({ ...current, contactId: event.target.value }))} required>
              <option value="">{t("tasks.chooseContact")}</option>
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}</option>)}
            </Select>
          </FieldShell>
          <FieldShell label={t("common.title")}>
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Follow up on proposal" required />
          </FieldShell>
          <div className="grid gap-4 md:grid-cols-2">
            <FieldShell label={t("common.type")}>
              <Select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>{taskTypes.map((type) => <option key={type} value={type}>{labelTaskType(type)}</option>)}</Select>
            </FieldShell>
            <FieldShell label={t("common.priority")}>
              <Select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>{priorities.map((priority) => <option key={priority} value={priority}>{labelPriority(priority)}</option>)}</Select>
            </FieldShell>
            <FieldShell label={t("contactDetails.dueAt")}>
              <Input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} required className="force-ltr" dir="ltr" />
            </FieldShell>
          </div>
          <FieldShell label={t("common.description")}>
            <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder={t("tasks.optionalContext")} />
          </FieldShell>
          <div className="flex flex-wrap gap-3"><button type="submit" disabled={saving} className={buttonStyles("primary")}>{saving ? t("common.saving") : t("tasks.createTitle")}</button><button type="button" onClick={() => setDrawerOpen(false)} className={buttonStyles("secondary")}>{t("common.cancel")}</button></div>
        </form>
      </Drawer>
    </AppShell>
  );
}
