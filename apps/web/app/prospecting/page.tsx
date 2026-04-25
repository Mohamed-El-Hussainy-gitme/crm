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
  normalizedPhone: string | null;
  area: string | null;
  address: string | null;
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
  { key: "command", label: "Command", description: "Call queue and next action" },
  { key: "capture", label: "Capture", description: "Save places from Google Maps" },
  { key: "intake", label: "Maps intake", description: "Paste and import leads" },
  { key: "enrichment", label: "Enrichment", description: "Missing phones and areas" },
  { key: "scripts", label: "Scripts", description: "WhatsApp messages" },
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
    address: lead.address || undefined,
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
    "const phone=(text.match(/(?:\\+?20|0020|0)?1[0125][\\s\\d().-]{8,16}/)||[''])[0];",
    "const address=clean(Array.from(document.querySelectorAll('[data-item-id*=address],button[aria-label^=\\\"Address:\\\"],button[aria-label^=\\\"العنوان\\\"]')).map(e=>(e.getAttribute('aria-label')||e.textContent||'').replace(/^Address:\\s*/i,'').replace(/^العنوان:?\\s*/, '')).find(Boolean)||'');",
    "const website=Array.from(document.querySelectorAll('a[href^=\\\"http\\\"]')).map(a=>a.href).find(h=>!/(google|gstatic|ggpht|schema)/i.test(h))||'';",
    "const payload={name:h1,title:document.title,phone,address,website,pageUrl:location.href,rawText:text,capturedAt:new Date().toISOString(),source:'Google Maps Capture'};",
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
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-enterprise-muted">score</p>
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
      <Card title="Lead command panel" description="Select a lead from the queue to see call actions, scripts, and next-step controls.">
        <EmptyState title="No active lead" description="Import leads or select a campaign area with ready-to-call cafés." />
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
      title="Lead command panel"
      description="Use this panel during the call. Every outcome updates the CRM and creates the next action."
      actions={<Badge tone={toneForAction(contact.recommendedAction)}>{contact.recommendedAction?.label ?? "Call now"}</Badge>}
      className="xl:sticky xl:top-24"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-enterprise-primary/20 bg-enterprise-primary p-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-enterprise-secondary">Active cafe</p>
              <h2 className="font-display mt-2 text-3xl font-semibold tracking-tight text-white">{contact.fullName}</h2>
              <p className="mt-2 text-sm leading-6 text-white/72">{contact.area || "Unassigned area"} · {contact.stage}</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-center">
              <p className="font-display text-4xl font-semibold">{contact.score}</p>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-white/60">score</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {contact.callUrl ? <a href={contact.callUrl} className={buttonStyles("primary", "sm", true)}>Call</a> : <span className={buttonStyles("ghost", "sm", true)}>No phone</span>}
            {contact.whatsappUrl ? <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className={buttonStyles("secondary", "sm", true)}>WhatsApp</a> : null}
            {contact.mapUrl ? <a href={contact.mapUrl} target="_blank" rel="noreferrer" className={buttonStyles("secondary", "sm", true)}>Maps</a> : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Next task</p>
            <p className="mt-2 font-semibold text-enterprise-text">{contact.nextTaskDueAt ? formatDateTime(contact.nextTaskDueAt) : "No pending task"}</p>
          </div>
          <div className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Last touch</p>
            <p className="mt-2 font-semibold text-enterprise-text">{contact.lastContactedAt ? formatDateTime(contact.lastContactedAt) : "Never contacted"}</p>
          </div>
        </div>

        {scoreParts.length ? (
          <div className="rounded-xl border border-enterprise-border bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Why this priority</p>
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
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Call outcome</p>
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
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Suggested script</p>
          <p className="mt-3 text-sm leading-7 text-enterprise-text">{script?.body ?? "السلام عليكم، أنا محمد من Ahwa. ينفع أحدد مع المسؤول 10 دقايق أعرض السيستم؟"}</p>
          {script?.url || contact.whatsappUrl ? (
            <a href={script?.url ?? contact.whatsappUrl ?? "#"} target="_blank" rel="noreferrer" className={`${buttonStyles("secondary", "sm")} mt-4`}>Open WhatsApp script</a>
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
          eyebrow="Ahwa acquisition"
          title="Daily sales command center"
          description="A backend-driven workflow for finding cafes, prioritizing calls, recording outcomes, and preparing the next action without paid Google Maps APIs."
          actions={
            <div className="flex flex-wrap gap-3">
              <Link href={"/pipeline" as Route} className={buttonStyles("secondary")}>Demo pipeline</Link>
              <button type="button" className={buttonStyles("secondary")} onClick={() => setActiveView("capture")}>Capture assistant</button>
              <button type="button" className={buttonStyles("secondary")} onClick={() => setActiveView("intake")}>Add Maps leads</button>
              <button type="button" className={buttonStyles("primary")} onClick={() => setInput(sampleMapsText)}>Load sample intake</button>
            </div>
          }
        />

        {error ? <p className="rounded-xl border border-enterprise-danger/30 bg-enterprise-danger/10 px-4 py-3 text-sm font-semibold text-enterprise-danger">{error}</p> : null}
        {message ? <p className="rounded-xl border border-enterprise-success/30 bg-enterprise-success/10 px-4 py-3 text-sm font-semibold text-enterprise-success">{message}</p> : null}

        <section className="overflow-hidden rounded-xl border border-enterprise-border bg-white shadow-panel">
          <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="bg-enterprise-primary px-5 py-6 text-white md:px-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-enterprise-secondary">Today operating plan</p>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <h2 className="font-display text-4xl font-semibold tracking-tight text-white">{plan?.targetCalls ?? 0} calls</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/72">{plan?.focus ?? "Load prospecting data to generate today's workflow."}</p>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Focus area</p>
                  <p className="mt-2 font-display text-2xl font-semibold">{plan?.primaryArea ?? "No area"}</p>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Ready now</p>
                  <p className="mt-2 font-display text-2xl font-semibold">{plan?.readyNow ?? 0}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-enterprise-border md:grid-cols-4 xl:grid-cols-2">
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Overdue</p>
                <p className="font-display mt-2 text-3xl font-semibold text-enterprise-text">{plan?.overdueFollowUps ?? 0}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Follow-ups</p>
                <p className="font-display mt-2 text-3xl font-semibold text-enterprise-text">{plan?.dueFollowUps ?? 0}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Meetings</p>
                <p className="font-display mt-2 text-3xl font-semibold text-enterprise-text">{plan?.meetingsToday ?? 0}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-muted">Need data</p>
                <p className="font-display mt-2 text-3xl font-semibold text-enterprise-text">{plan?.needsEnrichment ?? 0}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Cafe leads" value={counts.totalCafeLeads} helper={selectedArea ? `Filtered by ${selectedArea}` : "Ahwa acquisition records"} />
          <StatCard label="Ready to call" value={counts.readyToCall} helper="Has a usable phone" tone="emerald" />
          <StatCard label="Needs phone" value={counts.needsPhone} helper="Imported but incomplete" tone="amber" />
          <StatCard label="Contacted" value={counts.contacted} helper="At least one touch" tone="sky" />
          <StatCard label="Meetings" value={counts.meetings} helper="Demo / visit stage" tone="emerald" />
        </div>

        <Card title="Area campaigns" description="Choose a territory before starting calls. The command center will recalculate the queue for that area only.">
          <div className="flex gap-3 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedArea("")}
              className={`min-w-[11rem] rounded-xl border px-4 py-3 text-start transition ${!selectedArea ? "border-enterprise-secondary bg-enterprise-secondary text-white shadow-panel" : "border-enterprise-border bg-white hover:border-enterprise-primary"}`}
            >
              <p className="font-semibold">All areas</p>
              <p className={`mt-1 text-xs ${!selectedArea ? "text-white/75" : "text-enterprise-muted"}`}>{overview?.globalCounts?.totalCafeLeads ?? counts.totalCafeLeads} total leads</p>
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
              <Card title="Today call queue" description="Sorted by urgency, score, due follow-up, and campaign readiness.">
                {loading ? <p className="text-sm text-enterprise-muted">Loading call queue...</p> : overview?.callQueue.length ? (
                  <div className="space-y-3">
                    {overview.callQueue.map((contact) => (
                      <LeadCompactCard key={contact.id} contact={contact} selected={selectedContact?.id === contact.id} onSelect={() => setSelectedContactId(contact.id)} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No ready leads" description="Import Google Maps leads or enrich phone numbers before starting today's call block." action={<button type="button" onClick={() => setActiveView("intake")} className={buttonStyles("primary")}>Add leads</button>} />
                )}
              </Card>

              {overview?.followUpDue?.length ? (
                <Card title="Due follow-ups" description="These leads have an overdue or today task. Handle them before cold calls.">
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
              <Card title="Google Maps Capture Assistant" description="Use this when a cafe page is open in Google Maps. It reads visible page text in your browser and sends a review payload to this CRM. No Google API key is required.">
                <div className="space-y-5">
                  <div className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
                    <p className="text-sm font-semibold text-enterprise-text">1. Drag this button to your bookmarks bar</p>
                    <p className="mt-1 text-xs leading-5 text-enterprise-muted">Then open any Google Maps cafe page and click the bookmark. The CRM will open with a captured lead ready for review.</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <a href={bookmarkletHref} className={buttonStyles("primary")} onClick={(event) => { if (!captureOrigin) event.preventDefault(); }}>Save to CRM</a>
                      <button type="button" className={buttonStyles("secondary")} onClick={() => navigator.clipboard?.writeText(bookmarkletHref)}>Copy bookmarklet</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-enterprise-border bg-white p-4">
                    <p className="text-sm font-semibold text-enterprise-text">2. Manual fallback</p>
                    <p className="mt-1 text-xs leading-5 text-enterprise-muted">If bookmarklets are blocked, paste copied Google Maps text, a Maps URL, or the JSON payload here.</p>
                    <Textarea value={captureJson} onChange={(event) => setCaptureJson(event.target.value)} placeholder="Paste Google Maps visible text, a maps.app.goo.gl link, or captured JSON..." className="mt-3 min-h-44 font-mono text-xs" />
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button type="button" className={buttonStyles("primary")} disabled={capturing || captureJson.trim().length < 3} onClick={() => void capturePayload()}>{capturing ? "Capturing..." : "Capture lead"}</button>
                      <button type="button" className={buttonStyles("ghost")} onClick={() => setCaptureJson("")}>Clear</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-enterprise-border bg-enterprise-primary p-4 text-white">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-enterprise-secondary">Workflow</p>
                    <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm leading-6 text-white/75">
                      <li>Search cafes in Google Maps by area.</li>
                      <li>Open a place profile and click Save to CRM.</li>
                      <li>Review duplicate warnings, phone, area, and address.</li>
                      <li>Import selected leads into the call queue.</li>
                    </ol>
                  </div>
                </div>
              </Card>
            </div>

            <Card
              title="Capture review queue"
              description="Captured places are not inserted until you approve them. Possible duplicates are shown before import."
              actions={parsedLeads.length ? <button type="button" disabled={!selectedParsedLeads.length || importing} onClick={() => void importSelected()} className={buttonStyles("primary")}>{importing ? "Importing..." : `Import selected (${selectedParsedLeads.length})`}</button> : null}
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
                            <Badge tone={duplicateTone(duplicateCount)}>{duplicateCount ? `${duplicateCount} duplicate risk` : "new lead"}</Badge>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <FieldShell label="Cafe name"><Input value={lead.name} onChange={(event) => updateLead(lead.id, { name: event.target.value })} /></FieldShell>
                          <FieldShell label="Phone"><Input value={lead.phone ?? ""} onChange={(event) => updateLead(lead.id, { phone: event.target.value || null })} placeholder="010..." /></FieldShell>
                          <FieldShell label="Area"><Input value={lead.area ?? ""} onChange={(event) => updateLead(lead.id, { area: event.target.value || null })} /></FieldShell>
                          <FieldShell label="Source"><Input value={lead.source} onChange={(event) => updateLead(lead.id, { source: event.target.value })} /></FieldShell>
                          <div className="md:col-span-2"><FieldShell label="Address"><Input value={lead.address ?? ""} onChange={(event) => updateLead(lead.id, { address: event.target.value || null })} /></FieldShell></div>
                          <div className="md:col-span-2"><FieldShell label="Maps URL"><Input value={lead.mapUrl ?? ""} onChange={(event) => updateLead(lead.id, { mapUrl: event.target.value || null })} /></FieldShell></div>
                        </div>
                        {duplicateCount ? (
                          <div className="mt-4 rounded-lg border border-enterprise-warning/30 bg-white p-3">
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-enterprise-warning">Possible duplicates</p>
                            <div className="mt-2 space-y-2">
                              {lead.duplicateCandidates?.map((candidate) => (
                                <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-enterprise-surface50 px-3 py-2 text-xs">
                                  <span className="font-semibold text-enterprise-text">{candidate.fullName} · {candidate.area || "No area"}</span>
                                  <span className="text-enterprise-muted">{candidate.reason} · {candidate.score}%</span>
                                  <Link href={`/contacts/view?id=${candidate.id}` as Route} className="font-semibold text-enterprise-primary">Open</Link>
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
                <EmptyState title="No captured places yet" description="Use the Save to CRM bookmarklet on Google Maps, or paste a Maps payload in the assistant." />
              )}
            </Card>
          </div>
        ) : null}

        {activeView === "intake" ? (
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card title="Google Maps intake" description="Paste one or many Google Maps cards. The backend extracts cafe name, phone, area, address, and map URL using deterministic heuristics only.">
              <div className="space-y-4">
                <FieldShell label="Target area" hint="Optional. Used when copied Maps text does not contain a clear district.">
                  <Input value={defaultArea} onChange={(event) => setDefaultArea(event.target.value)} placeholder="Nasr City, Maadi, Dokki..." />
                </FieldShell>
                <FieldShell label="Google Maps cards or links">
                  <Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste copied Google Maps results here..." className="min-h-72 font-mono text-xs" />
                </FieldShell>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => void parseInput()} disabled={parsing || input.trim().length < 3} className={buttonStyles("primary")}>{parsing ? "Parsing..." : "Parse leads"}</button>
                  <button type="button" onClick={() => { setInput(""); setParsedLeads([]); setSelectedLeadIds([]); }} className={buttonStyles("ghost")}>Clear</button>
                </div>
              </div>
            </Card>

            <Card
              title="Review import queue"
              description="Import only selected leads. Missing-phone leads are kept as enrichment tasks, not discarded."
              actions={parsedLeads.length ? <button type="button" disabled={!selectedParsedLeads.length || importing} onClick={() => void importSelected()} className={buttonStyles("primary")}>{importing ? "Importing..." : `Import selected (${selectedParsedLeads.length})`}</button> : null}
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
                          <FieldShell label="Name"><Input value={lead.name} onChange={(event) => updateLead(lead.id, { name: event.target.value })} /></FieldShell>
                          <FieldShell label="Phone"><Input value={lead.phone ?? ""} onChange={(event) => updateLead(lead.id, { phone: event.target.value || null })} placeholder="010..." /></FieldShell>
                          <FieldShell label="Area"><Input value={lead.area ?? ""} onChange={(event) => updateLead(lead.id, { area: event.target.value || null })} /></FieldShell>
                          <FieldShell label="Source"><Input value={lead.source} onChange={(event) => updateLead(lead.id, { source: event.target.value })} /></FieldShell>
                          <div className="md:col-span-2"><FieldShell label="Address"><Input value={lead.address ?? ""} onChange={(event) => updateLead(lead.id, { address: event.target.value || null })} /></FieldShell></div>
                          <div className="md:col-span-2"><FieldShell label="Maps URL"><Input value={lead.mapUrl ?? ""} onChange={(event) => updateLead(lead.id, { mapUrl: event.target.value || null })} /></FieldShell></div>
                        </div>
                        {lead.warnings.length ? <p className="mt-3 text-xs font-semibold text-enterprise-warning">{lead.warnings.join(" · ")}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No parsed leads" description="Paste Google Maps cards, parse them, then review before import." />
              )}
            </Card>
          </div>
        ) : null}

        {activeView === "enrichment" ? (
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card title="Needs enrichment" description="These cafes are useful for territory coverage but need a phone number before calling.">
              {overview?.needsPhone.length ? (
                <div className="space-y-3">
                  {overview.needsPhone.map((contact) => (
                    <LeadCompactCard key={contact.id} contact={contact} selected={selectedContact?.id === contact.id} onSelect={() => setSelectedContactId(contact.id)} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No enrichment backlog" description="All imported Ahwa leads in this view have usable phone numbers." />
              )}
            </Card>
            <Card title="Campaign coverage" description="Use this to decide whether to import more leads, call, or enrich data per territory.">
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
                <EmptyState title="No area campaigns yet" description="Import cafe leads with area data to generate campaigns." />
              )}
            </Card>
          </div>
        ) : null}

        {activeView === "scripts" ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {(overview?.templates ?? []).map((template) => (
              <Card key={template.key} title={template.title} description="Manual WhatsApp template. No paid API required.">
                <p className="min-h-28 rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4 text-sm leading-7 text-enterprise-text">{template.body}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {template.url ? <a href={template.url} target="_blank" rel="noreferrer" className={buttonStyles("primary")}>Open WhatsApp</a> : null}
                  <button type="button" onClick={() => navigator.clipboard?.writeText(template.body)} className={buttonStyles("secondary")}>Copy text</button>
                </div>
              </Card>
            ))}
          </div>
        ) : null}

        {importResults.length ? (
          <Card title="Last import result" description="Created leads are immediately available in the command queue.">
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
