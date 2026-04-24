"use client";

import { Suspense, type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout";
import { useI18n, useToast } from "@/components/providers";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { ContactEditorDrawer } from "@/components/contact-editor";
import { buttonStyles, Drawer, FieldShell, InfoTile, Input, ListRow, MobileActionBar, Select, Textarea } from "@/components/ui";
import { FollowUpDrawer, type FollowUpInput } from "@/components/workflows";
import { apiFetch } from "@/lib/api";
import { validateSchema } from "@/lib/forms";
import { buildContactTimeline } from "@/lib/timeline";
import {
  PIPELINE_STAGES,
  createCallSchema,
  createDealSchema,
  createNoteSchema,
  createPaymentSchema,
  createTaskSchema,
  quickFollowUpSchema,
  updateStageSchema,
} from "@smartcrm/shared";

const contactStages = [...PIPELINE_STAGES];
const dealStages = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ON_HOLD"];
const taskTypes = ["FOLLOW_UP", "CALL", "WHATSAPP", "MEETING", "PAYMENT", "GENERAL"];
const priorityOptions = ["LOW", "MEDIUM", "HIGH"];

type ContactTask = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  priority: string;
  type: string;
  createdAt?: string;
};
type ContactNote = { id: string; body: string; createdAt: string };
type ContactCall = {
  id: string;
  outcome: string;
  durationMins: number;
  summary: string;
  createdAt: string;
};
type ContactPayment = {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  status: string;
  paidAt?: string | null;
  createdAt?: string;
};
type ContactDeal = {
  id: string;
  title: string;
  amount: number;
  stage: string;
  probability: number;
  createdAt?: string;
  updatedAt?: string;
  expectedCloseAt?: string | null;
};
type ContactActivity = {
  id: string;
  kind?: string;
  type?: string;
  createdAt: string;
  meta?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type ContactDetails = {
  id: string;
  fullName: string;
  firstName: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  companyName?: string | null;
  normalizedPhone?: string | null;
  locationText?: string | null;
  area?: string | null;
  mapUrl?: string | null;
  placeLabel?: string | null;
  stage: string;
  source?: string | null;
  tags?: string[];
  expectedDealValue?: number;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  isWhatsappOptedIn?: boolean;
  createdAt: string;
  whatsappUrl: string;
  tasks?: ContactTask[];
  notes?: ContactNote[];
  calls?: ContactCall[];
  payments?: ContactPayment[];
  deals?: ContactDeal[];
  activities?: ContactActivity[];
};

type Intelligence = {
  score: number;
  momentum: string;
  risk: string;
  nextBestAction: string;
  summary: string;
  reasons?: string[];
};

type DrawerType = "edit" | "followUp" | "task" | "deal" | "payment" | null;

function datetimeLocalValue(offsetDays = 1) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function stageTone(stage: string) {
  if (stage === "CLIENT" || stage === "WON" || stage === "PAID") return "emerald" as const;
  if (stage === "LOST" || stage === "OVERDUE") return "rose" as const;
  if (stage === "ON_HOLD" || stage === "PENDING") return "amber" as const;
  if (["INTERESTED", "POTENTIAL", "VISIT", "FREE_TRIAL", "QUALIFIED", "PROPOSAL", "NEGOTIATION"].includes(stage)) return "sky" as const;
  return "slate" as const;
}

export default function ContactDetailsPage() {
  return (
    <Suspense fallback={<AppShell><p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Loading contact...</p></AppShell>}>
      <ContactDetailsPageContent />
    </Suspense>
  );
}

function ContactDetailsPageContent() {
  const searchParams = useSearchParams();
  const contactId = searchParams.get("id") || "";
  const { notify } = useToast();
  const {
    t,
    formatDateTime,
    formatCurrency,
    formatNumber,
    labelPipelineStage,
    labelDealStage,
    labelTaskType,
    labelPriority,
    labelStatus,
    isRtl,
  } = useI18n();
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerType>(null);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [note, setNote] = useState("");
  const [callOutcome, setCallOutcome] = useState("Reached");
  const [callSummary, setCallSummary] = useState("");
  const [taskForm, setTaskForm] = useState({
    title: "",
    dueAt: datetimeLocalValue(1),
    priority: "HIGH",
    type: "FOLLOW_UP",
    description: "",
  });
  const [dealForm, setDealForm] = useState({
    title: "",
    amount: "0",
    probability: "50",
    stage: "NEW",
    expectedCloseAt: datetimeLocalValue(14),
    notes: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    label: "Initial payment",
    amount: "0",
    dueDate: datetimeLocalValue(7),
  });

  const callOutcomes = useMemo(
    () => [
      { value: "Reached", label: isRtl ? "تم الوصول" : "Reached" },
      { value: "No answer", label: isRtl ? "بدون رد" : "No answer" },
      { value: "Interested", label: isRtl ? "مهتم" : "Interested" },
      { value: "Needs callback", label: isRtl ? "يحتاج معاودة اتصال" : "Needs callback" },
    ],
    [isRtl],
  );

  const load = async () => {
    if (!contactId) return;
    try {
      setError("");
      const [details, smart] = await Promise.all([
        apiFetch<ContactDetails>(`/contacts/${contactId}`),
        apiFetch<Intelligence>(`/contacts/${contactId}/intelligence`).catch(() => null),
      ]);
      setContact(details);
      setIntelligence(smart);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contact");
    }
  };

  useEffect(() => {
    void load();
  }, [contactId]);

  const pendingTasks = useMemo(() => (contact?.tasks ?? []).filter((task) => task.status === "PENDING"), [contact]);
  const overdueTasks = useMemo(() => pendingTasks.filter((task) => new Date(task.dueAt).getTime() < Date.now()), [pendingTasks]);
  const overduePayments = useMemo(
    () =>
      (contact?.payments ?? []).filter(
        (payment) => payment.status !== "PAID" && new Date(payment.dueDate).getTime() < Date.now(),
      ),
    [contact],
  );
  const openDeals = useMemo(() => (contact?.deals ?? []).filter((deal) => !["WON", "LOST"].includes(deal.stage)), [contact]);

  const timeline = useMemo(
    () =>
      contact
        ? buildContactTimeline(
            {
              notes: contact.notes,
              calls: contact.calls,
              tasks: contact.tasks,
              payments: contact.payments,
              deals: contact.deals,
              activities: contact.activities,
              createdAt: contact.createdAt,
            },
            {
              formatDateTime,
              formatCurrency,
              labelTaskType,
              labelPriority,
              labelStatus,
              labelDealStage,
              humanize: (value) => labelStatus(value) === value ? (value || "—").replaceAll("_", " ") : labelStatus(value),
              labels: {
                noteAdded: isRtl ? "تمت إضافة ملاحظة" : "Note added",
                callSuffix: isRtl ? "مكالمة" : "call",
                duePrefix: isRtl ? "الاستحقاق" : "due",
                probabilitySuffix: isRtl ? "احتمال" : "probability",
              },
            },
          )
        : [],
    [contact, formatCurrency, formatDateTime, isRtl, labelDealStage, labelPriority, labelStatus, labelTaskType],
  );

  const updateStage = async (stage: string) => {
    if (!contact) return;
    try {
      setBusy("stage");
      const parsed = validateSchema(updateStageSchema, { stage });
      if (!parsed.success) {
        notify({ tone: "error", title: isRtl ? "مرحلة غير صحيحة" : "Invalid stage", description: parsed.error.message });
        return;
      }
      await apiFetch(`/contacts/${contact.id}/stage`, { method: "POST", body: JSON.stringify(parsed.data) });
      await load();
      notify({ tone: "success", title: isRtl ? "تم تحديث المرحلة" : "Stage updated", description: `${contact.fullName} · ${labelPipelineStage(stage)}` });
    } catch (cause) {
      notify({ tone: "error", title: isRtl ? "تعذر تحديث المرحلة" : "Could not update stage", description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  };

  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!contact) return;
    const parsed = validateSchema(createNoteSchema, { body: note.trim() });
    if (!parsed.success) {
      notify({ tone: "error", title: isRtl ? "الملاحظة غير صحيحة" : "Invalid note", description: parsed.error.message });
      return;
    }
    try {
      setBusy("note");
      await apiFetch(`/contacts/${contact.id}/notes`, { method: "POST", body: JSON.stringify(parsed.data) });
      setNote("");
      await load();
      notify({ tone: "success", title: isRtl ? "تم حفظ الملاحظة" : "Note saved", description: t("contactDetails.taskCreatedDescription") });
    } catch (cause) {
      notify({ tone: "error", title: isRtl ? "تعذر حفظ الملاحظة" : "Could not save note", description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  };

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!contact) return;
    const dueAt = new Date(taskForm.dueAt).toISOString();
    const parsedTask = validateSchema(createTaskSchema, {
      contactId: contact.id,
      title: taskForm.title,
      dueAt,
      priority: taskForm.priority,
      type: taskForm.type,
      description: taskForm.description || undefined,
    });
    if (!parsedTask.success) {
      notify({ tone: "error", title: isRtl ? "المهمة غير صحيحة" : "Invalid task", description: parsedTask.error.message });
      return;
    }
    try {
      setBusy("task");
      if (taskForm.type === "FOLLOW_UP") {
        const parsedFollowUp = validateSchema(quickFollowUpSchema, {
          title: taskForm.title,
          dueAt,
          priority: taskForm.priority,
          description: taskForm.description || undefined,
        });
        if (!parsedFollowUp.success) {
          notify({ tone: "error", title: isRtl ? "المتابعة غير صحيحة" : "Invalid follow-up", description: parsedFollowUp.error.message });
          return;
        }
        await apiFetch(`/contacts/${contact.id}/follow-ups`, { method: "POST", body: JSON.stringify(parsedFollowUp.data) });
      } else {
        await apiFetch(`/tasks`, { method: "POST", body: JSON.stringify(parsedTask.data) });
      }
      setTaskForm({ title: "", dueAt: datetimeLocalValue(1), priority: "HIGH", type: "FOLLOW_UP", description: "" });
      setDrawer(null);
      await load();
      notify({ tone: "success", title: t("contactDetails.taskCreated"), description: t("contactDetails.taskCreatedDescription") });
    } catch (cause) {
      notify({ tone: "error", title: t("contactDetails.taskCreateFailed"), description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  };

  const createDeal = async (event: FormEvent) => {
    event.preventDefault();
    if (!contact) return;
    const parsed = validateSchema(createDealSchema, {
      title: dealForm.title,
      amount: Number(dealForm.amount || 0),
      probability: Number(dealForm.probability || 0),
      stage: dealForm.stage,
      expectedCloseAt: new Date(dealForm.expectedCloseAt).toISOString(),
      notes: dealForm.notes || undefined,
    });
    if (!parsed.success) {
      notify({ tone: "error", title: isRtl ? "الصفقة غير صحيحة" : "Invalid deal", description: parsed.error.message });
      return;
    }
    try {
      setBusy("deal");
      await apiFetch(`/deals`, { method: "POST", body: JSON.stringify({ contactId: contact.id, ...parsed.data }) });
      setDealForm({ title: "", amount: "0", probability: "50", stage: "NEW", expectedCloseAt: datetimeLocalValue(14), notes: "" });
      setDrawer(null);
      await load();
      notify({ tone: "success", title: isRtl ? "تم إنشاء الصفقة" : "Deal created", description: isRtl ? "تم ربط السجل التجاري بالعميل." : "The commercial record was linked to the contact." });
    } catch (cause) {
      notify({ tone: "error", title: isRtl ? "تعذر إنشاء الصفقة" : "Could not create deal", description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  };

  const createPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!contact) return;
    const parsed = validateSchema(createPaymentSchema, {
      label: paymentForm.label,
      amount: Number(paymentForm.amount || 0),
      dueDate: new Date(paymentForm.dueDate).toISOString(),
    });
    if (!parsed.success) {
      notify({ tone: "error", title: isRtl ? "الدفعة غير صحيحة" : "Invalid payment", description: parsed.error.message });
      return;
    }
    try {
      setBusy("payment");
      await apiFetch(`/contacts/${contact.id}/payments`, { method: "POST", body: JSON.stringify(parsed.data) });
      setPaymentForm({ label: "Initial payment", amount: "0", dueDate: datetimeLocalValue(7) });
      setDrawer(null);
      await load();
      notify({ tone: "success", title: isRtl ? "تمت جدولة الدفعة" : "Payment scheduled", description: isRtl ? "تمت إضافة خطوة الدفع إلى العميل." : "Payment workflow was added to the contact." });
    } catch (cause) {
      notify({ tone: "error", title: isRtl ? "تعذر جدولة الدفعة" : "Could not schedule payment", description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  };

  const createFollowUp = async (payload: FollowUpInput) => {
    if (!contact) return;
    const parsed = validateSchema(quickFollowUpSchema, payload);
    if (!parsed.success) {
      notify({ tone: "error", title: isRtl ? "المتابعة غير صحيحة" : "Invalid follow-up", description: parsed.error.message });
      return;
    }
    try {
      setSavingFollowUp(true);
      await apiFetch(`/contacts/${contact.id}/follow-ups`, { method: "POST", body: JSON.stringify(parsed.data) });
      setDrawer(null);
      await load();
      notify({ tone: "success", title: isRtl ? "تمت جدولة المتابعة" : "Follow-up scheduled", description: isRtl ? "أصبحت الخطوة التالية واضحة لهذا العميل." : "The next action is now explicit for this contact." });
    } catch (cause) {
      notify({ tone: "error", title: isRtl ? "تعذر جدولة المتابعة" : "Could not schedule follow-up", description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setSavingFollowUp(false);
    }
  };

  const markTaskDone = async (taskId: string) => {
    try {
      setBusy(taskId);
      await apiFetch(`/tasks/${taskId}/complete`, { method: "PATCH" });
      await load();
      notify({ tone: "success", title: t("contactDetails.taskCompleted"), description: t("contactDetails.taskCompletedDescription") });
    } catch (cause) {
      notify({ tone: "error", title: t("contactDetails.taskCompleteFailed"), description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  };

  const rescheduleTask = async (taskId: string, days: number) => {
    try {
      setBusy(taskId);
      const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await apiFetch(`/tasks/${taskId}/reschedule`, { method: "PATCH", body: JSON.stringify({ dueAt }) });
      await load();
      notify({
        tone: "success",
        title: t("contactDetails.taskRescheduled"),
        description: days === 1 ? (isRtl ? "تم نقل المهمة إلى الغد." : "Moved to tomorrow.") : t("contactDetails.taskRescheduledDescription"),
      });
    } catch (cause) {
      notify({ tone: "error", title: t("contactDetails.taskRescheduleFailed"), description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  };

  const logCall = async (event: FormEvent) => {
    event.preventDefault();
    if (!contact) return;
    const parsed = validateSchema(createCallSchema, { outcome: callOutcome, summary: callSummary.trim(), durationMins: 5 });
    if (!parsed.success) {
      notify({ tone: "error", title: isRtl ? "سجل المكالمة غير صحيح" : "Invalid call log", description: parsed.error.message });
      return;
    }
    try {
      setBusy("call");
      await apiFetch(`/contacts/${contact.id}/calls`, { method: "POST", body: JSON.stringify(parsed.data) });
      setCallSummary("");
      await load();
      notify({ tone: "success", title: isRtl ? "تم تسجيل المكالمة" : "Call logged", description: isRtl ? "أضيفت المكالمة إلى التسلسل الزمني." : "The timeline now includes the latest call." });
    } catch (cause) {
      notify({ tone: "error", title: isRtl ? "تعذر تسجيل المكالمة" : "Could not log call", description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  };

  const markPaymentPaid = async (paymentId: string) => {
    try {
      setBusy(paymentId);
      await apiFetch(`/payments/${paymentId}/mark-paid`, { method: "PATCH" });
      await load();
      notify({ tone: "success", title: t("contactDetails.paymentMarked"), description: t("contactDetails.paymentMarkedDescription") });
    } catch (cause) {
      notify({ tone: "error", title: t("contactDetails.markPaidFailed"), description: cause instanceof Error ? cause.message : "Action failed." });
    } finally {
      setBusy(null);
    }
  };

  if (!contact) {
    return (
      <AppShell>
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{error || t("common.loading")}</p>
      </AppShell>
    );
  }

  const companyLabel = contact.companyName || contact.company || t("common.noCompany");

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("contactDetails.eyebrow")}
          title={contact.fullName}
          description={`${companyLabel} · ${contact.phone}`}
          actions={
            <>
              <button type="button" onClick={() => setDrawer("edit")} className={buttonStyles("secondary")}>{t("contactDetails.edit")}</button>
              <button type="button" onClick={() => setDrawer("followUp")} className={buttonStyles("primary")}>{t("contactDetails.scheduleFollowUp")}</button>
              <button type="button" onClick={() => setDrawer("task")} className={buttonStyles("secondary")}>{t("contactDetails.newTask")}</button>
              <button type="button" onClick={() => setDrawer("deal")} className={buttonStyles("secondary")}>{t("contactDetails.newDeal")}</button>
              <button type="button" onClick={() => setDrawer("payment")} className={buttonStyles("secondary")}>{t("contactDetails.newPayment")}</button>
              <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className={buttonStyles("success")}>{t("contactDetails.openWhatsapp")}</a>
              <Link href={"/contacts" as Route} className={buttonStyles("ghost")}>{t("common.backToContacts")}</Link>
            </>
          }
        />

        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("contactDetails.pendingTasks")} value={pendingTasks.length} helper={t("contactDetails.pendingTasksHint")} tone="sky" />
          <StatCard label={t("contactDetails.overdueTasks")} value={overdueTasks.length} helper={t("contactDetails.overdueTasksHint")} tone="rose" />
          <StatCard label={t("contactDetails.openDeals")} value={openDeals.length} helper={t("contactDetails.openDealsHint")} tone="emerald" />
          <StatCard label={t("contactDetails.overduePayments")} value={overduePayments.length} helper={t("contactDetails.overduePaymentsHint")} tone="amber" />
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("contactDetails.relationshipState")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={stageTone(contact.stage)}>{labelPipelineStage(contact.stage)}</Badge>
                {!contact.nextFollowUpAt ? <Badge tone="amber">{t("contacts.noNextActionOnly")}</Badge> : null}
                {overdueTasks.length ? <Badge tone="rose">{t("contactDetails.overdueTasks")}</Badge> : null}
                {overduePayments.length ? <Badge tone="rose">{t("today.paymentsHint")}</Badge> : null}
                {contact.tags?.map((tag) => <Badge key={tag}>{tag}</Badge>)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select value={contact.stage} disabled={busy === "stage"} onChange={(event) => void updateStage(event.target.value)} className="min-w-[220px]">
                {contactStages.map((stage) => <option key={stage} value={stage}>{labelPipelineStage(stage)}</option>)}
              </Select>
            </div>
          </div>
        </div>

        {intelligence ? (
          <Card title={isRtl ? "رؤية ذكية" : "Smart insight"} description={isRtl ? "إرشاد مختصر مبني على حالة العلاقة الحالية." : "Compact guidance from the current relationship state."}>
            <div className="grid gap-4 md:grid-cols-4">
              <InfoTile label={isRtl ? "النتيجة" : "Score"} value={formatNumber(intelligence.score)} />
              <InfoTile label={isRtl ? "الزخم" : "Momentum"} value={intelligence.momentum} />
              <InfoTile label={isRtl ? "المخاطرة" : "Risk"} value={intelligence.risk} />
              <InfoTile label={isRtl ? "أفضل خطوة تالية" : "Next best action"} value={intelligence.nextBestAction} />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{intelligence.summary}</p>
            {intelligence.reasons?.length ? <div className="mt-3 flex flex-wrap gap-2">{intelligence.reasons.map((reason) => <Badge key={reason} tone="sky">{reason}</Badge>)}</div> : null}
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <Card title={isRtl ? "التقاط سريع" : "Quick capture"} description={isRtl ? "أبق السجل محدثًا بدون مغادرة الصفحة." : "Keep the record current without leaving the page."}>
              <div className="mb-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setDrawer("followUp")} className={buttonStyles("primary", "sm")}>{t("today.scheduleNextStep")}</button>
                <button type="button" onClick={() => setDrawer("task")} className={buttonStyles("secondary", "sm")}>{isRtl ? "إنشاء مهمة عامة" : "Create generic task"}</button>
                <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className={buttonStyles("success", "sm")}>{t("contactDetails.sendWhatsapp")}</a>
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <form onSubmit={addNote} className="space-y-3">
                  <FieldShell label={isRtl ? "إضافة ملاحظة" : "Add note"} hint={isRtl ? "سجّل نتائج الاجتماعات أو الاعتراضات أو الخطوات المتفق عليها." : "Capture meeting outcomes, objections, or promised next steps."}>
                    <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={isRtl ? "اكتب ملاحظة تشغيلية مختصرة..." : "Write a concise operational note..."} className="min-h-36" />
                  </FieldShell>
                  <button type="submit" disabled={busy === "note"} className={buttonStyles("primary")}>{busy === "note" ? t("common.saving") : (isRtl ? "حفظ الملاحظة" : "Save note")}</button>
                </form>

                <form onSubmit={logCall} className="space-y-3">
                  <FieldShell label={isRtl ? "تسجيل مكالمة" : "Log call"} hint={isRtl ? "احفظ النتيجة مباشرة داخل التسلسل الزمني." : "Store the result directly in the timeline."}>
                    <Select value={callOutcome} onChange={(event) => setCallOutcome(event.target.value)}>
                      {callOutcomes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </FieldShell>
                  <Textarea value={callSummary} onChange={(event) => setCallSummary(event.target.value)} placeholder={isRtl ? "ملخص قصير للمكالمة" : "Short call summary"} className="min-h-36" />
                  <button type="submit" disabled={busy === "call"} className={buttonStyles("secondary")}>{busy === "call" ? t("common.saving") : (isRtl ? "تسجيل المكالمة" : "Log call")}</button>
                </form>
              </div>
            </Card>

            <Card title={t("contactDetails.timeline")} description={isRtl ? "تدفق زمني واحد للملاحظات والمكالمات والمهام والدفعات والأنشطة." : "One chronological stream for notes, calls, tasks, deals, payments, and system activity."}>
              <div className="space-y-3">
                {timeline.length ? (
                  timeline.map((item) => (
                    <div key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{item.title}</p>
                            <Badge tone={item.tone}>{item.kind.replaceAll("_", " ")}</Badge>
                          </div>
                          {item.body ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p> : null}
                        </div>
                        <p className="text-xs text-slate-500">{formatDateTime(item.at)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState title={t("contactDetails.noTimeline")} description={t("contactDetails.noTimelineDescription")} />
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card title={isRtl ? "الملف الصحي للعلاقة" : "Profile and health"} description={isRtl ? "سياق العلاقة الحالي في نظرة واحدة." : "Current relationship context at a glance."}>
              <div className="grid gap-3 md:grid-cols-2">
                <InfoTile label={t("common.phone")} value={contact.phone} hint={contact.normalizedPhone ? `WhatsApp +${contact.normalizedPhone}` : undefined} />
                <InfoTile label={t("common.email")} value={contact.email || "—"} />
                <InfoTile label={t("common.source")} value={contact.source || "—"} />
                <InfoTile label={t("common.expectedValue")} value={formatCurrency(contact.expectedDealValue || 0)} />
                <InfoTile label={t("common.lastContacted")} value={formatDateTime(contact.lastContactedAt)} />
                <InfoTile label={t("common.nextFollowUp")} value={formatDateTime(contact.nextFollowUpAt)} />
                <InfoTile label={t("common.created")} value={formatDateTime(contact.createdAt)} />
                <InfoTile label={t("common.company")} value={companyLabel} />
                <InfoTile label={t("common.placeLabel")} value={contact.placeLabel || "—"} />
                <InfoTile label={t("common.area")} value={contact.area || "—"} />
                <InfoTile label={t("common.location")} value={contact.locationText || "—"} />
                <InfoTile label={t("contactDetails.whatsappOptIn")} value={contact.isWhatsappOptedIn ? t("common.yes") : t("common.no")} />
              </div>
            </Card>

            <Card title={t("contactDetails.openTasks")} description={t("contactDetails.openTasksDescription")}>
              <div className="space-y-3">
                {contact.tasks?.length ? (
                  contact.tasks.map((task) => (
                    <ListRow
                      key={task.id}
                      title={
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{task.title}</span>
                          <Badge tone={task.status === "COMPLETED" ? "emerald" : overdueTasks.some((item) => item.id === task.id) ? "rose" : "amber"}>{labelStatus(task.status)}</Badge>
                          <Badge>{labelTaskType(task.type)}</Badge>
                        </div>
                      }
                      subtitle={`${isRtl ? "الاستحقاق" : "Due"} ${formatDateTime(task.dueAt)}`}
                      meta={`${labelPriority(task.priority)}${isRtl ? " أولوية" : " priority"}`}
                      actions={task.status === "PENDING" ? (
                        <>
                          <button type="button" onClick={() => void rescheduleTask(task.id, 1)} disabled={busy === task.id} className={buttonStyles("secondary", "sm")}>{t("contactDetails.tomorrow")}</button>
                          <button type="button" onClick={() => void markTaskDone(task.id)} disabled={busy === task.id} className={buttonStyles("primary", "sm")}>{t("contactDetails.complete")}</button>
                        </>
                      ) : null}
                    />
                  ))
                ) : (
                  <EmptyState title={t("contactDetails.noTasks")} description={t("contactDetails.noTasksDescription")} />
                )}
              </div>
            </Card>

            <Card title={t("contactDetails.payments")} description={t("contactDetails.paymentsDescription")}>
              <div className="space-y-3">
                {contact.payments?.length ? (
                  contact.payments.map((payment) => (
                    <ListRow
                      key={payment.id}
                      title={<div className="flex flex-wrap items-center gap-2"><span>{payment.label}</span><Badge tone={payment.status === "PAID" ? "emerald" : overduePayments.some((item) => item.id === payment.id) ? "rose" : "amber"}>{labelStatus(payment.status)}</Badge></div>}
                      subtitle={`${formatCurrency(payment.amount)} · ${isRtl ? "الاستحقاق" : "due"} ${formatDateTime(payment.dueDate)}`}
                      meta={payment.paidAt ? `${isRtl ? "تم الدفع" : "Paid"} ${formatDateTime(payment.paidAt)}` : undefined}
                      actions={payment.status !== "PAID" ? <button type="button" onClick={() => void markPaymentPaid(payment.id)} disabled={busy === payment.id} className={buttonStyles("success", "sm")}>{t("contactDetails.markPaid")}</button> : null}
                    />
                  ))
                ) : (
                  <EmptyState title={t("contactDetails.noPayments")} description={t("contactDetails.noPaymentsDescription")} />
                )}
              </div>
            </Card>

            <Card title={t("contactDetails.deals")} description={t("contactDetails.dealsDescription")}>
              <div className="space-y-3">
                {contact.deals?.length ? (
                  contact.deals.map((deal) => (
                    <ListRow
                      key={deal.id}
                      title={<div className="flex flex-wrap items-center gap-2"><span>{deal.title}</span><Badge tone={stageTone(deal.stage)}>{labelDealStage(deal.stage)}</Badge></div>}
                      subtitle={`${formatCurrency(deal.amount || 0)} · ${formatNumber(deal.probability)}% ${isRtl ? "احتمال" : "probability"}`}
                      meta={deal.expectedCloseAt ? `${isRtl ? "الإغلاق المتوقع" : "Target close"} ${formatDateTime(deal.expectedCloseAt)}` : undefined}
                    />
                  ))
                ) : (
                  <EmptyState title={t("contactDetails.noDeals")} description={t("contactDetails.noDealsDescription")} />
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <MobileActionBar>
        <button type="button" onClick={() => setDrawer("followUp")} className={buttonStyles("primary", "sm", true)}>{t("common.followUp")}</button>
        <button type="button" onClick={() => setDrawer("task")} className={buttonStyles("secondary", "sm", true)}>{t("contactDetails.newTask")}</button>
        <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className={buttonStyles("success", "sm", true)}>{t("common.whatsapp")}</a>
      </MobileActionBar>

      <ContactEditorDrawer open={drawer === "edit"} mode="edit" contact={contact} onClose={() => setDrawer(null)} onSaved={load} />

      <FollowUpDrawer
        open={drawer === "followUp"}
        onClose={() => setDrawer(null)}
        contactLabel={contact.fullName}
        defaultTitle={`${t("common.followUp")} · ${contact.fullName}`}
        defaultDescription={contact.companyName || contact.company ? `Context: ${contact.companyName || contact.company}` : ""}
        busy={savingFollowUp}
        onSubmit={createFollowUp}
      />

      <Drawer open={drawer === "task"} onClose={() => setDrawer(null)} title={t("contactDetails.createTask")} description={t("contactDetails.createTaskDescription")}>
        <form onSubmit={createTask} className="space-y-4">
          <FieldShell label={isRtl ? "عنوان المهمة" : "Task title"}>
            <Input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder={t("contactDetails.taskTitlePlaceholder")} required />
          </FieldShell>
          <div className="grid gap-4 md:grid-cols-2">
            <FieldShell label={t("contactDetails.dueAt")}>
              <Input type="datetime-local" value={taskForm.dueAt} onChange={(event) => setTaskForm({ ...taskForm, dueAt: event.target.value })} className="force-ltr" required />
            </FieldShell>
            <FieldShell label={t("common.priority")}>
              <Select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}>
                {priorityOptions.map((value) => <option key={value} value={value}>{labelPriority(value)}</option>)}
              </Select>
            </FieldShell>
            <FieldShell label={t("common.type")}>
              <Select value={taskForm.type} onChange={(event) => setTaskForm({ ...taskForm, type: event.target.value })}>
                {taskTypes.map((value) => <option key={value} value={value}>{labelTaskType(value)}</option>)}
              </Select>
            </FieldShell>
          </div>
          <FieldShell label={t("common.description")}>
            <Textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} placeholder={isRtl ? "تعليمات أو سياق اختياري" : "Optional instructions or context"} />
          </FieldShell>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy === "task"} className={buttonStyles("primary")}>{busy === "task" ? t("common.saving") : t("contactDetails.createTask")}</button>
            <button type="button" onClick={() => setDrawer(null)} className={buttonStyles("secondary")}>{t("common.cancel")}</button>
          </div>
        </form>
      </Drawer>

      <Drawer open={drawer === "deal"} onClose={() => setDrawer(null)} title={t("contactDetails.createDeal")} description={t("contactDetails.createDealDescription")}>
        <form onSubmit={createDeal} className="space-y-4">
          <FieldShell label={isRtl ? "عنوان الصفقة" : "Deal title"}>
            <Input value={dealForm.title} onChange={(event) => setDealForm({ ...dealForm, title: event.target.value })} placeholder={isRtl ? "إعادة تصميم موقع" : "Website redesign"} required />
          </FieldShell>
          <div className="grid gap-4 md:grid-cols-2">
            <FieldShell label={isRtl ? "القيمة" : "Amount"}>
              <Input type="number" min="0" step="0.01" value={dealForm.amount} onChange={(event) => setDealForm({ ...dealForm, amount: event.target.value })} className="force-ltr" />
            </FieldShell>
            <FieldShell label={isRtl ? "نسبة الاحتمال %" : "Probability %"}>
              <Input type="number" min="0" max="100" value={dealForm.probability} onChange={(event) => setDealForm({ ...dealForm, probability: event.target.value })} className="force-ltr" />
            </FieldShell>
            <FieldShell label={t("common.stage")}>
              <Select value={dealForm.stage} onChange={(event) => setDealForm({ ...dealForm, stage: event.target.value })}>
                {dealStages.map((value) => <option key={value} value={value}>{labelDealStage(value)}</option>)}
              </Select>
            </FieldShell>
            <FieldShell label={isRtl ? "الإغلاق المتوقع" : "Expected close"}>
              <Input type="datetime-local" value={dealForm.expectedCloseAt} onChange={(event) => setDealForm({ ...dealForm, expectedCloseAt: event.target.value })} className="force-ltr" />
            </FieldShell>
          </div>
          <FieldShell label={t("common.notes")}>
            <Textarea value={dealForm.notes} onChange={(event) => setDealForm({ ...dealForm, notes: event.target.value })} placeholder={isRtl ? "النطاق أو الاعتراضات أو ملاحظات التسعير" : "Scope, objections, pricing notes"} />
          </FieldShell>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy === "deal"} className={buttonStyles("primary")}>{busy === "deal" ? t("common.saving") : t("contactDetails.createDeal")}</button>
            <button type="button" onClick={() => setDrawer(null)} className={buttonStyles("secondary")}>{t("common.cancel")}</button>
          </div>
        </form>
      </Drawer>

      <Drawer open={drawer === "payment"} onClose={() => setDrawer(null)} title={t("contactDetails.createPayment")} description={t("contactDetails.createPaymentDescription")}>
        <form onSubmit={createPayment} className="space-y-4">
          <FieldShell label={isRtl ? "وصف الدفعة" : "Payment label"}>
            <Input value={paymentForm.label} onChange={(event) => setPaymentForm({ ...paymentForm, label: event.target.value })} placeholder={isRtl ? "الدفعة الأولى" : "Milestone 1"} required />
          </FieldShell>
          <div className="grid gap-4 md:grid-cols-2">
            <FieldShell label={isRtl ? "القيمة" : "Amount"}>
              <Input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} className="force-ltr" />
            </FieldShell>
            <FieldShell label={isRtl ? "موعد الاستحقاق" : "Due date"}>
              <Input type="datetime-local" value={paymentForm.dueDate} onChange={(event) => setPaymentForm({ ...paymentForm, dueDate: event.target.value })} className="force-ltr" required />
            </FieldShell>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy === "payment"} className={buttonStyles("primary")}>{busy === "payment" ? t("common.saving") : (isRtl ? "جدولة الدفعة" : "Schedule payment")}</button>
            <button type="button" onClick={() => setDrawer(null)} className={buttonStyles("secondary")}>{t("common.cancel")}</button>
          </div>
        </form>
      </Drawer>
    </AppShell>
  );
}
