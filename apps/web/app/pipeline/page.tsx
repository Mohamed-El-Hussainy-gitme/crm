"use client";

import Link from "next/link";
import type { Route } from "next";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { useI18n } from "@/components/providers";
import { buttonStyles, FieldShell, Input, Select, Textarea } from "@/components/ui";
import { isoToLocalInput, localInputToIso, nextLocalDatetime } from "@/components/workflows";
import { apiFetch, apiPost } from "@/lib/api";

type AhwaPipelineStage = "READY_TO_CALL" | "CALLED" | "INTERESTED" | "DEMO_SCHEDULED" | "DEMO_DONE" | "TRIAL_OFFERED" | "WON" | "LOST";
type DemoType = "IN_PERSON" | "PHONE" | "WHATSAPP" | "ONLINE";
type ActionMode = "SCHEDULE_DEMO" | "MARK_DEMO_DONE" | "OFFER_TRIAL" | "MARK_WON" | "MARK_LOST";

type PipelineContact = {
  id: string;
  fullName: string;
  phone: string;
  company?: string | null;
  area?: string | null;
  mapUrl?: string | null;
  contactStage: string;
  pipelineStage: AhwaPipelineStage;
  expectedDealValue: number;
  score: number;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  tags: string[];
  whatsappUrl: string;
  nextAction: { label: string; urgency: "LOW" | "MEDIUM" | "HIGH"; dueAt: string | null };
  demoTask: { id: string; title: string; dueAt: string; description?: string | null } | null;
  nextTask: { id: string; title: string; type: string; priority: string; dueAt: string } | null;
  deal: { id: string; title: string; amount: number; stage: string; probability: number } | null;
};

type PipelineOverview = {
  stages: Array<{ key: AhwaPipelineStage; label: string; description: string }>;
  board: Array<{ key: AhwaPipelineStage; label: string; description: string; contacts: PipelineContact[] }>;
  summary: {
    totalProspects: number;
    activeProspects: number;
    scheduledDemos: number;
    trials: number;
    won: number;
    lost: number;
    openPipelineValue: number;
    demoConversionRate: number;
  };
  focus: PipelineContact[];
  lostReasons: string[];
  demoTypes: DemoType[];
  checklist: string[];
  scripts: {
    demoIntro: string;
    afterDemo: string;
    trialFollowUp: string;
    close: string;
  };
};

const stageTone: Record<AhwaPipelineStage, "slate" | "sky" | "emerald" | "amber" | "rose"> = {
  READY_TO_CALL: "slate",
  CALLED: "sky",
  INTERESTED: "amber",
  DEMO_SCHEDULED: "sky",
  DEMO_DONE: "amber",
  TRIAL_OFFERED: "emerald",
  WON: "emerald",
  LOST: "rose",
};

const demoTypeLabels: Record<DemoType, string> = {
  IN_PERSON: "زيارة",
  PHONE: "مكالمة",
  WHATSAPP: "واتساب",
  ONLINE: "أونلاين",
};

function addDaysLocal(days: number, hour = 10) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  date.setHours(hour, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function urgentTone(value: string) {
  if (value === "HIGH") return "rose" as const;
  if (value === "MEDIUM") return "amber" as const;
  return "slate" as const;
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function scoreTone(score: number) {
  if (score >= 75) return "emerald" as const;
  if (score >= 55) return "amber" as const;
  return "slate" as const;
}

function StageSwitcher({
  overview,
  activeStage,
  onChange,
}: {
  overview: PipelineOverview;
  activeStage: AhwaPipelineStage;
  onChange: (stage: AhwaPipelineStage) => void;
}) {
  return (
    <Card title="مراحل البيع" description="اختر مرحلة واحدة واعمل على فرصها بدون زحام بصري.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overview.board.map((stage) => {
          const active = stage.key === activeStage;
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => onChange(stage.key)}
              className={`rounded-enterprise border p-4 text-start transition ${active ? "border-enterprise-primary bg-enterprise-primary text-white shadow-panel" : "border-enterprise-border bg-enterprise-surface50 hover:border-enterprise-primary hover:bg-white"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-sm font-black ${active ? "text-white" : "text-enterprise-text"}`}>{stage.label}</p>
                  <p className={`mt-1 line-clamp-2 text-xs leading-5 ${active ? "text-white/70" : "text-enterprise-muted"}`}>{stage.description}</p>
                </div>
                <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-black ${active ? "bg-white text-enterprise-primary" : "bg-white text-enterprise-text border border-enterprise-border"}`}>{stage.contacts.length}</span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ContactRow({
  contact,
  active,
  onSelect,
}: {
  contact: PipelineContact;
  active: boolean;
  onSelect: (contact: PipelineContact) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(contact)}
      className={`w-full rounded-enterprise border px-4 py-4 text-start transition ${active ? "border-enterprise-secondary bg-enterprise-secondary/10 shadow-panel" : "border-enterprise-border bg-white hover:border-enterprise-primary hover:bg-enterprise-surface50"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display truncate text-xl font-semibold text-enterprise-text">{contact.fullName}</p>
            <Badge tone={scoreTone(contact.score)}>{contact.score}</Badge>
            <Badge tone={urgentTone(contact.nextAction.urgency)}>{contact.nextAction.urgency}</Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-enterprise-muted">{contact.area || "بدون منطقة"} · {contact.phone || "بدون رقم"} · {contact.nextAction.label}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-enterprise-muted">
            {contact.demoTask ? <span className="rounded-md bg-enterprise-surface px-2 py-1">Demo {new Date(contact.demoTask.dueAt).toLocaleString()}</span> : null}
            {contact.deal ? <span className="rounded-md bg-enterprise-surface px-2 py-1">{contact.deal.stage} · {compactMoney(contact.deal.amount)}</span> : null}
            {contact.nextTask ? <span className="rounded-md bg-enterprise-surface px-2 py-1">Next: {contact.nextTask.title}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${contact.phone}`} onClick={(event) => event.stopPropagation()} className={buttonStyles("primary", "sm")}>اتصال</a>
          <a href={contact.whatsappUrl} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer" className={buttonStyles("success", "sm")}>واتساب</a>
        </div>
      </div>
    </button>
  );
}

function ActionPanel({
  contact,
  overview,
  mode,
  setMode,
  busy,
  onSubmit,
}: {
  contact: PipelineContact;
  overview: PipelineOverview;
  mode: ActionMode;
  setMode: (mode: ActionMode) => void;
  busy: boolean;
  onSubmit: (mode: ActionMode, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [demoAt, setDemoAt] = useState(nextLocalDatetime(1));
  const [demoType, setDemoType] = useState<DemoType>("IN_PERSON");
  const [decisionMaker, setDecisionMaker] = useState("Owner");
  const [expectedValue, setExpectedValue] = useState(String(contact.expectedDealValue || 0));
  const [notes, setNotes] = useState("");
  const [painPoints, setPainPoints] = useState("");
  const [staffCount, setStaffCount] = useState("");
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [offerTrial, setOfferTrial] = useState(false);
  const [followUpAt, setFollowUpAt] = useState(addDaysLocal(1, 11));
  const [trialEndsAt, setTrialEndsAt] = useState(addDaysLocal(7, 12));
  const [wonAmount, setWonAmount] = useState(String(contact.deal?.amount || contact.expectedDealValue || 0));
  const [lostReason, setLostReason] = useState(overview.lostReasons[0] || "Not interested now");

  useEffect(() => {
    setDemoAt(contact.demoTask?.dueAt ? isoToLocalInput(contact.demoTask.dueAt) : nextLocalDatetime(1));
    setExpectedValue(String(contact.deal?.amount || contact.expectedDealValue || 0));
    setWonAmount(String(contact.deal?.amount || contact.expectedDealValue || 0));
    setNotes("");
    setPainPoints("");
    setStaffCount("");
    setBudget("");
    setTimeline("");
    setOfferTrial(false);
    setFollowUpAt(addDaysLocal(1, 11));
    setTrialEndsAt(addDaysLocal(7, 12));
    setLostReason(overview.lostReasons[0] || "Not interested now");
  }, [contact.id, contact.demoTask?.dueAt, contact.deal?.amount, contact.expectedDealValue, overview.lostReasons]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "SCHEDULE_DEMO") return onSubmit(mode, { contactId: contact.id, demoAt: localInputToIso(demoAt), demoType, decisionMaker, notes, expectedValue: Number(expectedValue || 0) });
    if (mode === "MARK_DEMO_DONE") return onSubmit(mode, { contactId: contact.id, notes, painPoints, staffCount, budget, timeline, offerTrial, followUpAt: localInputToIso(followUpAt) });
    if (mode === "OFFER_TRIAL") return onSubmit(mode, { contactId: contact.id, trialEndsAt: localInputToIso(trialEndsAt), notes });
    if (mode === "MARK_WON") return onSubmit(mode, { contactId: contact.id, amount: Number(wonAmount || 0), notes });
    return onSubmit(mode, { contactId: contact.id, reason: lostReason, notes });
  };

  const script = mode === "OFFER_TRIAL" ? overview.scripts.trialFollowUp : mode === "MARK_WON" ? overview.scripts.close : mode === "MARK_DEMO_DONE" ? overview.scripts.afterDemo : overview.scripts.demoIntro;

  return (
    <Card title="Action panel" description="One lead, one next commercial move." className="sticky top-24">
      <div className="space-y-5">
        <div className="rounded-enterprise border border-enterprise-border bg-enterprise-surface50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-2xl font-semibold text-enterprise-text">{contact.fullName}</p>
              <p className="mt-1 text-sm text-enterprise-muted">{contact.area || "بدون منطقة"} · {contact.phone || "بدون رقم"}</p>
            </div>
            <Badge tone={stageTone[contact.pipelineStage]}>{contact.pipelineStage.replaceAll("_", " ")}</Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a href={`tel:${contact.phone}`} className={buttonStyles("primary", "sm")}>اتصال</a>
            <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className={buttonStyles("success", "sm")}>واتساب</a>
            {contact.mapUrl ? <a href={contact.mapUrl} target="_blank" rel="noreferrer" className={buttonStyles("secondary", "sm")}>Maps</a> : null}
            <Link href={`/contacts/view?id=${contact.id}` as Route} className={buttonStyles("secondary", "sm")}>Contact file</Link>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setMode("SCHEDULE_DEMO")} className={buttonStyles(mode === "SCHEDULE_DEMO" ? "primary" : "secondary", "sm")}>Book demo</button>
          <button type="button" onClick={() => setMode("MARK_DEMO_DONE")} className={buttonStyles(mode === "MARK_DEMO_DONE" ? "primary" : "secondary", "sm")}>Demo done</button>
          <button type="button" onClick={() => setMode("OFFER_TRIAL")} className={buttonStyles(mode === "OFFER_TRIAL" ? "primary" : "secondary", "sm")}>عرض تجربة</button>
          <button type="button" onClick={() => setMode("MARK_WON")} className={buttonStyles(mode === "MARK_WON" ? "success" : "secondary", "sm")}>عميل جديد</button>
          <button type="button" onClick={() => setMode("MARK_LOST")} className={buttonStyles(mode === "MARK_LOST" ? "danger" : "secondary", "sm")}>خسارة</button>
        </div>

        <div className="rounded-enterprise border border-enterprise-border bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Suggested script</p>
          <p className="mt-2 text-sm leading-7 text-enterprise-text">{script}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "SCHEDULE_DEMO" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldShell label="Demo time"><Input type="datetime-local" value={demoAt} onChange={(event) => setDemoAt(event.target.value)} required /></FieldShell>
                <FieldShell label="Demo type"><Select value={demoType} onChange={(event) => setDemoType(event.target.value as DemoType)}>{overview.demoTypes.map((item) => <option key={item} value={item}>{demoTypeLabels[item]}</option>)}</Select></FieldShell>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldShell label="Decision maker"><Input value={decisionMaker} onChange={(event) => setDecisionMaker(event.target.value)} /></FieldShell>
                <FieldShell label="Expected value"><Input type="number" min="0" value={expectedValue} onChange={(event) => setExpectedValue(event.target.value)} /></FieldShell>
              </div>
              <FieldShell label="Demo notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Who will attend? What should be shown first?" /></FieldShell>
            </>
          ) : null}

          {mode === "MARK_DEMO_DONE" ? (
            <>
              <FieldShell label="Demo summary"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What happened in the demo?" /></FieldShell>
              <FieldShell label="Pain points"><Textarea value={painPoints} onChange={(event) => setPainPoints(event.target.value)} placeholder="Mistakes, delays, cash leakage, kitchen flow, reports..." /></FieldShell>
              <div className="grid gap-3 sm:grid-cols-3">
                <FieldShell label="Staff / orders"><Input value={staffCount} onChange={(event) => setStaffCount(event.target.value)} placeholder="8 staff / 150 orders" /></FieldShell>
                <FieldShell label="Budget"><Input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Monthly budget" /></FieldShell>
                <FieldShell label="Timeline"><Input value={timeline} onChange={(event) => setTimeline(event.target.value)} placeholder="This week / later" /></FieldShell>
              </div>
              <label className="flex items-center gap-3 rounded-enterprise border border-enterprise-border bg-enterprise-surface px-4 py-3 text-sm font-semibold text-enterprise-text">
                <input type="checkbox" checked={offerTrial} onChange={(event) => setOfferTrial(event.target.checked)} className="h-4 w-4" />
                عرض تجربة directly after this demo
              </label>
              <FieldShell label="Next follow-up"><Input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} /></FieldShell>
            </>
          ) : null}

          {mode === "OFFER_TRIAL" ? (
            <>
              <FieldShell label="Trial follow-up date"><Input type="datetime-local" value={trialEndsAt} onChange={(event) => setTrialEndsAt(event.target.value)} required /></FieldShell>
              <FieldShell label="Trial notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Trial scope, who will test, what success means." /></FieldShell>
            </>
          ) : null}

          {mode === "MARK_WON" ? (
            <>
              <FieldShell label="Won amount"><Input type="number" min="1" value={wonAmount} onChange={(event) => setWonAmount(event.target.value)} required /></FieldShell>
              <FieldShell label="Onboarding notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Start date, first setup step, special requirements." /></FieldShell>
            </>
          ) : null}

          {mode === "MARK_LOST" ? (
            <>
              <FieldShell label="Loss reason"><Select value={lostReason} onChange={(event) => setLostReason(event.target.value)}>{overview.lostReasons.map((item) => <option key={item} value={item}>{item}</option>)}</Select></FieldShell>
              <FieldShell label="Loss notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What should we learn from this loss?" /></FieldShell>
            </>
          ) : null}

          <button type="submit" disabled={busy} className={buttonStyles(mode === "MARK_LOST" ? "danger" : mode === "MARK_WON" ? "success" : "primary", "md", true)}>
            {busy ? "جارٍ الحفظ..." : "حفظ الحركة"}
          </button>
        </form>
      </div>
    </Card>
  );
}

export default function PipelinePage() {
  const { formatDateTime, formatCurrency } = useI18n();
  const [overview, setOverview] = useState<PipelineOverview | null>(null);
  const [activeStage, setActiveStage] = useState<AhwaPipelineStage>("INTERESTED");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ActionMode>("SCHEDULE_DEMO");

  const allContacts = useMemo(() => overview?.board.flatMap((stage) => stage.contacts) ?? [], [overview]);
  const activeBucket = useMemo(() => overview?.board.find((stage) => stage.key === activeStage) ?? overview?.board[0] ?? null, [activeStage, overview]);
  const stageContacts = activeBucket?.contacts ?? [];
  const selected = useMemo(() => allContacts.find((contact) => contact.id === selectedId) ?? stageContacts[0] ?? overview?.focus[0] ?? allContacts[0] ?? null, [allContacts, overview?.focus, selectedId, stageContacts]);

  const load = async () => {
    try {
      setError("");
      const data = await apiFetch<PipelineOverview>("/demo-pipeline/overview");
      setOverview(data);
      const firstNonEmpty = data.board.find((stage) => stage.contacts.length)?.key ?? data.board[0]?.key ?? "INTERESTED";
      setActiveStage((current) => data.board.some((stage) => stage.key === current) ? current : firstNonEmpty);
      setSelectedId((current) => current ?? data.focus[0]?.id ?? data.board.flatMap((stage) => stage.contacts)[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل مسار العروض");
    }
  };

  useEffect(() => { void load(); }, []);

  const submitAction = async (action: ActionMode, payload: Record<string, unknown>) => {
    const endpoint: Record<ActionMode, string> = {
      SCHEDULE_DEMO: "/demo-pipeline/schedule-demo",
      MARK_DEMO_DONE: "/demo-pipeline/mark-demo-done",
      OFFER_TRIAL: "/demo-pipeline/offer-trial",
      MARK_WON: "/demo-pipeline/mark-won",
      MARK_LOST: "/demo-pipeline/mark-lost",
    };
    try {
      setBusy(true);
      setError("");
      await apiPost(endpoint[action], payload);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ حركة المسار");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="مسار مبيعات Ahwa"
          title="حوّل الاهتمام إلى عميل مدفوع"
          description="مسار واضح لحجز العروض، تسجيل نتيجة الديمو، عرض التجربة، وتحديد سبب الخسارة."
          actions={<Link href={"/prospecting" as Route} className={buttonStyles("secondary", "sm")}>مساحة الترويج</Link>}
        />

        {error ? <div className="rounded-enterprise border border-enterprise-danger/30 bg-enterprise-danger/10 px-4 py-3 text-sm font-semibold text-enterprise-danger">{error}</div> : null}

        {overview ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <StatCard label="فرص نشطة" value={overview.summary.activeProspects} helper="ليست عميلًا أو خسارة" tone="sky" />
              <StatCard label="عروض مجدولة" value={overview.summary.scheduledDemos} helper="مواعيد محجوزة" tone="amber" />
              <StatCard label="تجارب" value={overview.summary.trials} helper="تحتاج متابعة" tone="emerald" />
              <StatCard label="عملاء" value={overview.summary.won} helper="تم الإغلاق" tone="emerald" />
              <StatCard label="قيمة مفتوحة" value={formatCurrency(overview.summary.openPipelineValue)} helper="قيمة الصفقات المفتوحة" tone="slate" />
              <StatCard label="تحويل العروض" value={`${overview.summary.demoConversionRate}%`} helper="نسبة الإغلاق بعد العرض" tone="sky" />
            </div>

            <StageSwitcher overview={overview} activeStage={activeStage} onChange={(stage) => { setActiveStage(stage); setSelectedId(overview.board.find((item) => item.key === stage)?.contacts[0]?.id ?? null); }} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
              <div className="space-y-6">
                <Card title={activeBucket?.label ?? "فرص المرحلة"} description={activeBucket?.description ?? "اختر فرصة لتحديد الحركة التجارية التالية."}>
                  <div className="space-y-3">
                    {stageContacts.length ? stageContacts.map((contact) => (
                      <ContactRow key={contact.id} contact={contact} active={selected?.id === contact.id} onSelect={(next) => setSelectedId(next.id)} />
                    )) : <EmptyState title="لا توجد مقاهٍ في هذه المرحلة" description="انقل المقاهي المهتمة من مساحة الترويج أو اختر مرحلة أخرى." />}
                  </div>
                </Card>

                <Card title="قائمة العرض" description="استخدمها قبل كل عرض حتى لا تفقد المعلومات المطلوبة للإغلاق.">
                  <div className="grid gap-3 md:grid-cols-2">
                    {overview.checklist.map((item, index) => (
                      <div key={item} className="flex gap-3 rounded-enterprise border border-enterprise-border bg-white p-4">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-enterprise-primary text-xs font-black text-white">{index + 1}</span>
                        <p className="text-sm leading-6 text-enterprise-text">{item}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                {selected ? <ActionPanel contact={selected} overview={overview} mode={mode} setMode={setMode} busy={busy} onSubmit={submitAction} /> : <EmptyState title="لا توجد فرص في المسار" description="أدخل المقاهي من Google Maps أولًا، ثم ستظهر الفرص المهتمة هنا." />}

                <Card title="قائمة التركيز" description="أفضل المقاهي التي تحتاج حركة تجارية الآن.">
                  <div className="space-y-3">
                    {overview.focus.length ? overview.focus.slice(0, 8).map((contact) => (
                      <button key={contact.id} type="button" onClick={() => { setActiveStage(contact.pipelineStage); setSelectedId(contact.id); }} className="w-full rounded-enterprise border border-enterprise-border bg-white p-3 text-start hover:border-enterprise-primary hover:bg-enterprise-surface50">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-enterprise-text">{contact.fullName}</p>
                            <p className="mt-1 text-xs text-enterprise-muted">{contact.nextAction.label}</p>
                            {contact.nextAction.dueAt ? <p className="mt-1 text-xs text-enterprise-muted">{formatDateTime(contact.nextAction.dueAt)}</p> : null}
                          </div>
                          <Badge tone={urgentTone(contact.nextAction.urgency)}>{contact.nextAction.urgency}</Badge>
                        </div>
                      </button>
                    )) : <EmptyState title="لا توجد عناصر تركيز" description="لا توجد فرص نشطة تحتاج حركة الآن." />}
                  </div>
                </Card>
              </div>
            </div>
          </>
        ) : (
          <Card><p className="text-sm font-semibold text-enterprise-muted">جارٍ تحميل مسار العروض...</p></Card>
        )}
      </div>
    </AppShell>
  );
}
