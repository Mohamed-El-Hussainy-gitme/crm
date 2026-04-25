import { buildWhatsappUrl, cafeCallOutcomeRequestSchema, importCafeLeadsSchema, parseCafeLeadsSchema, type CafeCallOutcome } from "@smartcrm/shared";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { AuthUser } from "../auth/types.js";
import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { parseMapsIntake } from "./maps-intake.js";
import { coordinatesLabel, normalizeLocationInput } from "./location-normalizer.js";
import { duplicateCandidatesForLead, parseCapturedPlace } from "./capture-assistant.js";
import { readJsonBody } from "../common/validation.js";
import { createActivity } from "../core/business.js";
import { CoreRepository } from "../core/repository.js";
import type { ContactRow, TaskPriority, TaskType } from "../core/types.js";
import { addDays, createId, normalizePhone, nowIso, optionalText, requireMinimumRole, splitTags, uniqueTags } from "../core/utils.js";

type LeadPriority = "HIGH" | "MEDIUM" | "LOW";

type ParsedCafeLead = {
  id: string;
  name: string;
  phone: string | null;
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
};

type ImportedLeadResult = {
  name: string;
  status: "CREATED" | "SKIPPED";
  reason?: string;
  contact?: ReturnType<typeof serializeProspectingContact>;
};

const REAL_PHONE_MIN_DIGITS = 8;
const CAFE_TAGS = ["ahwa", "cafe", "prospecting", "maps"];
const STAGES_EXCLUDED_FROM_CALL_QUEUE = new Set(["CLIENT", "LOST"]);

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function isRealPhone(value?: string | null): boolean {
  const normalized = normalizePhone(value) ?? "";
  return normalized.replace(/\D/g, "").length >= REAL_PHONE_MIN_DIGITS && !String(value ?? "").startsWith("NO-PHONE-");
}

function placeholderPhone(seed: string): string {
  return `NO-PHONE-${hashText(seed).slice(0, 12).toUpperCase()}`;
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  return match[0].replace(/[),.]+$/g, "");
}

function extractPhone(text: string): string | null {
  const compact = text.replace(/[()\-.]/g, " ");
  const candidates = compact.match(/(?:\+?20|0020|0)?1[0125][\s\d]{8,14}|\+?\d[\d\s]{7,18}/g) ?? [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= REAL_PHONE_MIN_DIGITS && digits.length <= 15) return candidate.trim();
  }
  return null;
}

function decodeMapsNameFromUrl(urlValue: string | null): string | null {
  if (!urlValue) return null;
  try {
    const url = new URL(urlValue);
    if (url.pathname.includes("/place/")) {
      const place = url.pathname.split("/place/")[1]?.split("/")[0];
      if (place) return decodeURIComponent(place.replace(/\+/g, " ")).trim();
    }
    const query = url.searchParams.get("q") ?? url.searchParams.get("query");
    if (query) return decodeURIComponent(query.replace(/\+/g, " ")).split(/[،,|\-]/)[0]?.trim() ?? null;
  } catch {
    return null;
  }
  return null;
}

function looksLikeMetadata(line: string): boolean {
  const lower = line.toLowerCase();
  if (!line) return true;
  if (/^\d+(\.\d+)?\s*\(?[\d,\.]*\)?$/.test(line)) return true;
  if (/^(open|closed|opens|closes|coffee shop|cafe|restaurant|directions|website|save|share|call|menu)\b/i.test(line)) return true;
  if (lower.includes("google") && lower.includes("maps")) return true;
  if (/^[⭐★]/.test(line)) return true;
  return false;
}

function inferArea(lines: string[], defaultArea?: string): string | null {
  if (defaultArea?.trim()) return defaultArea.trim();
  const addressLine = lines.find((line) => /شارع|street|st\.|road|rd\.|مدينة|nasr|maadi|dokki|zamalek|heliopolis|tagamoa|new cairo|giza|cairo/i.test(line));
  const candidate = addressLine ?? lines.find((line) => line.includes(",") || line.includes("،"));
  if (!candidate) return null;
  const parts = candidate.split(/[،,|\-]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 2] ?? null;
  if (parts.length >= 2) return parts[parts.length - 1] ?? null;
  return null;
}

function chunkInput(input: string): string[] {
  const normalized = input.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const blankSplit = normalized.split(/\n\s*\n+/).map((item) => item.trim()).filter(Boolean);
  if (blankSplit.length > 1) return blankSplit;

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const startsNewLead = current.length >= 3 && !looksLikeMetadata(line) && !extractPhone(line) && !line.startsWith("http") && current.some((item) => extractPhone(item) || extractUrl(item));
    if (startsNewLead) {
      chunks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

function scoreLead(input: { phone: string | null; area: string | null; mapUrl: string | null; name: string; address: string | null }): number {
  let score = 15;
  if (input.name) score += 20;
  if (isRealPhone(input.phone)) score += 35;
  if (input.area) score += 15;
  if (input.mapUrl) score += 15;
  if (input.address) score += 10;
  return Math.min(100, score);
}

function parseLeadChunk(chunk: string, defaultArea?: string, defaultSource = "Google Maps"): ParsedCafeLead | null {
  const rawLines = chunk.split("\n").map(normalizeLine).filter(Boolean);
  if (!rawLines.length) return null;

  const mapUrl = extractUrl(chunk);
  const phone = extractPhone(chunk);
  const nameFromUrl = decodeMapsNameFromUrl(mapUrl);
  const nameLine = rawLines.find((line) => !looksLikeMetadata(line) && !extractPhone(line) && !line.startsWith("http"));
  const name = normalizeLine(nameFromUrl || nameLine || "");
  if (!name || name.length < 2) return null;

  const explicitAddress = rawLines.find((line) => line !== nameLine && !extractPhone(line) && !line.startsWith("http") && !looksLikeMetadata(line)) ?? null;
  const normalizedLocation = normalizeLocationInput({ rawText: chunk, explicitAddress, defaultArea, mapUrl });
  const address = normalizedLocation.address;
  const area = normalizedLocation.area;
  const score = scoreLead({ name, phone, area, mapUrl: normalizedLocation.mapUrl ?? mapUrl, address });
  const warnings: string[] = [...normalizedLocation.warnings];
  if (!isRealPhone(phone)) warnings.push("Phone missing; import will create a Needs phone lead.");
  if (!normalizedLocation.mapUrl && !mapUrl) warnings.push("Google Maps URL missing; duplicate detection will be weaker.");

  return {
    id: `lead_${hashText(`${name}|${phone ?? ""}|${normalizedLocation.mapUrl ?? mapUrl ?? ""}|${address ?? ""}`)}`,
    name,
    phone,
    normalizedPhone: normalizePhone(phone),
    area,
    city: normalizedLocation.city,
    address,
    latitude: normalizedLocation.latitude,
    longitude: normalizedLocation.longitude,
    coordinates: coordinatesLabel(normalizedLocation.latitude, normalizedLocation.longitude),
    plusCode: normalizedLocation.plusCode,
    mapUrl: normalizedLocation.mapUrl ?? mapUrl,
    source: defaultSource || "Google Maps",
    notes: chunk.length > 1000 ? chunk.slice(0, 1000) : chunk,
    score,
    confidence: score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
    tags: [...CAFE_TAGS, isRealPhone(phone) ? "ready-to-call" : "needs-phone"],
    warnings: Array.from(new Set(warnings)),
  };
}


async function parseLeadChunkDeep(chunk: string, defaultArea?: string, defaultSource = "Google Maps"): Promise<ParsedCafeLead | null> {
  const local = parseLeadChunk(chunk, defaultArea, defaultSource);
  const resolved = await parseMapsIntake(chunk, { defaultArea, defaultSource, resolveRemote: true }).catch(() => null);
  const name = resolved?.placeLabel || resolved?.company || local?.name || "";
  if (!name || name.length < 2) return local;

  const phone = resolved?.phone || local?.phone || null;
  const area = resolved?.area || local?.area || defaultArea || null;
  const address = resolved?.locationText || local?.address || null;
  const mapUrl = resolved?.mapUrl || local?.mapUrl || null;
  const city = resolved?.city || local?.city || null;
  const latitude = resolved?.latitude ?? local?.latitude ?? null;
  const longitude = resolved?.longitude ?? local?.longitude ?? null;
  const score = scoreLead({ name, phone, area, mapUrl, address });
  const warnings = Array.from(new Set([...(local?.warnings ?? []), ...(resolved?.warnings ?? [])]));
  if (!isRealPhone(phone) && !warnings.some((item) => item.toLowerCase().includes("phone"))) {
    warnings.push("Phone missing; import will create a Needs phone lead.");
  }

  return {
    id: `lead_${hashText(`${name}|${phone ?? ""}|${mapUrl ?? ""}|${address ?? ""}`)}`,
    name,
    phone,
    normalizedPhone: normalizePhone(phone),
    area,
    city,
    address,
    latitude,
    longitude,
    coordinates: coordinatesLabel(latitude, longitude),
    plusCode: resolved?.plusCode || local?.plusCode || null,
    mapUrl,
    source: resolved?.source || local?.source || defaultSource || "Google Maps",
    notes: chunk.length > 1000 ? chunk.slice(0, 1000) : chunk,
    score,
    confidence: score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
    tags: Array.from(new Set([...(local?.tags ?? CAFE_TAGS), ...CAFE_TAGS, isRealPhone(phone) ? "ready-to-call" : "needs-phone"])),
    warnings,
  };
}

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const parsed = new Date(iso).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function isIsoWithinDay(value: string | null | undefined, day = new Date()): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= startOfDay(day).getTime() && timestamp <= endOfDay(day).getTime();
}

function isIsoOverdue(value: string | null | undefined): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

type ContactTaskMeta = {
  pendingTasks?: number;
  dueToday?: boolean;
  overdue?: boolean;
  meetingToday?: boolean;
  nextTaskDueAt?: string | null;
};

function leadScoreBreakdown(contact: ContactRow, meta: ContactTaskMeta = {}) {
  const hasPhone = isRealPhone(contact.phone);
  const recencyDays = daysSince(contact.lastContactedAt);
  const phone = hasPhone ? 30 : 0;
  const map = contact.mapUrl ? 15 : 0;
  const area = contact.area ? 15 : 0;
  const freshness = recencyDays === null ? 15 : recencyDays >= 3 ? 10 : 0;
  const dueFollowUp = meta.overdue ? 20 : meta.dueToday ? 15 : 0;
  const stageScore = contact.stage === "INTERESTED" || contact.stage === "POTENTIAL" ? 15 : contact.stage === "VISIT" || contact.stage === "FREE_TRIAL" ? 10 : contact.stage === "LEAD" ? 8 : 0;
  const penalty = contact.stage === "LOST" ? -45 : contact.stage === "CLIENT" ? -60 : 0;
  const total = Math.max(0, Math.min(100, 10 + phone + map + area + freshness + dueFollowUp + stageScore + penalty));
  return { total, phone, map, area, freshness, dueFollowUp, stage: stageScore, penalty };
}

function priorityFromScore(score: number): LeadPriority {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

function recommendedAction(contact: ContactRow, meta: ContactTaskMeta = {}) {
  if (!isRealPhone(contact.phone)) return { key: "ENRICH_PHONE", label: "Find phone", urgency: "MEDIUM" };
  if (meta.meetingToday || contact.stage === "VISIT") return { key: "PREPARE_DEMO", label: "Prepare demo", urgency: "HIGH" };
  if (meta.overdue) return { key: "CALL_OVERDUE", label: "Overdue follow-up", urgency: "HIGH" };
  if (meta.dueToday || isIsoWithinDay(contact.nextFollowUpAt)) return { key: "FOLLOW_UP", label: "Follow up today", urgency: "HIGH" };
  if (contact.stage === "INTERESTED" || contact.stage === "POTENTIAL") return { key: "SEND_WHATSAPP", label: "Send WhatsApp", urgency: "MEDIUM" };
  return { key: "CALL_NOW", label: "Call now", urgency: "MEDIUM" };
}

function serializeProspectingContact(contact: ContactRow, meta: ContactTaskMeta = {}) {
  const hasPhone = isRealPhone(contact.phone);
  const tags = splitTags(contact.tags);
  const breakdown = leadScoreBreakdown(contact, meta);
  const score = breakdown.total;
  const intro = `السلام عليكم، أنا محمد من Ahwa. عندنا سيستم تشغيل للمقاهي بيساعد في الطلبات والكاشير والمطبخ والحسابات. ينفع أحدد مع المسؤول 10 دقايق أعرض الفكرة؟`;
  return {
    id: contact.id,
    fullName: contact.fullName,
    phone: contact.phone,
    hasPhone,
    source: contact.source,
    area: contact.area,
    stage: contact.stage,
    company: contact.company,
    locationText: contact.locationText,
    mapUrl: contact.mapUrl,
    placeLabel: contact.placeLabel,
    lastContactedAt: contact.lastContactedAt,
    nextFollowUpAt: contact.nextFollowUpAt,
    tags,
    score,
    scoreBreakdown: breakdown,
    priority: priorityFromScore(score),
    recommendedAction: recommendedAction(contact, meta),
    pendingTasks: meta.pendingTasks ?? 0,
    nextTaskDueAt: meta.nextTaskDueAt ?? null,
    callUrl: hasPhone ? `tel:${contact.phone}` : null,
    whatsappUrl: hasPhone ? buildWhatsappUrl(contact.phone, intro) : null,
  };
}

function dueAt(hour: number, dayOffset = 0): string {
  const value = addDays(new Date(), dayOffset);
  value.setHours(hour, 0, 0, 0);
  if (value.getTime() <= Date.now()) value.setDate(value.getDate() + 1);
  return value.toISOString();
}

function outcomePlan(outcome: CafeCallOutcome, body: { meetingAt?: string | undefined; followUpAt?: string | undefined }) {
  const plans: Record<CafeCallOutcome, { stage: ContactRow["stage"]; taskTitle?: string; taskType?: TaskType; dueAt?: string; priority?: TaskPriority; tag: string; note: string; cancelOpenTouchTasks?: boolean }> = {
    NO_ANSWER: { stage: "LEAD", taskTitle: "Call again - no answer", taskType: "CALL", dueAt: body.followUpAt ?? dueAt(11, 1), priority: "MEDIUM", tag: "no-answer", note: "No answer. Retry tomorrow." },
    WRONG_NUMBER: { stage: "LOST", tag: "wrong-number", note: "Wrong number. Lead closed until better contact data is found.", cancelOpenTouchTasks: true },
    INTERESTED: { stage: "INTERESTED", taskTitle: "Send Ahwa intro and follow up", taskType: "WHATSAPP", dueAt: body.followUpAt ?? dueAt(12, 2), priority: "HIGH", tag: "interested", note: "Interested. Send intro and follow up." },
    NEEDS_CALLBACK: { stage: "POTENTIAL", taskTitle: "Callback requested", taskType: "CALL", dueAt: body.followUpAt ?? dueAt(18, 0), priority: "HIGH", tag: "callback", note: "Callback requested." },
    MEETING_BOOKED: { stage: "VISIT", taskTitle: "Ahwa demo meeting", taskType: "MEETING", dueAt: body.meetingAt ?? body.followUpAt ?? dueAt(13, 1), priority: "HIGH", tag: "meeting-booked", note: "Demo meeting booked." },
    REJECTED: { stage: "LOST", tag: "rejected", note: "Rejected Ahwa offer.", cancelOpenTouchTasks: true },
    ALREADY_HAS_SYSTEM: { stage: "ON_HOLD", taskTitle: "Check replacement timing", taskType: "FOLLOW_UP", dueAt: body.followUpAt ?? dueAt(12, 30), priority: "LOW", tag: "has-system", note: "Already has a system. Follow up later." },
    NEEDS_OWNER: { stage: "POTENTIAL", taskTitle: "Call owner / decision maker", taskType: "CALL", dueAt: body.followUpAt ?? dueAt(19, 0), priority: "HIGH", tag: "needs-owner", note: "Need to reach owner or decision maker." },
  };
  return plans[outcome]!;
}

function contactMatchesCafeProspecting(contact: ContactRow): boolean {
  const tags = splitTags(contact.tags).map((tag) => tag.toLowerCase());
  const source = (contact.source ?? "").toLowerCase();
  return tags.some((tag) => ["ahwa", "cafe", "prospecting", "maps", "google-maps"].includes(tag)) || source.includes("maps") || source.includes("google") || /cafe|coffee|قهوة|مقهى/i.test(contact.company ?? contact.fullName);
}

function templateSet(contact?: ContactRow | null) {
  const name = contact?.fullName ?? "حضرتك";
  const intro = `السلام عليكم، أنا محمد من Ahwa. عندنا سيستم تشغيل للمقاهي بيساعد في الطلبات، الكاشير، المطبخ، والحسابات. ينفع أحدد مع المسؤول 10 دقايق أعرض الفكرة؟`;
  const afterCall = `تشرفت بمكالمة حضرتك بخصوص Ahwa. ده ملخص سريع: السيستم بيساعد المقهى في تنظيم الطلبات والكاشير والمطبخ والحسابات اليومية. تحب أحدد معاد ديمو مناسب؟`;
  const meeting = `تأكيد معاد ديمو Ahwa مع ${name}. هعرض لحضرتك طريقة إدارة الطلبات، الكاشير، المطبخ، والتقارير بشكل سريع وواضح.`;
  const callback = `السلام عليكم، كنت متفق مع حضرتك أرجع أكلمك بخصوص Ahwa. هل الوقت الحالي مناسب؟`;

  return [
    { key: "intro", title: "رسالة تعريف", body: intro, url: contact && isRealPhone(contact.phone) ? buildWhatsappUrl(contact.phone, intro) : null },
    { key: "after_call", title: "بعد المكالمة", body: afterCall, url: contact && isRealPhone(contact.phone) ? buildWhatsappUrl(contact.phone, afterCall) : null },
    { key: "meeting", title: "تأكيد ديمو", body: meeting, url: contact && isRealPhone(contact.phone) ? buildWhatsappUrl(contact.phone, meeting) : null },
    { key: "callback", title: "متابعة لاحقة", body: callback, url: contact && isRealPhone(contact.phone) ? buildWhatsappUrl(contact.phone, callback) : null },
  ];
}

export async function handleAcquisitionRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "acquisition") return null;
  const method = request.method.toUpperCase();
  if (!request.method.match(/^(GET|HEAD|OPTIONS)$/i)) assertTrustedOrigin(request, env);

  const user = await requireUser(request, env);
  const repo = new CoreRepository(env);

  if (pathSegments.length === 2 && pathSegments[1] === "overview" && method === "GET") {
    const url = new URL(request.url);
    const selectedArea = (url.searchParams.get("area") ?? "").trim();
    const [contacts, tasks] = await Promise.all([
      repo.contacts([], [{ column: "updatedAt", ascending: false }], 2500),
      repo.tasks([{ column: "status", value: "PENDING" }], [{ column: "dueAt", ascending: true }], 1000),
    ]);

    const cafeContacts = contacts.filter(contactMatchesCafeProspecting);
    const visibleContacts = selectedArea && selectedArea !== "ALL" ? cafeContacts.filter((contact) => (contact.area || "Unassigned area") === selectedArea) : cafeContacts;

    const taskMetaByContact = new Map<string, ContactTaskMeta>();
    for (const task of tasks) {
      if (!task.contactId) continue;
      const current = taskMetaByContact.get(task.contactId) ?? { pendingTasks: 0, dueToday: false, overdue: false, meetingToday: false, nextTaskDueAt: null };
      current.pendingTasks = (current.pendingTasks ?? 0) + 1;
      current.dueToday = Boolean(current.dueToday || isIsoWithinDay(task.dueAt));
      current.overdue = Boolean(current.overdue || isIsoOverdue(task.dueAt));
      current.meetingToday = Boolean(current.meetingToday || (task.type === "MEETING" && isIsoWithinDay(task.dueAt)));
      if (!current.nextTaskDueAt || new Date(task.dueAt).getTime() < new Date(current.nextTaskDueAt).getTime()) current.nextTaskDueAt = task.dueAt;
      taskMetaByContact.set(task.contactId, current);
    }

    const serialize = (contact: ContactRow) => serializeProspectingContact(contact, taskMetaByContact.get(contact.id));
    const readyToCall = visibleContacts.filter((contact) => isRealPhone(contact.phone) && !STAGES_EXCLUDED_FROM_CALL_QUEUE.has(contact.stage));
    const needsPhone = visibleContacts.filter((contact) => !isRealPhone(contact.phone) && contact.stage !== "LOST");
    const overdueContactIds = new Set(tasks.filter((task) => task.contactId && isIsoOverdue(task.dueAt)).map((task) => task.contactId as string));
    const dueTodayContactIds = new Set(tasks.filter((task) => task.contactId && isIsoWithinDay(task.dueAt)).map((task) => task.contactId as string));
    const meetingsTodayContactIds = new Set(tasks.filter((task) => task.contactId && task.type === "MEETING" && isIsoWithinDay(task.dueAt)).map((task) => task.contactId as string));

    const callQueue = readyToCall
      .map(serialize)
      .sort((left, right) => {
        const leftUrgency = left.recommendedAction.urgency === "HIGH" ? 1 : 0;
        const rightUrgency = right.recommendedAction.urgency === "HIGH" ? 1 : 0;
        return rightUrgency - leftUrgency || right.score - left.score;
      })
      .slice(0, 35);

    const campaigns = new Map<string, { area: string; total: number; readyToCall: number; called: number; meetings: number; clients: number; lost: number; needsPhone: number; overdue: number; score: number; coverage: number; priority: LeadPriority }>();
    for (const contact of cafeContacts) {
      const area = contact.area || "Unassigned area";
      const current = campaigns.get(area) ?? { area, total: 0, readyToCall: 0, called: 0, meetings: 0, clients: 0, lost: 0, needsPhone: 0, overdue: 0, score: 0, coverage: 0, priority: "LOW" as LeadPriority };
      current.total += 1;
      if (isRealPhone(contact.phone) && !STAGES_EXCLUDED_FROM_CALL_QUEUE.has(contact.stage)) current.readyToCall += 1;
      if (!isRealPhone(contact.phone)) current.needsPhone += 1;
      if (contact.lastContactedAt) current.called += 1;
      if (contact.stage === "VISIT" || contact.stage === "FREE_TRIAL") current.meetings += 1;
      if (contact.stage === "CLIENT") current.clients += 1;
      if (contact.stage === "LOST") current.lost += 1;
      if (overdueContactIds.has(contact.id)) current.overdue += 1;
      current.score += leadScoreBreakdown(contact, taskMetaByContact.get(contact.id)).total;
      campaigns.set(area, current);
    }

    const areaCampaigns = Array.from(campaigns.values()).map((campaign) => {
      const averageScore = Math.round(campaign.score / Math.max(1, campaign.total));
      const coverage = Math.round((campaign.called / Math.max(1, campaign.total)) * 100);
      return { ...campaign, score: averageScore, coverage, priority: priorityFromScore(Math.min(100, averageScore + campaign.readyToCall + campaign.overdue * 5)) };
    }).sort((left, right) => right.readyToCall - left.readyToCall || right.score - left.score || right.total - left.total);

    const primaryArea = selectedArea || areaCampaigns[0]?.area || null;
    const followUpDue = visibleContacts.filter((contact) => overdueContactIds.has(contact.id) || dueTodayContactIds.has(contact.id)).map(serialize).sort((left, right) => right.score - left.score).slice(0, 20);
    const meetingsToday = visibleContacts.filter((contact) => meetingsTodayContactIds.has(contact.id)).map(serialize).slice(0, 12);

    return jsonResponse({
      activeArea: selectedArea || null,
      dailyPlan: {
        date: new Date().toISOString(),
        targetCalls: Math.min(25, Math.max(10, callQueue.length)),
        primaryArea,
        firstLeadId: callQueue[0]?.id ?? null,
        readyNow: callQueue.length,
        overdueFollowUps: followUpDue.filter((contact) => contact.recommendedAction.key === "CALL_OVERDUE").length,
        dueFollowUps: followUpDue.length,
        meetingsToday: meetingsToday.length,
        needsEnrichment: needsPhone.length,
        focus: primaryArea ? `Focus on ${primaryArea}: call ready leads first, then enrich missing-phone cafes.` : "Import or enrich café leads before starting today's call block.",
      },
      counts: {
        totalCafeLeads: visibleContacts.length,
        readyToCall: readyToCall.length,
        needsPhone: needsPhone.length,
        contacted: visibleContacts.filter((contact) => Boolean(contact.lastContactedAt)).length,
        meetings: visibleContacts.filter((contact) => contact.stage === "VISIT" || contact.stage === "FREE_TRIAL").length,
      },
      globalCounts: {
        totalCafeLeads: cafeContacts.length,
        readyToCall: cafeContacts.filter((contact) => isRealPhone(contact.phone) && !STAGES_EXCLUDED_FROM_CALL_QUEUE.has(contact.stage)).length,
        needsPhone: cafeContacts.filter((contact) => !isRealPhone(contact.phone) && contact.stage !== "LOST").length,
      },
      callQueue,
      followUpDue,
      meetingsToday,
      needsPhone: needsPhone.slice(0, 35).map(serialize),
      areaCampaigns,
      templates: templateSet(),
      outcomes: [
        { key: "NO_ANSWER", label: "No answer", tone: "amber" },
        { key: "INTERESTED", label: "Interested", tone: "emerald" },
        { key: "NEEDS_OWNER", label: "Needs owner", tone: "sky" },
        { key: "MEETING_BOOKED", label: "Meeting booked", tone: "emerald" },
        { key: "REJECTED", label: "Rejected", tone: "rose" },
      ],
    });
  }

  if (pathSegments.length === 2 && pathSegments[1] === "capture" && method === "POST") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const body = await readJsonBody(request);
    const payload = body && typeof body === "object" && "payload" in body ? (body as { payload?: unknown }).payload : body;
    const defaultArea = body && typeof body === "object" && typeof (body as { defaultArea?: unknown }).defaultArea === "string" ? String((body as { defaultArea: string }).defaultArea) : undefined;
    const lead = parseCapturedPlace(payload, defaultArea ? { defaultArea } : {});
    const contacts = await repo.contacts([], [{ column: "updatedAt", ascending: false }], 5000);
    const duplicateCandidates = duplicateCandidatesForLead(lead, contacts);
    return jsonResponse({
      lead: {
        ...lead,
        duplicateCandidates,
        duplicateStatus: duplicateCandidates.length ? "POSSIBLE_DUPLICATE" : "NEW",
      },
      summary: {
        readyToCall: isRealPhone(lead.phone) ? 1 : 0,
        needsPhone: isRealPhone(lead.phone) ? 0 : 1,
        duplicateCandidates: duplicateCandidates.length,
      },
    });
  }

  if (pathSegments.length === 2 && pathSegments[1] === "parse" && method === "POST") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = parseCafeLeadsSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid Google Maps intake payload", 400, parsed.error.flatten());
    const chunks = chunkInput(parsed.data.input);
    const contacts = await repo.contacts([], [{ column: "updatedAt", ascending: false }], 5000);
    const leads = (await Promise.all(chunks.slice(0, 50).map((chunk) => parseLeadChunkDeep(chunk, parsed.data.defaultArea, parsed.data.defaultSource))))
      .filter((lead): lead is ParsedCafeLead => Boolean(lead))
      .map((lead) => {
        const duplicateCandidates = duplicateCandidatesForLead(lead, contacts);
        return { ...lead, duplicateCandidates, duplicateStatus: duplicateCandidates.length ? "POSSIBLE_DUPLICATE" : "NEW" };
      });
    if (!leads.length) throw new HttpError("Could not detect any café leads from the pasted input", 400);
    return jsonResponse({ leads, summary: { detected: leads.length, readyToCall: leads.filter((lead) => isRealPhone(lead.phone)).length, needsPhone: leads.filter((lead) => !isRealPhone(lead.phone)).length, possibleDuplicates: leads.filter((lead) => lead.duplicateCandidates.length).length } });
  }

  if (pathSegments.length === 2 && pathSegments[1] === "import" && method === "POST") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = importCafeLeadsSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid lead import payload", 400, parsed.error.flatten());
    const existingContacts = await repo.contacts([], [{ column: "createdAt", ascending: false }], 5000);
    const results: ImportedLeadResult[] = [];

    for (const lead of parsed.data.leads) {
      const normalized = normalizePhone(lead.phone);
      const mapUrl = optionalText(lead.mapUrl);
      const duplicate = existingContacts.find((contact) => {
        if (normalized && normalizePhone(contact.normalizedPhone || contact.phone) === normalized) return true;
        if (mapUrl && contact.mapUrl === mapUrl) return true;
        return contact.fullName.trim().toLowerCase() === lead.name.trim().toLowerCase() && (contact.area ?? "").trim().toLowerCase() === (lead.area ?? "").trim().toLowerCase();
      });
      if (duplicate) {
        results.push({ name: lead.name, status: "SKIPPED", reason: `Possible duplicate: ${duplicate.fullName}` });
        continue;
      }

      const timestamp = nowIso();
      const phone = isRealPhone(lead.phone) ? String(lead.phone).trim() : placeholderPhone(`${lead.name}|${lead.area ?? ""}|${lead.mapUrl ?? ""}`);
      const tags = uniqueTags([...(lead.tags ?? []), ...CAFE_TAGS, isRealPhone(phone) ? "ready-to-call" : "needs-phone"]);
      const contact = await repo.createContact({
        id: createId(),
        firstName: lead.name.trim(),
        lastName: null,
        fullName: lead.name.trim(),
        phone,
        normalizedPhone: isRealPhone(phone) ? normalizePhone(phone) : null,
        email: null,
        source: optionalText(lead.source) ?? "Google Maps",
        company: lead.name.trim(),
        companyId: null,
        locationText: optionalText(lead.address),
        area: optionalText(lead.area),
        mapUrl,
        placeLabel: lead.name.trim(),
        stage: "LEAD",
        expectedDealValue: 0,
        lastContactedAt: null,
        nextFollowUpAt: null,
        isWhatsappOptedIn: false,
        tags,
        ownerId: user.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const locationMeta = [
        lead.city ? `City: ${lead.city}` : null,
        lead.coordinates ? `Coordinates: ${lead.coordinates}` : null,
        lead.plusCode ? `Plus code: ${lead.plusCode}` : null,
      ].filter(Boolean).join("\n");
      const importNotes = [lead.notes?.trim(), locationMeta].filter(Boolean).join("\n\n");
      if (importNotes) await repo.createNote({ id: createId(), contactId: contact.id, body: importNotes, createdAt: timestamp }).catch(() => null);
      await createActivity(repo, contact.id, "CAFE_LEAD_IMPORTED", { source: lead.source, score: lead.score, area: lead.area, city: lead.city, coordinates: lead.coordinates, mapUrl: lead.mapUrl });
      existingContacts.push(contact);
      results.push({ name: lead.name, status: "CREATED", contact: serializeProspectingContact(contact) });
    }

    return jsonResponse({ results, createdCount: results.filter((item) => item.status === "CREATED").length, skippedCount: results.filter((item) => item.status === "SKIPPED").length }, { status: 201 });
  }

  if (pathSegments.length === 2 && pathSegments[1] === "call-outcome" && method === "POST") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = cafeCallOutcomeRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid call outcome payload", 400, parsed.error.flatten());
    const body = parsed.data;
    const contact = await repo.contactById(body.contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    const plan = outcomePlan(body.outcome, body);
    const timestamp = nowIso();
    const existingTags = splitTags(contact.tags);
    const nextFollowUpAt = plan.dueAt ?? null;

    const call = await repo.createCall({ id: createId(), contactId: contact.id, outcome: body.outcome, durationMins: 5, summary: body.summary?.trim() || plan.note, createdAt: timestamp });
    if (plan.cancelOpenTouchTasks) {
      await repo.updateTasks([{ column: "contactId", value: contact.id }, { column: "status", value: "PENDING" }, { column: "type", op: "in", value: ["FOLLOW_UP", "CALL", "WHATSAPP", "MEETING", "GENERAL"] }], { status: "CANCELLED", updatedAt: timestamp }).catch(() => null);
    }

    let task = null;
    if (plan.taskTitle && plan.taskType && plan.dueAt) {
      task = await repo.createTask({
        id: createId(),
        contactId: contact.id,
        ownerId: user.id,
        title: plan.taskTitle,
        description: body.summary?.trim() || plan.note,
        type: plan.taskType,
        priority: plan.priority ?? "MEDIUM",
        status: "PENDING",
        dueAt: plan.dueAt,
        hasExactTime: true,
        durationMins: plan.taskType === "MEETING" ? 45 : 10,
        completionResult: null,
        completedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    const updated = await repo.updateContact(contact.id, {
      stage: plan.stage,
      lastContactedAt: timestamp,
      nextFollowUpAt,
      tags: uniqueTags([...existingTags, plan.tag, "ahwa", "cafe", "prospecting"]),
      updatedAt: timestamp,
    });

    await repo.createNote({ id: createId(), contactId: contact.id, body: `${plan.note}${body.summary ? `\n\n${body.summary}` : ""}`, createdAt: timestamp }).catch(() => null);
    await createActivity(repo, contact.id, "CAFE_CALL_OUTCOME", { outcome: body.outcome, callId: call.id, taskId: task && typeof task === "object" && "id" in task ? task.id : null });

    return jsonResponse({ contact: updated ? serializeProspectingContact(updated) : null, call, task, plan: { outcome: body.outcome, stage: plan.stage, nextFollowUpAt } });
  }

  if (pathSegments.length === 2 && pathSegments[1] === "templates" && method === "GET") {
    const contactId = new URL(request.url).searchParams.get("contactId");
    const contact = contactId ? await repo.contactById(contactId) : null;
    return jsonResponse({ templates: templateSet(contact) });
  }

  return null;
}
