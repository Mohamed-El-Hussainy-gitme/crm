import { createContactSchema, parseLocationIntake, pipelineStageSchema } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { readJsonBody } from "../common/validation.js";
import { CoreRepository } from "../core/repository.js";
import type { BackendEnv } from "../app.js";
import type { AuthUser } from "../auth/types.js";
import type { CompanyRow, ContactRow, TaskRow } from "../core/types.js";
import { CONTACT_TOUCH_TASK_TYPES, createId, normalizeEmail, normalizePhone, nowIso, optionalText, parseDate, requireMinimumRole, serializeContact, splitTags, uniqueTags } from "../core/utils.js";

const STAGES_REQUIRING_NEXT_ACTION = new Set(["INTERESTED", "POTENTIAL", "VISIT", "FREE_TRIAL", "ON_HOLD"]);
const COMMERCIAL_PAYMENT_STATUSES = new Set(["PENDING", "PARTIAL", "PAID", "OVERDUE"]);

function contactFullName(firstName: string, lastName?: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function matchesSearch(contact: ContactRow, search: string): boolean {
  const normalizedSearchPhone = normalizePhone(search) ?? "";
  const haystack = [
    contact.fullName,
    contact.phone,
    contact.normalizedPhone,
    contact.email,
    contact.company,
    contact.source,
    contact.locationText,
    contact.area,
    contact.placeLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase()) || Boolean(normalizedSearchPhone && (contact.normalizedPhone ?? contact.phone).includes(normalizedSearchPhone));
}

function rowDate(value: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export class ContactsService {
  private readonly repo: CoreRepository;

  constructor(env: BackendEnv, private readonly user: AuthUser) {
    this.repo = new CoreRepository(env);
  }

  async list(request: Request) {
    const url = new URL(request.url);
    const stage = url.searchParams.get("stage");
    const source = url.searchParams.get("source");
    const companyId = url.searchParams.get("companyId");
    const tag = url.searchParams.get("tag");
    const search = url.searchParams.get("search")?.trim();
    const noNextAction = url.searchParams.get("noNextAction") === "true";
    const staleDaysValue = url.searchParams.get("staleDays");
    const staleDays = staleDaysValue ? Number.parseInt(staleDaysValue, 10) : null;

    const contacts = await this.repo.contacts();
    const companies = await this.repo.companies();
    const companiesById = new Map(companies.map((company) => [company.id, company]));
    const tasks = noNextAction ? await this.repo.tasks([{ column: "status", value: "PENDING" }]) : [];
    const pendingTasksByContact = new Set(tasks.map((task) => task.contactId).filter((id): id is string => Boolean(id)));
    const staleBefore = staleDays && Number.isFinite(staleDays) ? Date.now() - staleDays * 86400000 : null;

    const filtered = contacts.filter((contact) => {
      if (stage && contact.stage !== stage) return false;
      if (source && contact.source !== source) return false;
      if (companyId && contact.companyId !== companyId) return false;
      if (tag && !splitTags(contact.tags).includes(tag)) return false;
      if (search && !matchesSearch(contact, search)) return false;
      if (noNextAction && contact.nextFollowUpAt && pendingTasksByContact.has(contact.id)) return false;
      if (staleBefore !== null && contact.lastContactedAt && rowDate(contact.lastContactedAt) >= staleBefore) return false;
      return true;
    });

    return filtered
      .sort((left, right) => rowDate(right.createdAt) - rowDate(left.createdAt))
      .map((contact) => serializeContact(contact, contact.companyId ? companiesById.get(contact.companyId) ?? null : null));
  }

  async details(id: string) {
    const contact = await this.repo.contactById(id);
    if (!contact) throw new HttpError("Contact not found", 404);

    const [company, notes, tasks, calls, payments, deals, activities] = await Promise.all([
      contact.companyId ? this.repo.companyById(contact.companyId) : Promise.resolve(null),
      this.repo.notesByContact(id),
      this.repo.tasks([{ column: "contactId", value: id }], [{ column: "dueAt", ascending: true }], 500),
      this.repo.callsByContact(id),
      this.repo.paymentsByContact(id),
      this.repo.dealsByContact(id),
      this.repo.activitiesByContact(id),
    ]);

    return {
      ...serializeContact(contact, company),
      notes,
      tasks,
      calls,
      payments,
      deals,
      activities,
    };
  }

  async parseLocation(request: Request) {
    const body = await readJsonBody<{ input?: unknown }>(request);
    const input = typeof body.input === "string" ? body.input.trim() : "";
    if (input.length < 4 || input.length > 2000) {
      throw new HttpError("Invalid location intake input", 400);
    }
    return parseLocationIntake(input);
  }

  async create(request: Request) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = createContactSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid contact payload", 400, parsed.error.flatten());
    const body = parsed.data;

    if (STAGES_REQUIRING_NEXT_ACTION.has(body.stage) && !body.nextFollowUpAt) {
      throw new HttpError("Creating a contact in this stage requires a scheduled next action.", 409);
    }

    if (body.stage === "CLIENT") {
      throw new HttpError("Create the contact first, then move it to CLIENT after a won deal or payment is recorded.", 409);
    }

    await this.assertUniqueIdentity(body.phone, body.email);
    const company = await this.upsertCompanyByName(body.company);
    const timestamp = nowIso();
    const contact = await this.repo.createContact({
      id: createId(),
      firstName: body.firstName.trim(),
      lastName: optionalText(body.lastName),
      fullName: contactFullName(body.firstName.trim(), body.lastName),
      phone: body.phone.trim(),
      normalizedPhone: normalizePhone(body.phone),
      email: normalizeEmail(body.email),
      source: optionalText(body.source),
      company: optionalText(body.company),
      companyId: company?.id ?? null,
      locationText: optionalText(body.locationText),
      area: optionalText(body.area),
      mapUrl: optionalText(body.mapUrl),
      placeLabel: optionalText(body.placeLabel),
      stage: body.stage,
      expectedDealValue: body.expectedDealValue ?? 0,
      lastContactedAt: body.lastContactedAt ? parseDate(body.lastContactedAt, "lastContactedAt") : null,
      nextFollowUpAt: body.nextFollowUpAt ? parseDate(body.nextFollowUpAt, "nextFollowUpAt") : null,
      isWhatsappOptedIn: Boolean(body.isWhatsappOptedIn),
      tags: uniqueTags(body.tags),
      ownerId: this.user.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (body.notes?.trim()) {
      await this.repo.createNote({ id: createId(), contactId: contact.id, body: body.notes.trim(), createdAt: timestamp });
    }

    await this.createActivity(contact.id, "CONTACT_CREATED", { stage: contact.stage, source: contact.source, placeLabel: contact.placeLabel, area: contact.area });
    return serializeContact(contact, company);
  }

  async update(request: Request, id: string) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const contact = await this.repo.contactById(id);
    if (!contact) throw new HttpError("Contact not found", 404);

    const rawBody = (await readJsonBody(request)) as Record<string, unknown>;
    const partial = createContactSchema.partial().safeParse(rawBody);
    if (!partial.success) throw new HttpError("Invalid contact payload", 400, partial.error.flatten());
    const body = partial.data;

    await this.assertUniqueIdentity(body.phone ?? contact.phone, body.email ?? contact.email ?? undefined, id);

    if (body.stage && body.stage !== contact.stage) {
      await this.ensureStageChangeAllowed(id, body.stage);
    }

    const company = Object.prototype.hasOwnProperty.call(rawBody, "company") ? await this.upsertCompanyByName(body.company) : undefined;
    const firstName = body.firstName ?? contact.firstName;
    const lastName = Object.prototype.hasOwnProperty.call(rawBody, "lastName") ? optionalText(body.lastName) : contact.lastName;
    const update: Record<string, unknown> = { updatedAt: nowIso() };

    if (body.firstName !== undefined || Object.prototype.hasOwnProperty.call(rawBody, "lastName")) {
      update.firstName = firstName.trim();
      update.lastName = lastName;
      update.fullName = contactFullName(firstName.trim(), lastName);
    }
    if (body.phone !== undefined) {
      update.phone = body.phone.trim();
      update.normalizedPhone = normalizePhone(body.phone);
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, "email")) update.email = normalizeEmail(body.email);
    if (Object.prototype.hasOwnProperty.call(rawBody, "source")) update.source = optionalText(body.source);
    if (Object.prototype.hasOwnProperty.call(rawBody, "company")) {
      update.company = optionalText(body.company);
      update.companyId = company?.id ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(rawBody, "locationText")) update.locationText = optionalText(body.locationText);
    if (Object.prototype.hasOwnProperty.call(rawBody, "area")) update.area = optionalText(body.area);
    if (Object.prototype.hasOwnProperty.call(rawBody, "mapUrl")) update.mapUrl = optionalText(body.mapUrl);
    if (Object.prototype.hasOwnProperty.call(rawBody, "placeLabel")) update.placeLabel = optionalText(body.placeLabel);
    if (body.stage !== undefined) update.stage = body.stage;
    if (body.expectedDealValue !== undefined) update.expectedDealValue = body.expectedDealValue;
    if (Object.prototype.hasOwnProperty.call(rawBody, "lastContactedAt")) update.lastContactedAt = body.lastContactedAt ? parseDate(body.lastContactedAt, "lastContactedAt") : null;
    if (Object.prototype.hasOwnProperty.call(rawBody, "nextFollowUpAt")) update.nextFollowUpAt = body.nextFollowUpAt ? parseDate(body.nextFollowUpAt, "nextFollowUpAt") : null;
    if (body.isWhatsappOptedIn !== undefined) update.isWhatsappOptedIn = Boolean(body.isWhatsappOptedIn);
    if (body.tags !== undefined) update.tags = uniqueTags(body.tags);

    const updated = await this.repo.updateContact(id, update);
    if (!updated) throw new HttpError("Contact not found", 404);

    if (body.notes?.trim()) {
      await this.repo.createNote({ id: createId(), contactId: id, body: body.notes.trim(), createdAt: nowIso() });
    }

    if (updated.stage === "LOST" && contact.stage !== "LOST") {
      await this.applyLostContactState(id);
    }

    await this.createActivity(id, "CONTACT_UPDATED", { changes: body });
    return serializeContact(updated, company ?? (updated.companyId ? await this.repo.companyById(updated.companyId) : null));
  }

  async updateStage(id: string, stage: string) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = pipelineStageSchema.safeParse(stage);
    if (!parsed.success) throw new HttpError("Invalid stage", 400, parsed.error.flatten());

    const existing = await this.ensureStageChangeAllowed(id, parsed.data);
    const updated = await this.repo.updateContact(id, {
      stage: parsed.data,
      nextFollowUpAt: parsed.data === "LOST" ? null : existing.nextFollowUpAt,
      updatedAt: nowIso(),
    });
    if (!updated) throw new HttpError("Contact not found", 404);

    if (parsed.data === "LOST") await this.applyLostContactState(id);
    await this.createActivity(id, "STAGE_CHANGED", { stage: parsed.data });
    return serializeContact(updated, updated.companyId ? await this.repo.companyById(updated.companyId) : null);
  }

  async bulkStage(request: Request) {
    requireMinimumRole(this.user, ["SALES_MANAGER", "ADMIN"]);
    const body = (await readJsonBody(request)) as { ids?: unknown; stage?: unknown };
    if (!Array.isArray(body.ids) || typeof body.stage !== "string") throw new HttpError("Invalid bulk stage payload", 400);
    const parsedStage = pipelineStageSchema.safeParse(body.stage);
    if (!parsedStage.success) throw new HttpError("Invalid stage", 400);
    const updatedIds: string[] = [];
    const rejected: Array<{ id: string; reason: string }> = [];

    for (const id of body.ids.map(String)) {
      try {
        await this.updateStage(id, parsedStage.data);
        updatedIds.push(id);
      } catch (error) {
        rejected.push({ id, reason: error instanceof Error ? error.message : "Stage update rejected" });
      }
    }

    return { updatedCount: updatedIds.length, stage: parsedStage.data, rejected };
  }

  async bulkTags(request: Request) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const body = (await readJsonBody(request)) as { ids?: unknown; tags?: unknown };
    if (!Array.isArray(body.ids) || !Array.isArray(body.tags)) throw new HttpError("Invalid bulk tags payload", 400);
    const tags = body.tags.map(String).map((tag) => tag.trim()).filter(Boolean);
    if (!tags.length) throw new HttpError("At least one tag is required", 400);
    let updatedCount = 0;

    for (const id of body.ids.map(String)) {
      const contact = await this.repo.contactById(id);
      if (!contact) continue;
      await this.repo.updateContact(id, { tags: uniqueTags([...splitTags(contact.tags), ...tags]), updatedAt: nowIso() });
      updatedCount += 1;
    }

    return { updatedCount, tags };
  }

  async createNote(request: Request, contactId: string) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const body = (await readJsonBody(request)) as { body?: unknown };
    const noteBody = typeof body.body === "string" ? body.body.trim() : "";
    if (noteBody.length < 2 || noteBody.length > 2000) throw new HttpError("Invalid note body", 400);
    const contact = await this.repo.contactById(contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    const note = await this.repo.createNote({ id: createId(), contactId, body: noteBody, createdAt: nowIso() });
    await this.createActivity(contactId, "NOTE_CREATED", { noteId: note.id });
    return note;
  }

  private async upsertCompanyByName(name?: string | null): Promise<CompanyRow | null> {
    const trimmed = optionalText(name);
    if (!trimmed) return null;
    const existing = await this.repo.companyByName(trimmed);
    if (existing) return existing;
    const timestamp = nowIso();
    return this.repo.createCompany({ id: createId(), name: trimmed, industry: null, website: null, notes: null, createdAt: timestamp, updatedAt: timestamp });
  }

  private async assertUniqueIdentity(phone?: string | null, email?: string | null, excludeContactId?: string): Promise<void> {
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedPhone && !normalizedEmail) return;

    const contacts = await this.repo.contacts();
    for (const contact of contacts) {
      if (excludeContactId && contact.id === excludeContactId) continue;
      if (normalizedPhone && normalizePhone(contact.normalizedPhone || contact.phone) === normalizedPhone) {
        throw new HttpError(`A contact with this phone already exists: ${contact.fullName}.`, 409);
      }
      if (normalizedEmail && normalizeEmail(contact.email) === normalizedEmail) {
        throw new HttpError(`A contact with this email already exists: ${contact.fullName}.`, 409);
      }
    }
  }

  private async ensureStageChangeAllowed(contactId: string, stage: string): Promise<ContactRow> {
    const contact = await this.repo.contactById(contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    const [tasks, payments, deals] = await Promise.all([this.repo.tasks([{ column: "contactId", value: contactId }, { column: "status", value: "PENDING" }]), this.repo.paymentsByContact(contactId), this.repo.dealsByContact(contactId)]);
    const hasPendingTouchTask = tasks.some((task) => CONTACT_TOUCH_TASK_TYPES.includes(task.type as never));
    const hasExplicitNextAction = Boolean(contact.nextFollowUpAt) || hasPendingTouchTask;
    const hasCommercialProof = deals.some((deal) => deal.stage === "WON" && Number(deal.amount) > 0) || payments.some((payment) => COMMERCIAL_PAYMENT_STATUSES.has(payment.status));

    if (STAGES_REQUIRING_NEXT_ACTION.has(stage) && !hasExplicitNextAction) {
      throw new HttpError("This stage requires a scheduled next action. Create a follow-up or task first.", 409);
    }

    if (stage === "CLIENT" && !hasCommercialProof) {
      throw new HttpError("Move a contact to CLIENT only after a won deal or a scheduled payment exists.", 409);
    }

    return contact;
  }

  private async applyLostContactState(contactId: string): Promise<void> {
    await this.repo.updateTasks(
      [
        { column: "contactId", value: contactId },
        { column: "status", value: "PENDING" },
        { column: "type", op: "in", value: [...CONTACT_TOUCH_TASK_TYPES] },
      ],
      { status: "CANCELLED", updatedAt: nowIso() },
    );
    await this.repo.updateContact(contactId, { nextFollowUpAt: null, updatedAt: nowIso() });
  }

  private async createActivity(contactId: string, kind: string, meta?: unknown): Promise<void> {
    await this.repo.createActivity({ id: createId(), contactId, kind, meta: meta ?? null, createdAt: nowIso() }).catch(() => null);
  }
}
