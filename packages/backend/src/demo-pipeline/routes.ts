import { buildWhatsappUrl } from "@smartcrm/shared";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { AuthUser } from "../auth/types.js";
import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { readJsonBody } from "../common/validation.js";
import { createActivity, serializeDeal, writeAudit } from "../core/business.js";
import { CoreRepository } from "../core/repository.js";
import type { ContactRow, DealRow, TaskRow } from "../core/types.js";
import { addDays, createId, nowIso, optionalText, parseDate, requireMinimumRole, splitTags, uniqueTags } from "../core/utils.js";

type AhwaPipelineStage =
  | "READY_TO_CALL"
  | "CALLED"
  | "INTERESTED"
  | "DEMO_SCHEDULED"
  | "DEMO_DONE"
  | "TRIAL_OFFERED"
  | "WON"
  | "LOST";

type DemoType = "IN_PERSON" | "PHONE" | "WHATSAPP" | "ONLINE";

const PIPELINE_STAGES: Array<{ key: AhwaPipelineStage; label: string; description: string }> = [
  { key: "READY_TO_CALL", label: "Ready to call", description: "Cafe has enough data to start outreach." },
  { key: "CALLED", label: "Called", description: "A first touch happened but no qualified interest yet." },
  { key: "INTERESTED", label: "Interested", description: "Owner/team showed interest and needs a demo." },
  { key: "DEMO_SCHEDULED", label: "Demo scheduled", description: "A demo or visit is booked." },
  { key: "DEMO_DONE", label: "Demo done", description: "Demo happened and needs commercial follow-up." },
  { key: "TRIAL_OFFERED", label: "Trial offered", description: "Cafe is testing or considering an Ahwa trial." },
  { key: "WON", label: "Won", description: "Converted to customer." },
  { key: "LOST", label: "Lost", description: "Archived with a loss reason." },
];

const LOST_REASONS = [
  "Already has system",
  "Too expensive",
  "Owner unavailable",
  "Not interested now",
  "Small cafe",
  "Wants WhatsApp only",
  "Needs partner approval",
  "Wrong fit",
] as const;

const DEMO_TYPES: DemoType[] = ["IN_PERSON", "PHONE", "WHATSAPP", "ONLINE"];
const TOUCH_TASK_TYPES = ["FOLLOW_UP", "CALL", "WHATSAPP", "MEETING", "GENERAL"];

function isRealPhone(value?: string | null): boolean {
  if (!value || value.startsWith("NO-PHONE-")) return false;
  return value.replace(/\D/g, "").length >= 8;
}

function isCafeProspect(contact: ContactRow): boolean {
  const tags = splitTags(contact.tags).map((tag) => tag.toLowerCase());
  const searchable = [contact.source, contact.company, contact.placeLabel, contact.locationText, contact.area, contact.fullName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    tags.some((tag) => ["ahwa", "cafe", "prospecting", "maps", "google-maps", "demo-scheduled", "demo-done", "trial-offered"].includes(tag)) ||
    searchable.includes("cafe") ||
    searchable.includes("coffee") ||
    searchable.includes("قهوة") ||
    searchable.includes("مقهى") ||
    searchable.includes("google maps") ||
    ["INTERESTED", "POTENTIAL", "VISIT", "FREE_TRIAL", "CLIENT", "LOST"].includes(contact.stage)
  );
}

function hasTag(contact: ContactRow, tag: string): boolean {
  return splitTags(contact.tags).some((item) => item.toLowerCase() === tag.toLowerCase());
}

function pendingTasksForContact(tasks: TaskRow[], contactId: string): TaskRow[] {
  return tasks.filter((task) => task.contactId === contactId && task.status === "PENDING");
}

function nextPendingTask(tasks: TaskRow[], contactId: string): TaskRow | null {
  return pendingTasksForContact(tasks, contactId).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0] ?? null;
}

function pendingMeetingTask(tasks: TaskRow[], contactId: string): TaskRow | null {
  return pendingTasksForContact(tasks, contactId)
    .filter((task) => task.type === "MEETING")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0] ?? null;
}

function openDealForContact(deals: DealRow[], contactId: string): DealRow | null {
  return deals
    .filter((deal) => deal.contactId === contactId && !["WON", "LOST"].includes(deal.stage))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
}

function inferAhwaStage(contact: ContactRow, tasks: TaskRow[]): AhwaPipelineStage {
  if (contact.stage === "CLIENT") return "WON";
  if (contact.stage === "LOST") return "LOST";
  if (contact.stage === "FREE_TRIAL") return "TRIAL_OFFERED";
  if (contact.stage === "VISIT") {
    if (pendingMeetingTask(tasks, contact.id)) return "DEMO_SCHEDULED";
    return hasTag(contact, "demo-done") ? "DEMO_DONE" : "DEMO_SCHEDULED";
  }
  if (contact.stage === "POTENTIAL") return "INTERESTED";
  if (contact.stage === "INTERESTED") return "CALLED";
  return "READY_TO_CALL";
}

function scoreContact(contact: ContactRow, tasks: TaskRow[], deals: DealRow[]): number {
  let score = 35;
  if (isRealPhone(contact.phone)) score += 20;
  if (contact.mapUrl) score += 10;
  if (contact.area) score += 8;
  if (contact.stage === "POTENTIAL") score += 18;
  if (contact.stage === "VISIT") score += 28;
  if (contact.stage === "FREE_TRIAL") score += 30;
  if (pendingMeetingTask(tasks, contact.id)) score += 18;
  if (nextPendingTask(tasks, contact.id)) score += 8;
  if (openDealForContact(deals, contact.id)) score += 12;
  if (contact.stage === "CLIENT") score = 100;
  if (contact.stage === "LOST") score = 0;
  return Math.max(0, Math.min(100, score));
}

function suggestedNextAction(stage: AhwaPipelineStage, contact: ContactRow, tasks: TaskRow[]): { label: string; urgency: "LOW" | "MEDIUM" | "HIGH"; dueAt: string | null } {
  const nextTask = nextPendingTask(tasks, contact.id);
  if (nextTask) return { label: nextTask.title, urgency: nextTask.priority, dueAt: nextTask.dueAt };
  if (stage === "READY_TO_CALL") return { label: "Call decision maker", urgency: isRealPhone(contact.phone) ? "HIGH" : "MEDIUM", dueAt: null };
  if (stage === "CALLED") return { label: "Qualify interest", urgency: "MEDIUM", dueAt: null };
  if (stage === "INTERESTED") return { label: "Book Ahwa demo", urgency: "HIGH", dueAt: null };
  if (stage === "DEMO_SCHEDULED") return { label: "Prepare demo checklist", urgency: "HIGH", dueAt: null };
  if (stage === "DEMO_DONE") return { label: "Send proposal or trial offer", urgency: "HIGH", dueAt: null };
  if (stage === "TRIAL_OFFERED") return { label: "Close after trial feedback", urgency: "HIGH", dueAt: null };
  if (stage === "WON") return { label: "Onboard customer", urgency: "LOW", dueAt: null };
  return { label: "Review loss reason", urgency: "LOW", dueAt: null };
}

function demoScript(contact?: ContactRow | null): string {
  const name = contact?.fullName || "المقهى";
  return `السلام عليكم، أنا محمد من Ahwa. الهدف من الديمو إننا نشوف مع ${name} دورة الطلبات من أول الكاشير لحد المطبخ والحسابات، ونحدد هل النظام هيوفر وقت وأخطاء في التشغيل اليومي. هسألكم كام سؤال سريع عن طريقة الطلبات الحالية وبعدها أوريكم السيناريو العملي.`;
}

function serializePipelineContact(contact: ContactRow, tasks: TaskRow[], deals: DealRow[]) {
  const stage = inferAhwaStage(contact, tasks);
  const meetingTask = pendingMeetingTask(tasks, contact.id);
  const nextTask = nextPendingTask(tasks, contact.id);
  const openDeal = openDealForContact(deals, contact.id);
  const tags = splitTags(contact.tags);

  return {
    id: contact.id,
    fullName: contact.fullName,
    phone: contact.phone,
    company: contact.company,
    area: contact.area,
    mapUrl: contact.mapUrl,
    source: contact.source,
    contactStage: contact.stage,
    pipelineStage: stage,
    expectedDealValue: Number(contact.expectedDealValue ?? 0),
    score: scoreContact(contact, tasks, deals),
    lastContactedAt: contact.lastContactedAt,
    nextFollowUpAt: contact.nextFollowUpAt,
    tags,
    whatsappUrl: buildWhatsappUrl(contact.normalizedPhone || contact.phone, `السلام عليكم، أنا محمد من Ahwa. حابب أعرض لحضرتك نظام تشغيل بسيط للمقاهي يساعد في الطلبات والكاشير والمطبخ والتقارير.`),
    nextAction: suggestedNextAction(stage, contact, tasks),
    demoTask: meetingTask ? { id: meetingTask.id, title: meetingTask.title, dueAt: meetingTask.dueAt, description: meetingTask.description } : null,
    nextTask: nextTask ? { id: nextTask.id, title: nextTask.title, type: nextTask.type, priority: nextTask.priority, dueAt: nextTask.dueAt } : null,
    deal: openDeal ? serializeDeal(openDeal, contact, null) : null,
  };
}

function parseBodyText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseBodyNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseOptionalIso(value: unknown, field: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return parseDate(value, field);
}

function requireContactId(body: Record<string, unknown>): string {
  const contactId = parseBodyText(body.contactId);
  if (!contactId) throw new HttpError("Contact id is required", 400);
  return contactId;
}

function dueIn(days: number, hour = 10): string {
  const value = addDays(new Date(), days);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
}

async function updateTags(repo: CoreRepository, contact: ContactRow, additions: string[], extra: Record<string, unknown> = {}) {
  const tags = uniqueTags([...splitTags(contact.tags), ...additions]);
  return repo.updateContact(contact.id, { ...extra, tags, updatedAt: nowIso() });
}

async function ensureDeal(repo: CoreRepository, user: AuthUser, contact: ContactRow, desired: { stage: DealRow["stage"]; probability: number; amount?: number; notes?: string | null }): Promise<DealRow> {
  const existing = openDealForContact(await repo.dealsByContact(contact.id), contact.id);
  const timestamp = nowIso();
  const amount = Number(desired.amount ?? contact.expectedDealValue ?? existing?.amount ?? 0);

  if (existing) {
    const updated = await repo.updateDeal(existing.id, {
      stage: desired.stage,
      probability: desired.probability,
      amount,
      notes: desired.notes ?? existing.notes,
      updatedAt: timestamp,
    });
    if (!updated) throw new HttpError("Unable to update deal", 502);
    return updated;
  }

  return repo.createDeal({
    id: createId(),
    contactId: contact.id,
    companyId: contact.companyId,
    ownerId: user.id,
    title: `Ahwa subscription - ${contact.fullName}`,
    amount,
    probability: desired.probability,
    stage: desired.stage,
    expectedCloseAt: dueIn(14, 12),
    notes: desired.notes ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function createContactTask(repo: CoreRepository, user: AuthUser, params: { contactId: string; title: string; description?: string | null; type: TaskRow["type"]; priority?: TaskRow["priority"]; dueAt: string; durationMins?: number; hasExactTime?: boolean }) {
  const timestamp = nowIso();
  return repo.createTask({
    id: createId(),
    contactId: params.contactId,
    ownerId: user.id,
    title: params.title,
    description: params.description ?? null,
    type: params.type,
    priority: params.priority ?? "HIGH",
    status: "PENDING",
    dueAt: params.dueAt,
    hasExactTime: params.hasExactTime ?? true,
    durationMins: params.durationMins ?? 30,
    completionResult: null,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function cancelPendingTouchTasks(repo: CoreRepository, contactId: string, reason: string) {
  await repo
    .updateTasks(
      [
        { column: "contactId", value: contactId },
        { column: "status", value: "PENDING" },
        { column: "type", op: "in", value: TOUCH_TASK_TYPES },
      ],
      { status: "CANCELLED", completionResult: reason, updatedAt: nowIso() },
    )
    .catch(() => null);
}

async function completePendingMeetings(repo: CoreRepository, contactId: string, result: string) {
  await repo
    .updateTasks(
      [
        { column: "contactId", value: contactId },
        { column: "status", value: "PENDING" },
        { column: "type", value: "MEETING" },
      ],
      { status: "COMPLETED", completionResult: result, completedAt: nowIso(), updatedAt: nowIso() },
    )
    .catch(() => null);
}

async function handleOverview(env: BackendEnv) {
  const repo = new CoreRepository(env);
  const [contacts, tasks, deals] = await Promise.all([repo.contacts([], [{ column: "updatedAt", ascending: false }], 2000), repo.tasks([], [{ column: "dueAt", ascending: true }], 3000), repo.deals([], [{ column: "updatedAt", ascending: false }], 1500)]);

  const pipelineContacts = contacts.filter(isCafeProspect).map((contact) => serializePipelineContact(contact, tasks, deals));
  const board = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    contacts: pipelineContacts
      .filter((contact) => contact.pipelineStage === stage.key)
      .sort((a, b) => b.score - a.score),
  }));
  const openContacts = pipelineContacts.filter((contact) => !["WON", "LOST"].includes(contact.pipelineStage));
  const openDeals = deals.filter((deal) => !["WON", "LOST"].includes(deal.stage));
  const scheduledDemos = pipelineContacts.filter((contact) => contact.pipelineStage === "DEMO_SCHEDULED");
  const trials = pipelineContacts.filter((contact) => contact.pipelineStage === "TRIAL_OFFERED");
  const won = pipelineContacts.filter((contact) => contact.pipelineStage === "WON");
  const lost = pipelineContacts.filter((contact) => contact.pipelineStage === "LOST");
  const totalOpenValue = openDeals.reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0);

  return jsonResponse({
    stages: PIPELINE_STAGES,
    board,
    summary: {
      totalProspects: pipelineContacts.length,
      activeProspects: openContacts.length,
      scheduledDemos: scheduledDemos.length,
      trials: trials.length,
      won: won.length,
      lost: lost.length,
      openPipelineValue: totalOpenValue,
      demoConversionRate: scheduledDemos.length + won.length + lost.length > 0 ? Math.round((won.length / Math.max(1, scheduledDemos.length + won.length + lost.length)) * 100) : 0,
    },
    focus: openContacts.sort((a, b) => b.score - a.score).slice(0, 8),
    lostReasons: LOST_REASONS,
    demoTypes: DEMO_TYPES,
    checklist: [
      "Ask how orders currently move from cashier to preparation.",
      "Show Ahwa order creation and status tracking.",
      "Show cashier, kitchen screen, and shift control.",
      "Ask current pain point: mistakes, delays, cash leakage, reports, staff control.",
      "Ask number of staff and average daily orders.",
      "Ask who makes the final decision and when they can decide.",
      "Agree next action before leaving the demo.",
    ],
    scripts: {
      demoIntro: demoScript(),
      afterDemo: "تشرفت بشرح Ahwa لحضرتك. الخطوة المنطقية الآن إننا نجرب النظام على سيناريو بسيط من طلباتكم ونشوف هل مناسب لطريقة تشغيل المكان.",
      trialFollowUp: "حابب أتابع مع حضرتك تجربة Ahwa: هل دورة الطلبات والكاشير واضحة؟ وهل في نقطة معينة محتاجة تعديل قبل القرار النهائي؟",
      close: "لو النظام مناسب لطريقة التشغيل، نقدر نبدأ بخطة تشغيل بسيطة ونثبت أول يوم إعدادات المنيو والموظفين معاكم.",
    },
  });
}

async function handleScheduleDemo(request: Request, env: BackendEnv, user: AuthUser) {
  requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const contactId = requireContactId(body);
  const demoAt = parseOptionalIso(body.demoAt, "demoAt") ?? dueIn(1, 13);
  const demoType = DEMO_TYPES.includes(body.demoType as DemoType) ? (body.demoType as DemoType) : "IN_PERSON";
  const decisionMaker = optionalText(body.decisionMaker) ?? "Decision maker";
  const notes = optionalText(body.notes);
  const expectedValue = parseBodyNumber(body.expectedValue, 0);

  const repo = new CoreRepository(env);
  const contact = await repo.contactById(contactId);
  if (!contact) throw new HttpError("Contact not found", 404);

  await createContactTask(repo, user, {
    contactId,
    title: "Ahwa demo meeting",
    description: [`Type: ${demoType}`, `Decision maker: ${decisionMaker}`, notes].filter(Boolean).join("\n"),
    type: "MEETING",
    priority: "HIGH",
    dueAt: demoAt,
    durationMins: demoType === "IN_PERSON" ? 60 : 30,
  });

  const updated = await updateTags(repo, contact, ["ahwa", "demo-scheduled"], { stage: "VISIT", nextFollowUpAt: demoAt, expectedDealValue: expectedValue || contact.expectedDealValue || 0 });
  await ensureDeal(repo, user, updated ?? contact, { stage: "QUALIFIED", probability: 45, amount: expectedValue || contact.expectedDealValue || 0, notes: notes ?? `Demo scheduled with ${decisionMaker}.` });
  await repo.createNote({ id: createId(), contactId, body: `Demo scheduled. Type: ${demoType}. Decision maker: ${decisionMaker}.${notes ? `\n${notes}` : ""}`, createdAt: nowIso() }).catch(() => null);
  await createActivity(repo, contactId, "AHWA_DEMO_SCHEDULED", { demoAt, demoType, decisionMaker });
  await writeAudit(repo, user, { action: "AHWA_DEMO_SCHEDULED", entityType: "contact", entityId: contactId, after: { demoAt, demoType } });

  return jsonResponse({ ok: true, contact: updated }, { status: 201 });
}

async function handleMarkDemoDone(request: Request, env: BackendEnv, user: AuthUser) {
  requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const contactId = requireContactId(body);
  const notes = parseBodyText(body.notes, "Demo completed.");
  const painPoints = parseBodyText(body.painPoints);
  const staffCount = parseBodyText(body.staffCount);
  const budget = parseBodyText(body.budget);
  const timeline = parseBodyText(body.timeline);
  const followUpAt = parseOptionalIso(body.followUpAt, "followUpAt") ?? dueIn(1, 11);
  const offerTrial = Boolean(body.offerTrial);

  const repo = new CoreRepository(env);
  const contact = await repo.contactById(contactId);
  if (!contact) throw new HttpError("Contact not found", 404);

  await completePendingMeetings(repo, contactId, "Demo completed");
  const updated = await updateTags(repo, contact, ["ahwa", "demo-done", offerTrial ? "trial-candidate" : "proposal-needed"], { stage: offerTrial ? "FREE_TRIAL" : "VISIT", nextFollowUpAt: followUpAt });
  await ensureDeal(repo, user, updated ?? contact, { stage: offerTrial ? "NEGOTIATION" : "PROPOSAL", probability: offerTrial ? 75 : 65, notes });
  await createContactTask(repo, user, {
    contactId,
    title: offerTrial ? "Follow up Ahwa trial decision" : "Send Ahwa proposal after demo",
    description: [notes, painPoints ? `Pain points: ${painPoints}` : null, staffCount ? `Staff/orders context: ${staffCount}` : null, budget ? `Budget: ${budget}` : null, timeline ? `Decision timeline: ${timeline}` : null].filter(Boolean).join("\n"),
    type: offerTrial ? "FOLLOW_UP" : "WHATSAPP",
    priority: "HIGH",
    dueAt: followUpAt,
    durationMins: 20,
  });
  await repo.createNote({ id: createId(), contactId, body: ["Demo completed.", notes, painPoints ? `Pain points: ${painPoints}` : null, staffCount ? `Staff/orders: ${staffCount}` : null, budget ? `Budget: ${budget}` : null, timeline ? `Timeline: ${timeline}` : null].filter(Boolean).join("\n"), createdAt: nowIso() }).catch(() => null);
  await createActivity(repo, contactId, "AHWA_DEMO_DONE", { offerTrial, painPoints, timeline });
  await writeAudit(repo, user, { action: "AHWA_DEMO_DONE", entityType: "contact", entityId: contactId, after: { offerTrial, followUpAt } });

  return jsonResponse({ ok: true, contact: updated });
}

async function handleOfferTrial(request: Request, env: BackendEnv, user: AuthUser) {
  requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const contactId = requireContactId(body);
  const trialEndsAt = parseOptionalIso(body.trialEndsAt, "trialEndsAt") ?? dueIn(7, 12);
  const notes = optionalText(body.notes) ?? "Ahwa trial offered.";

  const repo = new CoreRepository(env);
  const contact = await repo.contactById(contactId);
  if (!contact) throw new HttpError("Contact not found", 404);

  const updated = await updateTags(repo, contact, ["ahwa", "trial-offered"], { stage: "FREE_TRIAL", nextFollowUpAt: trialEndsAt });
  await ensureDeal(repo, user, updated ?? contact, { stage: "NEGOTIATION", probability: 78, notes });
  await createContactTask(repo, user, { contactId, title: "Close Ahwa trial feedback", description: notes, type: "FOLLOW_UP", priority: "HIGH", dueAt: trialEndsAt, durationMins: 20 });
  await repo.createNote({ id: createId(), contactId, body: `Trial offered. Follow-up at ${trialEndsAt}.\n${notes}`, createdAt: nowIso() }).catch(() => null);
  await createActivity(repo, contactId, "AHWA_TRIAL_OFFERED", { trialEndsAt });
  await writeAudit(repo, user, { action: "AHWA_TRIAL_OFFERED", entityType: "contact", entityId: contactId, after: { trialEndsAt } });

  return jsonResponse({ ok: true, contact: updated });
}

async function handleMarkWon(request: Request, env: BackendEnv, user: AuthUser) {
  requireMinimumRole(user, ["SALES_MANAGER", "ADMIN"]);
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const contactId = requireContactId(body);
  const amount = parseBodyNumber(body.amount, 0);
  const notes = optionalText(body.notes) ?? "Converted to Ahwa customer.";
  if (amount <= 0) throw new HttpError("Won amount is required", 400);

  const repo = new CoreRepository(env);
  const contact = await repo.contactById(contactId);
  if (!contact) throw new HttpError("Contact not found", 404);

  await cancelPendingTouchTasks(repo, contactId, "Converted to customer");
  const updated = await updateTags(repo, contact, ["ahwa", "customer", "won"], { stage: "CLIENT", expectedDealValue: amount, nextFollowUpAt: null });
  await ensureDeal(repo, user, updated ?? contact, { stage: "WON", probability: 100, amount, notes });
  await repo.createNote({ id: createId(), contactId, body: `Won Ahwa customer. Amount: ${amount}.\n${notes}`, createdAt: nowIso() }).catch(() => null);
  await createActivity(repo, contactId, "AHWA_WON", { amount });
  await writeAudit(repo, user, { action: "AHWA_WON", entityType: "contact", entityId: contactId, after: { amount } });

  return jsonResponse({ ok: true, contact: updated });
}

async function handleMarkLost(request: Request, env: BackendEnv, user: AuthUser) {
  requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const contactId = requireContactId(body);
  const reason = parseBodyText(body.reason, "Not interested now");
  const notes = optionalText(body.notes);

  const repo = new CoreRepository(env);
  const contact = await repo.contactById(contactId);
  if (!contact) throw new HttpError("Contact not found", 404);

  await cancelPendingTouchTasks(repo, contactId, `Lost: ${reason}`);
  const updated = await updateTags(repo, contact, ["ahwa", "lost", reason.toLowerCase().replace(/[^a-z0-9]+/g, "-")], { stage: "LOST", nextFollowUpAt: null });
  const deal = openDealForContact(await repo.dealsByContact(contactId), contactId);
  if (deal) await repo.updateDeal(deal.id, { stage: "LOST", probability: 0, notes: [deal.notes, `Lost reason: ${reason}`, notes].filter(Boolean).join("\n"), updatedAt: nowIso() });
  await repo.createNote({ id: createId(), contactId, body: [`Lost reason: ${reason}`, notes].filter(Boolean).join("\n"), createdAt: nowIso() }).catch(() => null);
  await createActivity(repo, contactId, "AHWA_LOST", { reason });
  await writeAudit(repo, user, { action: "AHWA_LOST", entityType: "contact", entityId: contactId, after: { reason } });

  return jsonResponse({ ok: true, contact: updated });
}

export async function handleDemoPipelineRoute(request: Request, env: BackendEnv, pathSegments: string[], ctx?: BackendExecutionContext): Promise<Response | null> {
  void ctx;
  if (pathSegments[0] !== "demo-pipeline") return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);

  const user = await requireUser(request, env);
  const method = request.method.toUpperCase();
  const action = pathSegments[1] ?? "overview";

  if (pathSegments.length === 1 && method === "GET") return handleOverview(env);
  if (pathSegments.length === 2 && action === "overview" && method === "GET") return handleOverview(env);
  if (pathSegments.length === 2 && action === "schedule-demo" && method === "POST") return handleScheduleDemo(request, env, user);
  if (pathSegments.length === 2 && action === "mark-demo-done" && method === "POST") return handleMarkDemoDone(request, env, user);
  if (pathSegments.length === 2 && action === "offer-trial" && method === "POST") return handleOfferTrial(request, env, user);
  if (pathSegments.length === 2 && action === "mark-won" && method === "POST") return handleMarkWon(request, env, user);
  if (pathSegments.length === 2 && action === "mark-lost" && method === "POST") return handleMarkLost(request, env, user);

  return null;
}
