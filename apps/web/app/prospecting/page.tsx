"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { buttonStyles, FieldShell, Input, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/api";

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
  priority: "HIGH" | "MEDIUM" | "LOW";
  callUrl: string | null;
  whatsappUrl: string | null;
  pendingTasks?: number;
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
};

type Template = {
  key: string;
  title: string;
  body: string;
  url: string | null;
};

type Overview = {
  counts: {
    totalCafeLeads: number;
    readyToCall: number;
    needsPhone: number;
    contacted: number;
    meetings: number;
  };
  callQueue: ProspectingContact[];
  needsPhone: ProspectingContact[];
  areaCampaigns: AreaCampaign[];
  templates: Template[];
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

const quickOutcomes: Array<{ key: string; label: string; tone: "emerald" | "amber" | "rose" | "sky" }> = [
  { key: "NO_ANSWER", label: "No answer", tone: "amber" },
  { key: "INTERESTED", label: "Interested", tone: "emerald" },
  { key: "NEEDS_OWNER", label: "Needs owner", tone: "sky" },
  { key: "MEETING_BOOKED", label: "Meeting booked", tone: "emerald" },
  { key: "REJECTED", label: "Rejected", tone: "rose" },
];

function addDaysIso(days: number, hour = 12) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
}

function toneForPriority(priority: ProspectingContact["priority"]): "emerald" | "amber" | "slate" {
  if (priority === "HIGH") return "emerald";
  if (priority === "MEDIUM") return "amber";
  return "slate";
}

function toneForConfidence(confidence: ParsedLead["confidence"]): "emerald" | "amber" | "slate" {
  if (confidence === "HIGH") return "emerald";
  if (confidence === "MEDIUM") return "amber";
  return "slate";
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

export default function ProspectingPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [input, setInput] = useState("");
  const [defaultArea, setDefaultArea] = useState("");
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [actioningContactId, setActioningContactId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      const data = await apiFetch<Overview>("/acquisition/overview");
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Ahwa prospecting console");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedParsedLeads = useMemo(
    () => parsedLeads.filter((lead) => selectedLeadIds.includes(lead.id)),
    [parsedLeads, selectedLeadIds],
  );

  const parseInput = async () => {
    try {
      setError("");
      setMessage("");
      setImportResults([]);
      setParsing(true);
      const data = await apiFetch<{ leads: ParsedLead[]; summary: { detected: number } }>("/acquisition/parse", {
        method: "POST",
        body: JSON.stringify({ input, defaultArea: defaultArea || undefined, defaultSource: "Google Maps" }),
      });
      setParsedLeads(data.leads);
      setSelectedLeadIds(data.leads.map((lead) => lead.id));
      setMessage(`Detected ${data.leads.length} café lead${data.leads.length === 1 ? "" : "s"}. Review before importing.`);
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
          summary: `${outcome.replace(/_/g, " ")} from Ahwa prospecting console.`,
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

  const counts = overview?.counts ?? { totalCafeLeads: 0, readyToCall: 0, needsPhone: 0, contacted: 0, meetings: 0 };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Ahwa acquisition"
          title="Cafe prospecting console"
          description="Turn copied Google Maps results into café leads, prioritized call queues, WhatsApp scripts, and automatic follow-up actions without paid map APIs."
          actions={
            <div className="flex flex-wrap gap-3">
              <Link href="/contacts" className={buttonStyles("secondary")}>Open contacts</Link>
              <button type="button" className={buttonStyles("primary")} onClick={() => setInput(sampleMapsText)}>Load sample intake</button>
            </div>
          }
        />

        {error ? <p className="rounded-xl border border-enterprise-danger/30 bg-enterprise-danger/10 px-4 py-3 text-sm font-semibold text-enterprise-danger">{error}</p> : null}
        {message ? <p className="rounded-xl border border-enterprise-success/30 bg-enterprise-success/10 px-4 py-3 text-sm font-semibold text-enterprise-success">{message}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Cafe leads" value={counts.totalCafeLeads} helper="Tagged Ahwa acquisition records" />
          <StatCard label="Ready to call" value={counts.readyToCall} helper="Has a usable phone" tone="emerald" />
          <StatCard label="Needs phone" value={counts.needsPhone} helper="Imported but missing phone" tone="amber" />
          <StatCard label="Contacted" value={counts.contacted} helper="At least one touch logged" tone="sky" />
          <StatCard label="Meetings" value={counts.meetings} helper="Demo / visit stage" tone="emerald" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card title="Google Maps intake" description="Paste one or many Google Maps cards. The backend extracts café name, phone, area, address, and map URL using heuristics only.">
            <div className="space-y-4">
              <FieldShell label="Target area" hint="Optional. Useful when the copied Maps text does not include a clear district.">
                <Input value={defaultArea} onChange={(event) => setDefaultArea(event.target.value)} placeholder="Nasr City, Maadi, Dokki..." />
              </FieldShell>
              <FieldShell label="Google Maps cards or links">
                <Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste copied Google Maps results here..." className="min-h-56 font-mono text-xs" />
              </FieldShell>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void parseInput()} disabled={parsing || input.trim().length < 3} className={buttonStyles("primary")}>
                  {parsing ? "Parsing..." : "Parse leads"}
                </button>
                <button type="button" onClick={() => { setInput(""); setParsedLeads([]); setSelectedLeadIds([]); }} className={buttonStyles("ghost")}>
                  Clear
                </button>
              </div>
            </div>
          </Card>

          <Card title="Area campaigns" description="Campaigns are generated from lead areas. No extra database tables required.">
            {loading ? <p className="text-sm text-enterprise-muted">Loading campaigns...</p> : overview?.areaCampaigns.length ? (
              <div className="space-y-3">
                {overview.areaCampaigns.slice(0, 8).map((area) => (
                  <div key={area.area} className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-display text-lg font-semibold text-enterprise-text">{area.area}</p>
                        <p className="text-sm text-enterprise-muted">{area.called}/{area.total} contacted · {area.readyToCall} ready · {area.needsPhone} need phone</p>
                      </div>
                      <Badge tone={area.meetings ? "emerald" : "slate"}>{area.meetings} meetings</Badge>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full bg-enterprise-secondary" style={{ width: `${Math.min(100, Math.round((area.called / Math.max(1, area.total)) * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No area campaigns yet" description="Import café leads with an area to start campaign coverage tracking." />
            )}
          </Card>
        </div>

        {parsedLeads.length ? (
          <Card
            title="Review import queue"
            description="Import selected leads. Missing-phone leads are allowed and tagged as needs-phone so they do not block area research."
            actions={<button type="button" disabled={!selectedParsedLeads.length || importing} onClick={() => void importSelected()} className={buttonStyles("primary")}>{importing ? "Importing..." : `Import selected (${selectedParsedLeads.length})`}</button>}
          >
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
          </Card>
        ) : null}

        {importResults.length ? (
          <Card title="Last import result" description="Created leads are immediately available in contacts and call queue.">
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

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card title="Today’s call queue" description="Prioritized café leads. Each outcome updates the stage, writes a call log, and creates the next follow-up automatically.">
            {overview?.callQueue.length ? (
              <div className="space-y-3">
                {overview.callQueue.map((contact) => (
                  <div key={contact.id} className="rounded-xl border border-enterprise-border bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/contacts/view?id=${contact.id}`} className="font-display text-xl font-semibold text-enterprise-text hover:text-enterprise-secondary">{contact.fullName}</Link>
                          <Badge tone={toneForPriority(contact.priority)}>{contact.priority}</Badge>
                          <Badge tone="sky">{contact.score}/100</Badge>
                        </div>
                        <p className="mt-1 text-sm text-enterprise-muted">{contact.area || "No area"} · {contact.phone} · {contact.stage}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {contact.callUrl ? <a href={contact.callUrl} className={buttonStyles("primary", "sm")}>Call</a> : null}
                        {contact.whatsappUrl ? <a href={contact.whatsappUrl} target="_blank" rel="noreferrer" className={buttonStyles("secondary", "sm")}>WhatsApp</a> : null}
                        {contact.mapUrl ? <a href={contact.mapUrl} target="_blank" rel="noreferrer" className={buttonStyles("ghost", "sm")}>Maps</a> : null}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {quickOutcomes.map((outcome) => (
                        <button
                          key={outcome.key}
                          type="button"
                          disabled={actioningContactId === contact.id}
                          onClick={() => void applyOutcome(contact, outcome.key)}
                          className="rounded-lg border border-enterprise-border bg-enterprise-surface50 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-enterprise-text hover:border-enterprise-secondary hover:bg-white disabled:opacity-50"
                        >
                          {outcome.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No calls ready" description="Import cafés with phone numbers or enrich leads currently missing phone data." />
            )}
          </Card>

          <div className="space-y-6">
            <Card title="Needs phone" description="Leads that are useful for area coverage but cannot be called yet.">
              {overview?.needsPhone.length ? (
                <div className="space-y-3">
                  {overview.needsPhone.slice(0, 10).map((contact) => (
                    <div key={contact.id} className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
                      <Link href={`/contacts/view?id=${contact.id}`} className="font-semibold text-enterprise-text hover:text-enterprise-secondary">{contact.fullName}</Link>
                      <p className="mt-1 text-sm text-enterprise-muted">{contact.area || "No area"} · {contact.source || "Unknown source"}</p>
                      {contact.mapUrl ? <a href={contact.mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-semibold text-enterprise-secondary">Open Maps</a> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No missing-phone queue" description="Every imported café lead currently has a usable phone." />
              )}
            </Card>

            <Card title="WhatsApp scripts" description="Manual WhatsApp links only. No paid WhatsApp API required.">
              <div className="space-y-3">
                {(overview?.templates ?? []).map((template) => (
                  <div key={template.key} className="rounded-xl border border-enterprise-border bg-enterprise-surface50 p-4">
                    <p className="font-semibold text-enterprise-text">{template.title}</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-enterprise-muted">{template.body}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
