import { completeScheduledContactSchema, quickFollowUpSchema, rescheduleTaskSchema } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { readJsonBody } from "../common/validation.js";
import type { BackendEnv } from "../app.js";
import type { AuthUser } from "../auth/types.js";
import { CoreRepository } from "../core/repository.js";
import type { ContactRow, TaskRow, UserProfileRow } from "../core/types.js";
import { addDays, CONTACT_TOUCH_TASK_TYPES, createId, dateAtEndOfDay, dateAtStartOfDay, endOfWeek, nowIso, parseDate, requireMinimumRole, requiresContactTouch } from "../core/utils.js";
import { TasksService } from "../tasks/service.js";

function serializeScheduledTask(task: TaskRow, contact?: ContactRow | null, owner?: UserProfileRow | null) {
  return {
    id: task.id,
    source: "TASK" as const,
    entityId: task.id,
    kind: task.type,
    title: task.title,
    dueAt: task.dueAt,
    hasExactTime: task.hasExactTime,
    durationMins: task.durationMins,
    priority: task.priority,
    status: task.status,
    ownerId: task.ownerId,
    ownerName: owner?.fullName ?? null,
    note: task.description,
    contactId: task.contactId,
    contactName: contact?.fullName ?? null,
    company: contact?.company ?? null,
    stage: contact?.stage ?? null,
  };
}

function serializeScheduledContact(contact: ContactRow, reason: { missingSchedule?: boolean; stale?: boolean } = {}) {
  return {
    id: `contact_${contact.id}`,
    source: "CONTACT" as const,
    entityId: contact.id,
    kind: "FOLLOW_UP" as const,
    title: `Follow up with ${contact.fullName}`,
    dueAt: contact.nextFollowUpAt,
    hasExactTime: false,
    durationMins: null,
    priority: "MEDIUM" as const,
    status: "PENDING" as const,
    ownerId: contact.ownerId,
    ownerName: null,
    note: null,
    contactId: contact.id,
    contactName: contact.fullName,
    company: contact.company,
    stage: contact.stage,
    lastContactedAt: contact.lastContactedAt,
    reasons: {
      missingSchedule: Boolean(reason.missingSchedule),
      stale: Boolean(reason.stale),
    },
  };
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isWithin(value: string | null, from: Date, to: Date): boolean {
  if (!value) return false;
  const time = timestamp(value);
  return time >= from.getTime() && time <= to.getTime();
}

export class FollowUpsService {
  private readonly repo: CoreRepository;

  constructor(private readonly env: BackendEnv, private readonly user: AuthUser) {
    this.repo = new CoreRepository(env);
  }

  async overview(request: Request) {
    const staleDaysRaw = new URL(request.url).searchParams.get("staleDays");
    const staleDays = staleDaysRaw ? Math.min(Math.max(Number.parseInt(staleDaysRaw, 10) || 3, 1), 60) : 3;
    const now = new Date();
    const todayStart = dateAtStartOfDay(now);
    const todayEnd = dateAtEndOfDay(now);
    const tomorrowStart = dateAtStartOfDay(addDays(now, 1));
    const tomorrowEnd = dateAtEndOfDay(addDays(now, 1));
    const weekEnd = endOfWeek(now);
    const staleBefore = now.getTime() - staleDays * 86400000;

    const [tasks, contacts, payments, users] = await Promise.all([
      this.repo.tasks([{ column: "status", value: "PENDING" }, { column: "dueAt", op: "lte", value: weekEnd.toISOString() }], [{ column: "dueAt", ascending: true }], 300),
      this.repo.contacts([], [{ column: "updatedAt", ascending: false }], 1000),
      this.repo.payments([], [{ column: "dueDate", ascending: true }], 200),
      this.repo.users([], 1000),
    ]);

    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    const usersById = new Map(users.map((user) => [user.id, user]));
    const pendingTouchContactIds = new Set(tasks.filter((task) => task.contactId && CONTACT_TOUCH_TASK_TYPES.includes(task.type as never)).map((task) => task.contactId as string));

    const orphanContacts = contacts.filter((contact) => contact.nextFollowUpAt && !tasks.some((task) => task.contactId === contact.id && isWithin(task.dueAt, todayStart, weekEnd)));
    const orphanToday = orphanContacts.filter((contact) => isWithin(contact.nextFollowUpAt, todayStart, todayEnd));
    const orphanTomorrow = orphanContacts.filter((contact) => isWithin(contact.nextFollowUpAt, tomorrowStart, tomorrowEnd));
    const orphanWeek = orphanContacts.filter((contact) => contact.nextFollowUpAt && timestamp(contact.nextFollowUpAt) > tomorrowEnd.getTime() && timestamp(contact.nextFollowUpAt) <= weekEnd.getTime());

    const taskItem = (task: TaskRow) => serializeScheduledTask(task, task.contactId ? contactsById.get(task.contactId) ?? null : null, task.ownerId ? usersById.get(task.ownerId) ?? null : null);
    const overdue = tasks.filter((task) => timestamp(task.dueAt) < todayStart.getTime()).map(taskItem);
    const today = [...tasks.filter((task) => isWithin(task.dueAt, todayStart, todayEnd)).map(taskItem), ...orphanToday.map((contact) => serializeScheduledContact(contact))];
    const tomorrow = [...tasks.filter((task) => isWithin(task.dueAt, tomorrowStart, tomorrowEnd)).map(taskItem), ...orphanTomorrow.map((contact) => serializeScheduledContact(contact))];
    const thisWeek = [...tasks.filter((task) => timestamp(task.dueAt) > tomorrowEnd.getTime() && timestamp(task.dueAt) <= weekEnd.getTime()).map(taskItem), ...orphanWeek.map((contact) => serializeScheduledContact(contact))];

    const noNextAction = contacts.filter((contact) => !["CLIENT", "LOST"].includes(contact.stage) && (!contact.nextFollowUpAt || !pendingTouchContactIds.has(contact.id)));
    const staleContacts = contacts.filter((contact) => !["CLIENT", "LOST"].includes(contact.stage) && (!contact.lastContactedAt || timestamp(contact.lastContactedAt) < staleBefore));
    const unscheduledMap = new Map<string, ReturnType<typeof serializeScheduledContact>>();
    for (const contact of noNextAction) unscheduledMap.set(contact.id, serializeScheduledContact(contact, { missingSchedule: true }));
    for (const contact of staleContacts) {
      const existing = unscheduledMap.get(contact.id);
      if (existing) {
        existing.reasons.stale = true;
        existing.lastContactedAt = contact.lastContactedAt;
      } else {
        unscheduledMap.set(contact.id, serializeScheduledContact(contact, { stale: true }));
      }
    }

    const paymentAlerts = payments.filter((payment) => payment.status === "OVERDUE" || (payment.status === "PENDING" && timestamp(payment.dueDate) < now.getTime()));

    return {
      generatedAt: now.toISOString(),
      counts: {
        overdue: overdue.length,
        today: today.length,
        tomorrow: tomorrow.length,
        thisWeek: thisWeek.length,
        unscheduled: unscheduledMap.size,
        paymentAlerts: paymentAlerts.length,
        dueToday: today.filter((item) => item.source === "TASK").length,
        overdueTasks: overdue.length,
        noNextAction: noNextAction.length,
        staleContacts: staleContacts.length,
      },
      overdue,
      today,
      tomorrow,
      thisWeek,
      unscheduled: Array.from(unscheduledMap.values()),
      paymentAlerts,
      dueToday: today.filter((item) => item.source === "TASK"),
      overdueTasks: overdue,
      noNextAction: noNextAction.map((contact) => serializeScheduledContact(contact, { missingSchedule: true })),
      staleContacts: staleContacts.map((contact) => serializeScheduledContact(contact, { stale: true })),
    };
  }

  async createContactFollowUp(request: Request, contactId: string) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = quickFollowUpSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid follow-up payload", 400, parsed.error.flatten());
    const contact = await this.repo.contactById(contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    const timestamp = nowIso();
    const body = parsed.data;
    const task = await this.repo.createTask({
      id: createId(),
      contactId,
      ownerId: body.ownerId ?? this.user.id,
      title: body.title,
      description: body.description ?? null,
      type: body.type,
      priority: body.priority,
      status: "PENDING",
      dueAt: parseDate(body.dueAt, "dueAt"),
      hasExactTime: body.hasExactTime ?? false,
      durationMins: body.durationMins ?? null,
      completionResult: null,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.syncContactNextFollowUp(contactId);
    await this.repo.createActivity({ id: createId(), contactId, kind: "FOLLOW_UP_CREATED", meta: { taskId: task.id, title: task.title, dueAt: task.dueAt, type: task.type }, createdAt: timestamp }).catch(() => null);
    return task;
  }

  async rescheduleTask(request: Request, taskId: string) {
    const tasks = new TasksService(this.env, this.user);
    return tasks.reschedule(request, taskId);
  }

  async updateContactNextFollowUp(request: Request, contactId: string) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = rescheduleTaskSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid next follow-up payload", 400, parsed.error.flatten());
    const updated = await this.repo.updateContact(contactId, { nextFollowUpAt: parseDate(parsed.data.dueAt, "dueAt"), updatedAt: nowIso() });
    if (!updated) throw new HttpError("Contact not found", 404);
    await this.repo.createActivity({ id: createId(), contactId, kind: "FOLLOW_UP_RESCHEDULED", meta: { dueAt: updated.nextFollowUpAt, source: "CONTACT" }, createdAt: nowIso() }).catch(() => null);
    return { id: updated.id, nextFollowUpAt: updated.nextFollowUpAt, hasExactTime: parsed.data.hasExactTime ?? false };
  }

  async completeContactNextFollowUp(request: Request, contactId: string) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = completeScheduledContactSchema.safeParse(await this.readOptionalBody(request));
    if (!parsed.success) throw new HttpError("Invalid completion payload", 400, parsed.error.flatten());
    const completedAt = nowIso();
    const updated = await this.repo.updateContact(contactId, { nextFollowUpAt: null, lastContactedAt: completedAt, updatedAt: completedAt });
    if (!updated) throw new HttpError("Contact not found", 404);
    await this.repo.createActivity({ id: createId(), contactId, kind: "FOLLOW_UP_COMPLETED", meta: { source: "CONTACT", completedAt, result: parsed.data.result }, createdAt: completedAt }).catch(() => null);
    return { id: updated.id, lastContactedAt: updated.lastContactedAt, nextFollowUpAt: updated.nextFollowUpAt };
  }

  private async syncContactNextFollowUp(contactId: string) {
    const tasks = await this.repo.tasks([
      { column: "contactId", value: contactId },
      { column: "status", value: "PENDING" },
      { column: "type", op: "in", value: [...CONTACT_TOUCH_TASK_TYPES] },
    ], [{ column: "dueAt", ascending: true }], 1);
    await this.repo.updateContact(contactId, { nextFollowUpAt: tasks[0]?.dueAt ?? null, updatedAt: nowIso() }).catch(() => null);
  }

  private async readOptionalBody(request: Request): Promise<unknown> {
    const text = await request.clone().text();
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new HttpError("Invalid JSON request body", 400);
    }
  }
}
