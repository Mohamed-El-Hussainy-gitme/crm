"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { buttonStyles, FieldShell, Input, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Tone = "slate" | "sky" | "emerald" | "amber" | "rose";
type ProspectingView = "command" | "capture" | "intake" | "enrichment" | "scripts";

type RecommendedAction = {
  key: string;
  label: string;
  urgency: "HIGH" | "MEDIUM" | "LOW" | string;
};

type ScoreBreakdown = {
  total: number;
  phone: number;
  map: number;
  area: number;
  freshness: number;
  dueFollowUp: number;
  stage: number;
  penalty: number;
};

type ProspectingContact = {
  id: string;
  fullName: string;
  phone: string;
  hasPhone: boolean;
  source?: string | null;
  area?: string | null;
  stage: string;
  company?: string | null;
  locationText?: string | null;
  mapUrl?: string | null;
  placeLabel?: string | null;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  tags: string[];
  score: number;
  scoreBreakdown?: ScoreBreakdown;
  priority: "HIGH" | "MEDIUM" | "LOW";
  recommendedAction?: RecommendedAction;
  callUrl: string | null;
  whatsappUrl: string | null;
  pendingTasks?: number;
  nextTaskDueAt?: string | null;
};

type AreaCampaign = {
  area: string;
  total: number;
  readyToCall: number;
  called: number;
  meetings: number;
  clients: number;
  lost: number;
  needsPhone: number;
  overdue?: number;
  score?: number;
  coverage?: number;
  priority?: "HIGH" | "MEDIUM" | "LOW";
};

type Template = {
  key: string;
  title: string;
  body: string;
  url: string | null;
};

type DailyPlan = {
  date: string;
  targetCalls: number;
  primaryArea: string | null;
  firstLeadId: string | null;
  readyNow: number;
  overdueFollowUps: number;
  dueFollowUps: number;
  meetingsToday: number;
  needsEnrichment: number;
  focus: string;
};

type Overview = {
  activeArea?: string | null;
  dailyPlan?: DailyPlan;
  counts: {
    totalCafeLeads: number;
    readyToCall: number;
    needsPhone: number;
    contacted: number;
    meetings: number;
  };
  globalCounts?: {
    totalCafeLeads: number;
    readyToCall: number;
    needsPhone: number;
  };
  callQueue: ProspectingContact[];
  followUpDue?: ProspectingContact[];
  meetingsToday?: ProspectingContact[];
  needsPhone: ProspectingContact[];
  areaCampaigns: AreaCampaign[];
  templates: Template[];
};

type DuplicateCandidate = {
  id: string;
  fullName: string;
  phone: string;
  area: string | null;
  mapUrl: string | null;
  stage: string;
  reason: string;
  score: number;
};

type ParsedLead = {
  id: string;
  name: string;
  phone: string | null;
  phoneCandidates?: string[];
  normalizedPhone: string | null;
  area: string | null;
  city?: string | null;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
  coordinates?: string | null;
  plusCode?: string | null;
  mapUrl: string | null;
  source: string;
  notes: string | null;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  tags: string[];
  warnings: string[];
  duplicateStatus?: "NEW" | "POSSIBLE_DUPLICATE";
  duplicateCandidates?: DuplicateCandidate[];
};

type ImportResult = {
  name: string;
  status: "CREATED" | "SKIPPED";
  reason?: string;
};

const sampleMapsText = `Cilantro Coffee Shop
01012345678
Coffee shop
90th Street, New Cairo, Cairo
https://www.google.com/maps/place/Cilantro+Coffee

Local Cafe
Mokattam, Cairo
https://www.google.com/maps/place/Local+Cafe`;

const quickOutcomes: Array<{ key: string; label: string; tone: Tone; helper: string }> = [
  { key: "NO_ANSWER", label: "No answer", tone: "amber", helper: "Retry tomorrow" },
  { key: "INTERESTED", label: "Interested", tone: "emerald", helper: "Send intro" },
  { key: "NEEDS_OWNER", label: "Needs owner", tone: "sky", helper: "Call evening" },
  { key: "MEETING_BOOKED", label: "Meeting booked", tone: "emerald", helper: "Create demo" },
  { key: "NEEDS_CALLBACK", label: "Callback", tone: "sky", helper: "Same day" },
  { key: "ALREADY_HAS_SYSTEM", label: "Has system", tone: "amber", helper: "Later check" },
  { key: "WRONG_NUMBER", label: "Wrong number", tone: "rose", helper: "Close lead" },
  { key: "REJECTED", label: "Rejected", tone: "rose", helper: "Archive" },
];

const viewTabs: Array<{ key: ProspectingView; label: string; description: string }> = [
  { key: "command", label: "التشغيل", description: "قائمة الاتصال والخطوة القادمة" },
  { key: "capture", label: "التقاط", description: "حفظ أماكن من Google Maps" },
  { key: "intake", label: "إدخال الخرائط", description: "لصق ومراجعة العملاء" },
  { key: "enrichment", label: "إكمال البيانات", description: "أرقام ومناطق ناقصة" },
  { key: "scripts", label: "الرسائل", description: "قوالب واتساب" },
];

function addDaysIso(days: number, hour = 12) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
}

function toneForPriority(priority?: ProspectingContact["priority"] | AreaCampaign["priority"]): Tone {
  if (priority === "HIGH") return "emerald";
  if (priority === "MEDIUM") return "amber";
  return "slate";
}

function toneForConfidence(confidence: ParsedLead["confidence"]): Tone {
  if (confidence === "HIGH") return "emerald";
  if (confidence === "MEDIUM") return "amber";
  return "slate";
}

function toneForAction(action?: RecommendedAction): Tone {
  if (!action) return "slate";
  if (action.urgency === "HIGH") return "emerald";
  if (action.key === "ENRICH_PHONE") return "amber";
  return "sky";
}

function formatDateTime(value?: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function progressWidth(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function editableLeadPayload(lead: ParsedLead) {
  return {
    name: lead.name,
    phone: lead.phone || undefined,
    area: lead.area || undefined,
    city: lead.city || undefined,
    address: lead.address || undefined,
    latitude: lead.latitude ?? undefined,
    longitude: lead.longitude ?? undefined,
    coordinates: lead.coordinates || undefined,
    plusCode: lead.plusCode || undefined,
    mapUrl: lead.mapUrl || undefined,
    source: lead.source || "Google Maps",
    notes: lead.notes || undefined,
    score: lead.score,
    tags: lead.tags,
  };
}

function decodeCapturePayload(value: string): unknown {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function buildGoogleMapsBookmarklet(origin: string) {
  const targetOrigin = JSON.stringify(origin);
  const code = [
    "(()=>{",
    "const origin=", targetOrigin, ";",
    "const clean=v=>(v||'').replace(/\\s+/g,' ').trim();",
    "const nodes='h1,[aria-label],[data-item-id],button,a,div';",
    "const text=clean(Array.from(document.querySelectorAll(nodes)).map(e=>e.getAttribute('aria-label')||e.textContent||'').filter(Boolean).join('\\n')).slice(0,7000);",
    "const h1=clean(document.querySelector('h1')?.textContent||'');",
    "const phoneMatches=Array.from(new Set((text.match(/(?:\\+?20|0020|0)?1[0125][\\s\\d().-]{8,16}|(?:\\+?20|0020)?\\s*0?2[\\s\\d().-]{8}/g)||[]).map(clean).filter(Boolean)));",
    "const phone=phoneMatches[0]||'';",
    "const address=clean(Array.from(document.querySelectorAll('[data-item-id*=address],button[aria-label^=\\\"Address:\\\"],button[aria-label^=\\\"العنوان\\\"]')).map(e=>(e.getAttribute('aria-label')||e.textContent||'').replace(/^Address:\\s*/i,'').replace(/^العنوان:?\\s*/, '')).find(Boolean)||'');",
    "const website=Array.from(document.querySelectorAll('a[href^=\\\"http\\\"]')).map(a=>a.href).find(h=>!/(google|gstatic|ggpht|schema)/i.test(h))||'';",
    "const payload={name:h1,title:document.title,phone,phoneCandidates:phoneMatches,address,website,pageUrl:location.href,rawText:text,capturedAt:new Date().toISOString(),source:'Google Maps Capture'};",
    "const json=JSON.stringify(payload);",
    "const data=btoa(unescape(encodeURIComponent(json))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');",
    "window.open(origin+'/prospecting?capture='+encodeURIComponent(data),'_blank','noopener,noreferrer');",
    "})()",
  ].join("");
  return `javascript:${code}`;
}

function duplicateTone(count?: number): Tone {
  return count ? "amber" : "emerald";
}

function uniqueContacts(groups: Array<ProspectingContact[] | undefined>) {
  const seen = new Set<string>();
  const result: ProspectingContact[] = [];
  for (const group of groups) {
    for (const contact of group ?? []) {
      if (seen.has(contact.id)) continue;
      seen.add(contact.id);
      result.push(contact);
    }
  }
  return result;
}

function LeadCompactCard({
  contact,
  selected,
  onSelect,
}: {
  contact: ProspectingContact;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-start shadow-sm transition ${selected ? "border-enterprise-secondary bg-enterprise-secondary/10" : "border-enterprise-border bg-white hover:border-enterprise-primary hover:bg-enterprise-surface50"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display truncate text-xl font-semibold text-enterprise-text">{contact.fullName}</p>
            <Badge tone={toneForPriority(contact.priority)}>{contact.priority}</Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-enterprise-muted">
            {contact.area || "Unassigned area"} · {contact.stage} · {contact.recommendedAction?.label ?? "Call now"}
          </p>
        </div>
        <div className="text-end">
          <p className="font-display text-3xl font-semibold text-enterprise-text">{contact.score}</p>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-enterprise-muted">الدرجة</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone={toneForAction(contact.recommendedAction)}>{contact.recommendedAction?.label ?? "Call now"}</Badge>
        {contact.pendingTasks ? <Badge tone="sky">{contact.pendingTasks} tasks</Badge> : null}
        {contact.nextTaskDueAt ? <Badge tone="amber">{formatDateTime(contact.nextTaskDueAt)}</Badge> : null}
      </div>
    </button>
  );
}

function AreaChip({
  area,
  active,
  onClick,
}: {
  area: AreaCampaign;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[15rem] rounded-xl border px-4 py-3 text-start transition ${active ? "border-enterprise-secondary bg-enterprise-secondary text-white shadow-panel" : "border-enterprise-border bg-white hover:border-enterprise-primary"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{area.area}</p>
        <span className="text-xs font-bold opacity-75">{area.coverage ?? 0}%</span>
      </div>
      <p className={`mt-1 text-xs ${active ? "text-white/75" : "text-enterprise-muted"}`}>
        {area.readyToCall} ready · {area.needsPhone} need phone · {area.meetings} meetings
      </p>
      <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${active ? "bg-white/22" : "bg-enterprise-surface"}`}>
        <div className={`h-full ${active ? "bg-white" : "bg-enterprise-secondary"}`} style={{ width: progressWidth(area.coverage ?? 0) }} />
      </div>
    </button>
  );
}

function ContactActionPanel({
  contact,
  templates,
  actioningContactId,
  onOutcome,
}: {
  contact: ProspectingContact | null;
  templates: Template[];
  actioningContactId: string | null;
  onOutcome: (contact: ProspectingContact, outcome: string) => void;
}) {
  if (!contact) {
    return (
      <Card title="لوحة العميل" description="اختر عميلًا من القائمة لعرض أزرار الاتصال والنصوص والخطوة القادمة.">
        <EmptyState title="لا يوجد عميل محدد" description="أدخل بيانات مقاهٍ أو اختر منطقة تحتوي فرصًا جاهزة للاتصال." />
      </Card>
    );
  }

  const script = templates[0];
  const scoreParts = contact.scoreBreakdown
    ? [
        ["Phone", contact.scoreBreakdown.phone],
        ["Maps", contact.scoreBreakdown.map],
        ["Area", contact.scoreBreakdown.area],
        ["Follow-up", contact.scoreBreakdown.dueFollowUp],
        ["Stage", contact.scoreBreakdown.stage],
      ]
    : [];

  return (
    <Card
      title="لوحة العميل"
      description="استخدمها أثناء المكالمة. كل نتيجة تسجل حركة وتجهز الخطوة التالية."
      actions={<Badge tone={toneForAction(contact.recommendedAction)}>{contact.recommendedAction?.label ?? "Call now"}</Badge>}
      className="xl:sticky xl:top-24"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-enterprise-primary/20 bg-enterprise-primary p-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-enterprise-secondary">المقهى النشط</p>
              <h2 className="font-display mt-2 text-3xl font-semibold tracking-tight text-white">{contact.fullName}</h2>
              <p className="mt-2 text-sm leading-6 text-white/72">{contact.area || "Unassigned area"} · {contact.stage}</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-center">
              <p className="font-display text-4xl font-semibold">{contact.score}</p>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-white/60">الدرجة</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {contact.callUrl ? <a href={contact.callUrl} className={buttonStyles("primary", "sm", true)}>اتصال</a> : <span className={buttonStyles("ghost", "sm", true)}>لا يوجد رقم</span>}
            {contact.whatsappUrl ? <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className={buttonStyles("secondary", "sm", true)}>واتساب</a> : null}
            {contact.mapUrl ? <a href={contact.mapUrl} target="_blank" rel="noreferrer" className={buttonStyles("secondary", "sm", true)}>الخريطة</a> : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">المهمة القادمة</p>
            <p className="mt-2 font-semibold text-enterprise-text">{contact.nextTaskDueAt ? formatDateTime(contact.nextTaskDueAt) : "No pending task"}</p>
          </div>
          <div className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">آخر تواصل</p>
            <p className="mt-2 font-semibold text-enterprise-text">{contact.lastContactedAt ? formatDateTime(contact.lastContactedAt) : "Never contacted"}</p>
          </div>
        </div>

        {scoreParts.length ? (
          <div className="rounded-xl border border-enterprise-border bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">سبب الأولوية</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              {scoreParts.map(([label, value]) => (
                <div key={label} className="rounded-lg bg-enterprise-surface50 px-3 py-2 text-center">
                  <p className="font-display text-xl font-semibold text-enterprise-text">{value}</p>
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-enterprise-muted">{label}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">نتيجة المكالمة</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {quickOutcomes.map((outcome) => (
              <button
                key={outcome.key}
                type="button"
                onClick={() => onOutcome(contact, outcome.key)}
                disabled={actioningContactId === contact.id}
                className="rounded-xl border border-enterprise-border bg-white px-4 py-3 text-start text-sm shadow-sm transition hover:border-enterprise-primary hover:bg-enterprise-surface50 disabled:opacity-55"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-enterprise-text">{outcome.label}</span>
                  <Badge tone={outcome.tone}>{outcome.helper}</Badge>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">نص مقترح</p>
          <p className="mt-3 text-sm leading-7 text-enterprise-text">{script?.body ?? "السلام عليكم، أنا محمد من Ahwa. ينفع أحدد مع المسؤول 10 دقايق أعرض السيستم؟"}</p>
          {script?.url || contact.whatsappUrl ? (
            <a href={script?.url ?? contact.whatsappUrl ?? "#"} target="_blank" rel="noreferrer" className={`${buttonStyles("secondary", "sm")} mt-4`}>فتح نص واتساب</a>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default function ProspectingPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [input, setInput] = useState("");
  const [defaultArea, setDefaultArea] = useState("");
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [captureJson, setCaptureJson] = useState("");
  const [captureOrigin, setCaptureOrigin] = useState("");
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ProspectingView>("command");
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [actioningContactId, setActioningContactId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async (area = selectedArea) => {
    try {
      setError("");
      const suffix = area ? `?area=${encodeURIComponent(area)}` : "";
      const data = await apiFetch<Overview>(`/acquisition/overview${suffix}`);
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Ahwa prospecting console");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(selectedArea);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArea]);

  useEffect(() => {
    setCaptureOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    const encodedCapture = params.get("capture");
    if (!encodedCapture) return;

    try {
      const payload = decodeCapturePayload(encodedCapture);
      void capturePayload(payload, true);
      params.delete("capture");
      const nextQuery = params.toString();
      const nextUrl = window.location.pathname + (nextQuery ? `?${nextQuery}` : "");
      window.history.replaceState({}, "", nextUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read captured Google Maps payload");
      setActiveView("capture");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedParsedLeads = useMemo(
    () => parsedLeads.filter((lead) => selectedLeadIds.includes(lead.id)),
    [parsedLeads, selectedLeadIds],
  );

  const allVisibleContacts = useMemo(
    () => uniqueContacts([overview?.followUpDue, overview?.meetingsToday, overview?.callQueue, overview?.needsPhone]),
    [overview],
  );

  useEffect(() => {
    if (!overview) return;
    if (selectedContactId && allVisibleContacts.some((contact) => contact.id === selectedContactId)) return;
    setSelectedContactId(overview.dailyPlan?.firstLeadId ?? allVisibleContacts[0]?.id ?? null);
  }, [allVisibleContacts, overview, selectedContactId]);

  const selectedContact = allVisibleContacts.find((contact) => contact.id === selectedContactId) ?? allVisibleContacts[0] ?? null;
  const counts = overview?.counts ?? { totalCafeLeads: 0, readyToCall: 0, needsPhone: 0, contacted: 0, meetings: 0 };
  const plan = overview?.dailyPlan;

  const capturePayload = async (payload?: unknown, fromBookmarklet = false) => {
    let actualPayload = payload;
    if (actualPayload === undefined) {
      const trimmed = captureJson.trim();
      if (!trimmed) return;
      try {
        actualPayload = JSON.parse(trimmed);
      } catch {
        actualPayload = { rawText: trimmed, pageUrl: trimmed.startsWith("http") ? trimmed : undefined };
      }
    }

    try {
      setError("");
      setMessage("");
      setCapturing(true);
      const data = await apiFetch<{ lead: ParsedLead; summary: { duplicateCandidates: number } }>("/acquisition/capture", {
        method: "POST",
        body: JSON.stringify({ payload: actualPayload, defaultArea: defaultArea || selectedArea || undefined }),
      });
      setParsedLeads((current) => {
        const withoutSame = current.filter((lead) => lead.id !== data.lead.id);
        return [data.lead, ...withoutSame];
      });
      setSelectedLeadIds((current) => Array.from(new Set([data.lead.id, ...current])));
      setActiveView("capture");
      setMessage(`${fromBookmarklet ? "Captured" : "Parsed"} ${data.lead.name}. ${data.summary.duplicateCandidates ? `${data.summary.duplicateCandidates} possible duplicate${data.summary.duplicateCandidates === 1 ? "" : "s"} found.` : "No duplicates detected."}`);
      setCaptureJson("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not capture Google Maps place");
    } finally {
      setCapturing(false);
    }
  };

  const bookmarkletHref = captureOrigin ? buildGoogleMapsBookmarklet(captureOrigin) : "#";

  const parseInput = async () => {
    try {
      setError("");
      setMessage("");
      setImportResults([]);
      setParsing(true);
      const data = await apiFetch<{ leads: ParsedLead[]; summary: { detected: number } }>("/acquisition/parse", {
        method: "POST",
        body: JSON.stringify({ input, defaultArea: defaultArea || selectedArea || undefined, defaultSource: "Google Maps" }),
      });
      setParsedLeads(data.leads);
      setSelectedLeadIds(data.leads.map((lead) => lead.id));
      setActiveView("intake");
      setMessage(`Detected ${data.leads.length} cafe lead${data.leads.length === 1 ? "" : "s"}. Review before importing.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse Google Maps input");
    } finally {
      setParsing(false);
    }
  };

  const importSelected = async () => {
    if (!selectedParsedLeads.length) return;
    try {
      setError("");
      setMessage("");
      setImporting(true);
      const data = await apiFetch<{ createdCount: number; skippedCount: number; results: ImportResult[] }>("/acquisition/import", {
        method: "POST",
        body: JSON.stringify({ leads: selectedParsedLeads.map(editableLeadPayload) }),
      });
      setImportResults(data.results);
      setMessage(`Imported ${data.createdCount} lead${data.createdCount === 1 ? "" : "s"}; skipped ${data.skippedCount}.`);
      setParsedLeads([]);
      setSelectedLeadIds([]);
      setActiveView("command");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import selected leads");
    } finally {
      setImporting(false);
    }
  };

  const updateLead = (id: string, patch: Partial<ParsedLead>) => {
    setParsedLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)));
  };

  const applyOutcome = async (contact: ProspectingContact, outcome: string) => {
    try {
      setError("");
      setMessage("");
      setActioningContactId(contact.id);
      await apiFetch("/acquisition/call-outcome", {
        method: "POST",
        body: JSON.stringify({
          contactId: contact.id,
          outcome,
          summary: `${outcome.replace(/_/g, " ")} from Ahwa daily command center.`,
          meetingAt: outcome === "MEETING_BOOKED" ? addDaysIso(1, 13) : undefined,
        }),
      });
      setMessage(`${contact.fullName}: ${outcome.replace(/_/g, " ").toLowerCase()} saved and next action prepared.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save call outcome");
    } finally {
      setActioningContactId(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="ترويج Ahwa"
          title="مساحة عمل الترويج اليومية"
          description="التقط بيانات المقاهي، رتّب أولوية الاتصال، سجّل نتيجة المكالمة، واجعل المتابعة القادمة واضحة."
          actions={
            <div className="flex flex-wrap gap-3">
              <Link href={"/pipeline" as Route} className={buttonStyles("secondary")}>مسار العروض</Link>
              <button type="button" className={buttonStyles("secondary")} onClick={() => setActiveView("capture")}>مساعد الالتقاط</button>
              <button type="button" className={buttonStyles("secondary")} onClick={() => setActiveView("intake")}>إضافة من الخرائط</button>
              <button type="button" className={buttonStyles("primary")} onClick={() => setInput(sampleMapsText)}>مثال تجريبي</button>
            </div>
          }
        />

        {error ? <p className="rounded-xl border border-enterprise-danger/30 bg-enterprise-danger/10 px-4 py-3 text-sm font-semibold text-enterprise-danger">{error}</p> : null}
        {message ? <p className="rounded-xl border border-enterprise-success/30 bg-enterprise-success/10 px-4 py-3 text-sm font-semibold text-enterprise-success">{message}</p> : null}

        <section className="overflow-hidden rounded-xl border border-enterprise-border bg-white shadow-panel">
          <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="bg-enterprise-primary px-5 py-6 text-white md:px-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-enterprise-secondary">خطة اليوم</p>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <h2 className="font-display text-4xl font-semibold tracking-tight text-white">{plan?.targetCalls ?? 0} مكالمة</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/72">{plan?.focus ?? "أضف بيانات مقاهٍ لتجهيز خطة اليوم."}</p>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">منطقة التركيز</p>
                  <p className="mt-2 font-display text-2xl font-semibold">{plan?.primaryArea ?? "كل المناطق"}</p>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">جاهز الآن</p>
                  <p className="mt-2 font-display text-2xl font-semibold">{plan?.readyNow ?? 0}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-enterprise-border md:grid-cols-4 xl:grid-cols-2">
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">متأخر</p>
                <p className="font-display mt-2 text-3xl font-semibold text-enterprise-text">{plan?.overdueFollowUps ?? 0}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">متابعات</p>
                <p className="font-display mt-2 text-3xl font-semibold text-enterprise-text">{plan?.dueFollowUps ?? 0}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">مواعيد</p>
                <p className="font-display mt-2 text-3xl font-semibold text-enterprise-text">{plan?.meetingsToday ?? 0}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">بيانات ناقصة</p>
                <p className="font-display mt-2 text-3xl font-semibold text-enterprise-text">{plan?.needsEnrichment ?? 0}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="مقاهٍ مستهدفة" value={counts.totalCafeLeads} helper={selectedArea ? `مفلتر حسب ${selectedArea}` : "سجل ترويج Ahwa"} />
          <StatCard label="جاهز للاتصال" value={counts.readyToCall} helper="لديه رقم صالح" tone="emerald" />
          <StatCard label="يحتاج رقم" value={counts.needsPhone} helper="تم الإدخال لكن البيانات ناقصة" tone="amber" />
          <StatCard label="تم التواصل" value={counts.contacted} helper="تمت محاولة التواصل" tone="sky" />
          <StatCard label="مواعيد" value={counts.meetings} helper="مرحلة عرض أو زيارة" tone="emerald" />
        </div>

        <Card title="حملات المناطق" description="اختر منطقة واحدة قبل بدء الاتصالات لتركيز القائمة عليها فقط.">
          <div className="flex gap-3 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedArea("")}
              className={`min-w-[11rem] rounded-xl border px-4 py-3 text-start transition ${!selectedArea ? "border-enterprise-secondary bg-enterprise-secondary text-white shadow-panel" : "border-enterprise-border bg-white hover:border-enterprise-primary"}`}
            >
              <p className="font-semibold">كل المناطق</p>
              <p className={`mt-1 text-xs ${!selectedArea ? "text-white/75" : "text-enterprise-muted"}`}>{overview?.globalCounts?.totalCafeLeads ?? counts.totalCafeLeads} عميل محتمل</p>
            </button>
            {(overview?.areaCampaigns ?? []).slice(0, 14).map((area) => (
              <AreaChip key={area.area} area={area} active={selectedArea === area.area} onClick={() => setSelectedArea(area.area)} />
            ))}
          </div>
        </Card>

        <div className="rounded-xl border border-enterprise-border bg-white p-2 shadow-panel">
          <div className="grid gap-2 md:grid-cols-5">
            {viewTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveView(tab.key)}
                className={`rounded-lg px-4 py-3 text-start transition ${activeView === tab.key ? "bg-enterprise-primary text-white" : "bg-enterprise-surface50 text-enterprise-text hover:bg-enterprise-surface"}`}
              >
                <span className="block font-semibold">{tab.label}</span>
                <span className={`mt-1 block text-xs ${activeView === tab.key ? "text-white/65" : "text-enterprise-muted"}`}>{tab.description}</span>
              </button>
            ))}
          </div>
        </div>

        {activeView === "command" ? (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <Card title="قائمة اتصال اليوم" description="مرتبة حسب الاستعجال، الدرجة، المتابعة المستحقة، وجاهزية البيانات.">
                {loading ? <p className="text-sm text-enterprise-muted">جارٍ تحميل قائمة الاتصال...</p> : overview?.callQueue.length ? (
                  <div className="space-y-3">
                    {overview.callQueue.map((contact) => (
                      <LeadCompactCard key={contact.id} contact={contact} selected={selectedContact?.id === contact.id} onSelect={() => setSelectedContactId(contact.id)} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="لا توجد فرص جاهزة" description="أضف بيانات من Google Maps أو أكمل الأرقام الناقصة قبل بدء المكالمات." action={<button type="button" onClick={() => setActiveView("intake")} className={buttonStyles("primary")}>إضافة فرص</button>} />
                )}
              </Card>

              {overview?.followUpDue?.length ? (
                <Card title="متابعات مستحقة" description="ابدأ بهذه المتابعات قبل المكالمات الجديدة.">
                  <div className="grid gap-3 md:grid-cols-2">
                    {overview.followUpDue.slice(0, 8).map((contact) => (
                      <LeadCompactCard key={contact.id} contact={contact} selected={selectedContact?.id === contact.id} onSelect={() => setSelectedContactId(contact.id)} />
                    ))}
                  </div>
                </Card>
              ) : null}
            </div>

            <ContactActionPanel contact={selectedContact} templates={overview?.templates ?? []} actioningContactId={actioningContactId} onOutcome={applyOutcome} />
          </div>
        ) : null}

        {activeView === "capture" ? (
          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-6">
              <Card title="مساعد التقاط Google Maps" description="افتح صفحة المقهى في Google Maps، التقط البيانات الظاهرة، ثم راجعها قبل الإدخال.">
                <div className="space-y-5">
                  <div className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
                    <p className="text-sm font-semibold text-enterprise-text">١. اسحب الزر إلى شريط المفضلة</p>
                    <p className="mt-1 text-xs leading-5 text-enterprise-muted">افتح أي مقهى في Google Maps ثم اضغط الزر. سيفتح الـ CRM والبيانات جاهزة للمراجعة.</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <a href={bookmarkletHref} className={buttonStyles("primary")} onClick={(event) => { if (!captureOrigin) event.preventDefault(); }}>حفظ في CRM</a>
                      <button type="button" className={buttonStyles("secondary")} onClick={() => navigator.clipboard?.writeText(bookmarkletHref)}>نسخ الزر</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-enterprise-border bg-white p-4">
                    <p className="text-sm font-semibold text-enterprise-text">٢. إدخال يدوي عند الحاجة</p>
                    <p className="mt-1 text-xs leading-5 text-enterprise-muted">إذا لم يعمل زر المفضلة، الصق نص Google Maps أو رابط المكان هنا.</p>
                    <Textarea value={captureJson} onChange={(event) => setCaptureJson(event.target.value)} placeholder="الصق نص المكان من Google Maps أو رابط maps.app.goo.gl أو بيانات الالتقاط..." className="mt-3 min-h-44 font-mono text-xs" />
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button type="button" className={buttonStyles("primary")} disabled={capturing || captureJson.trim().length < 3} onClick={() => void capturePayload()}>{capturing ? "جارٍ الالتقاط..." : "التقاط العميل"}</button>
                      <button type="button" className={buttonStyles("ghost")} onClick={() => setCaptureJson("")}>مسح</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-enterprise-border bg-enterprise-primary p-4 text-white">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-enterprise-secondary">طريقة العمل</p>
                    <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm leading-6 text-white/75">
                      <li>ابحث عن المقاهي في Google Maps حسب المنطقة.</li>
                      <li>افتح صفحة المكان واضغط حفظ في CRM.</li>
                      <li>راجع التكرارات والرقم والمنطقة والعنوان.</li>
                      <li>أدخل العملاء المحددين إلى قائمة الاتصال.</li>
                    </ol>
                  </div>
                </div>
              </Card>
            </div>

            <Card
              title="قائمة مراجعة الالتقاط"
              description="لا يتم إدخال الأماكن الملتقطة إلا بعد موافقتك. تظهر التكرارات المحتملة قبل الإدخال."
              actions={parsedLeads.length ? <button type="button" disabled={!selectedParsedLeads.length || importing} onClick={() => void importSelected()} className={buttonStyles("primary")}>{importing ? "جارٍ الإدخال..." : `إدخال المحدد (${selectedParsedLeads.length})`}</button> : null}
            >
              {parsedLeads.length ? (
                <div className="space-y-3">
                  {parsedLeads.map((lead) => {
                    const selected = selectedLeadIds.includes(lead.id);
                    const duplicateCount = lead.duplicateCandidates?.length ?? 0;
                    return (
                      <div key={lead.id} className={`rounded-xl border p-4 shadow-sm ${duplicateCount ? "border-enterprise-warning/40 bg-enterprise-warning/5" : "border-enterprise-border bg-white"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <label className="flex items-center gap-3 text-sm font-semibold text-enterprise-text">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => setSelectedLeadIds((current) => event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id))}
                              className="h-4 w-4 rounded border-enterprise-border text-enterprise-secondary"
                            />
                            <span>{lead.name}</span>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Badge tone={toneForConfidence(lead.confidence)}>{lead.confidence}</Badge>
                            <Badge tone="sky">{lead.score}/100</Badge>
                            <Badge tone={duplicateTone(duplicateCount)}>{duplicateCount ? `${duplicateCount} خطر تكرار` : "عميل جديد"}</Badge>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <FieldShell label="اسم المقهى"><Input value={lead.name} onChange={(event) => updateLead(lead.id, { name: event.target.value })} /></FieldShell>
                          <FieldShell label="الهاتف">
                            <Input value={lead.phone ?? ""} onChange={(event) => updateLead(lead.id, { phone: event.target.value || null })} placeholder="010..." className="force-ltr" dir="ltr" />
                            {lead.phoneCandidates?.filter((phone) => phone !== lead.phone).length ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {lead.phoneCandidates.filter((phone) => phone !== lead.phone).slice(0, 4).map((phone) => (
                                  <button key={phone} type="button" onClick={() => updateLead(lead.id, { phone })} className="force-ltr rounded-full bg-enterprise-surface px-2 py-1 text-[0.68rem] font-bold text-enterprise-primary shadow-insetSoft">{phone}</button>
                                ))}
                              </div>
                            ) : null}
                          </FieldShell>
                          <FieldShell label="المنطقة"><Input value={lead.area ?? ""} onChange={(event) => updateLead(lead.id, { area: event.target.value || null })} /></FieldShell>
                          <FieldShell label="المدينة"><Input value={lead.city ?? ""} onChange={(event) => updateLead(lead.id, { city: event.target.value || null })} placeholder="القاهرة / الجيزة" /></FieldShell>
                          <FieldShell label="المصدر"><Input value={lead.source} onChange={(event) => updateLead(lead.id, { source: event.target.value })} /></FieldShell>
                          <FieldShell label="الإحداثيات"><Input value={lead.coordinates ?? ""} onChange={(event) => updateLead(lead.id, { coordinates: event.target.value || null })} placeholder="30.000000, 31.000000" className="force-ltr" dir="ltr" /></FieldShell>
                          <div className="md:col-span-2"><FieldShell label="العنوان المقروء"><Input value={lead.address ?? ""} onChange={(event) => updateLead(lead.id, { address: event.target.value || null })} placeholder="شارع المساحة، الدقي، الجيزة" /></FieldShell></div>
                          <div className="md:col-span-2"><FieldShell label="رابط الخريطة"><Input value={lead.mapUrl ?? ""} onChange={(event) => updateLead(lead.id, { mapUrl: event.target.value || null })} className="force-ltr" dir="ltr" /></FieldShell></div>
                        </div>
                        {duplicateCount ? (
                          <div className="mt-4 rounded-lg border border-enterprise-warning/30 bg-white p-3">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-warning">تكرارات محتملة</p>
                            <div className="mt-2 space-y-2">
                              {lead.duplicateCandidates?.map((candidate) => (
                                <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-enterprise-surface50 px-3 py-2 text-xs">
                                  <span className="font-semibold text-enterprise-text">{candidate.fullName} · {candidate.area || "كل المناطق"}</span>
                                  <span className="text-enterprise-muted">{candidate.reason} · {candidate.score}%</span>
                                  <Link href={`/contacts/view?id=${candidate.id}` as Route} className="font-semibold text-enterprise-primary">فتح</Link>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {lead.warnings.length ? <p className="mt-3 text-xs font-semibold text-enterprise-warning">{lead.warnings.join(" · ")}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="لا توجد أماكن ملتقطة" description="استخدم زر حفظ في CRM من Google Maps أو الصق نص المكان هنا." />
              )}
            </Card>
          </div>
        ) : null}

        {activeView === "intake" ? (
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card title="إدخال من Google Maps" description="الصق بطاقة أو عدة بطاقات من Google Maps لاستخراج الاسم والرقم والمنطقة والعنوان والرابط.">
              <div className="space-y-4">
                <FieldShell label="المنطقة المستهدفة" hint="اختياري. يستخدم عندما لا يحتوي النص المنسوخ على منطقة واضحة.">
                  <Input value={defaultArea} onChange={(event) => setDefaultArea(event.target.value)} placeholder="الدقي، المعادي، مدينة نصر..." />
                </FieldShell>
                <FieldShell label="بطاقات أو روابط Google Maps">
                  <Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="الصق نتائج Google Maps المنسوخة هنا..." className="min-h-72 font-mono text-xs" />
                </FieldShell>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => void parseInput()} disabled={parsing || input.trim().length < 3} className={buttonStyles("primary")}>{parsing ? "جارٍ التحليل..." : "تحليل العملاء"}</button>
                  <button type="button" onClick={() => { setInput(""); setParsedLeads([]); setSelectedLeadIds([]); }} className={buttonStyles("ghost")}>مسح</button>
                </div>
              </div>
            </Card>

            <Card
              title="مراجعة الإدخال"
              description="أدخل العناصر المحددة فقط. العناصر بلا رقم تبقى في قائمة الإكمال."
              actions={parsedLeads.length ? <button type="button" disabled={!selectedParsedLeads.length || importing} onClick={() => void importSelected()} className={buttonStyles("primary")}>{importing ? "جارٍ الإدخال..." : `إدخال المحدد (${selectedParsedLeads.length})`}</button> : null}
            >
              {parsedLeads.length ? (
                <div className="space-y-3">
                  {parsedLeads.map((lead) => {
                    const selected = selectedLeadIds.includes(lead.id);
                    return (
                      <div key={lead.id} className="rounded-xl border border-enterprise-border bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <label className="flex items-center gap-3 text-sm font-semibold text-enterprise-text">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => setSelectedLeadIds((current) => event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id))}
                              className="h-4 w-4 rounded border-enterprise-border text-enterprise-secondary"
                            />
                            <span>{lead.name}</span>
                          </label>
                          <div className="flex gap-2">
                            <Badge tone={toneForConfidence(lead.confidence)}>{lead.confidence}</Badge>
                            <Badge tone="sky">{lead.score}/100</Badge>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <FieldShell label="الاسم"><Input value={lead.name} onChange={(event) => updateLead(lead.id, { name: event.target.value })} /></FieldShell>
                          <FieldShell label="الهاتف">
                            <Input value={lead.phone ?? ""} onChange={(event) => updateLead(lead.id, { phone: event.target.value || null })} placeholder="010..." className="force-ltr" dir="ltr" />
                            {lead.phoneCandidates?.filter((phone) => phone !== lead.phone).length ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {lead.phoneCandidates.filter((phone) => phone !== lead.phone).slice(0, 4).map((phone) => (
                                  <button key={phone} type="button" onClick={() => updateLead(lead.id, { phone })} className="force-ltr rounded-full bg-enterprise-surface px-2 py-1 text-[0.68rem] font-bold text-enterprise-primary shadow-insetSoft">{phone}</button>
                                ))}
                              </div>
                            ) : null}
                          </FieldShell>
                          <FieldShell label="المنطقة"><Input value={lead.area ?? ""} onChange={(event) => updateLead(lead.id, { area: event.target.value || null })} /></FieldShell>
                          <FieldShell label="المدينة"><Input value={lead.city ?? ""} onChange={(event) => updateLead(lead.id, { city: event.target.value || null })} placeholder="القاهرة / الجيزة" /></FieldShell>
                          <FieldShell label="المصدر"><Input value={lead.source} onChange={(event) => updateLead(lead.id, { source: event.target.value })} /></FieldShell>
                          <FieldShell label="الإحداثيات"><Input value={lead.coordinates ?? ""} onChange={(event) => updateLead(lead.id, { coordinates: event.target.value || null })} placeholder="30.000000, 31.000000" className="force-ltr" dir="ltr" /></FieldShell>
                          <div className="md:col-span-2"><FieldShell label="العنوان المقروء"><Input value={lead.address ?? ""} onChange={(event) => updateLead(lead.id, { address: event.target.value || null })} placeholder="شارع المساحة، الدقي، الجيزة" /></FieldShell></div>
                          <div className="md:col-span-2"><FieldShell label="رابط الخريطة"><Input value={lead.mapUrl ?? ""} onChange={(event) => updateLead(lead.id, { mapUrl: event.target.value || null })} className="force-ltr" dir="ltr" /></FieldShell></div>
                        </div>
                        {lead.warnings.length ? <p className="mt-3 text-xs font-semibold text-enterprise-warning">{lead.warnings.join(" · ")}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="لا توجد نتائج بعد" description="الصق بطاقات Google Maps، حللها، ثم راجعها قبل الإدخال." />
              )}
            </Card>
          </div>
        ) : null}

        {activeView === "enrichment" ? (
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card title="بيانات تحتاج إكمال" description="مقاهٍ مفيدة لكنها تحتاج رقمًا أو منطقة أو عنوانًا أوضح قبل الاتصال.">
              {overview?.needsPhone.length ? (
                <div className="space-y-3">
                  {overview.needsPhone.map((contact) => (
                    <LeadCompactCard key={contact.id} contact={contact} selected={selectedContact?.id === contact.id} onSelect={() => setSelectedContactId(contact.id)} />
                  ))}
                </div>
              ) : (
                <EmptyState title="لا توجد بيانات ناقصة" description="كل المقاهي المستوردة في هذه القائمة لديها أرقام قابلة للاستخدام." />
              )}
            </Card>
            <Card title="تغطية المناطق" description="استخدمها لتحديد هل تحتاج إدخال مقاهٍ أكثر، الاتصال، أو إكمال البيانات لكل منطقة.">
              {overview?.areaCampaigns.length ? (
                <div className="space-y-3">
                  {overview.areaCampaigns.map((area) => (
                    <div key={area.area} className="rounded-xl border border-enterprise-border bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-display text-xl font-semibold text-enterprise-text">{area.area}</p>
                          <p className="text-sm text-enterprise-muted">{area.called}/{area.total} contacted · {area.readyToCall} ready · {area.needsPhone} need phone</p>
                        </div>
                        <Badge tone={toneForPriority(area.priority)}>{area.priority ?? "LOW"}</Badge>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-enterprise-surface">
                        <div className="h-full bg-enterprise-secondary" style={{ width: progressWidth(area.coverage ?? 0) }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="لا توجد حملات مناطق بعد" description="أدخل مقاهي تحتوي على منطقة حتى تظهر الحملات." />
              )}
            </Card>
          </div>
        ) : null}

        {activeView === "scripts" ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {(overview?.templates ?? []).map((template) => (
              <Card key={template.key} title={template.title} description="قالب واتساب يدوي بدون API مدفوع.">
                <p className="min-h-28 rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4 text-sm leading-7 text-enterprise-text">{template.body}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {template.url ? <a href={template.url} target="_blank" rel="noreferrer" className={buttonStyles("primary")}>فتح واتساب</a> : null}
                  <button type="button" onClick={() => navigator.clipboard?.writeText(template.body)} className={buttonStyles("secondary")}>نسخ النص</button>
                </div>
              </Card>
            ))}
          </div>
        ) : null}

        {importResults.length ? (
          <Card title="آخر نتيجة إدخال" description="العملاء الذين تم إنشاؤهم يظهرون مباشرة في قائمة الاتصال.">
            <div className="space-y-2">
              {importResults.map((result, index) => (
                <div key={`${result.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-enterprise-border bg-enterprise-surface50 px-4 py-3 text-sm">
                  <span className="font-semibold text-enterprise-text">{result.name}</span>
                  <span className={result.status === "CREATED" ? "text-enterprise-success" : "text-enterprise-warning"}>{result.status}{result.reason ? ` · ${result.reason}` : ""}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
