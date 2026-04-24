import { completeScheduledContactSchema, createTaskSchema, rescheduleTaskSchema, updateTaskStatusSchema } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { readJsonBody } from "../common/validation.js";
import type { BackendEnv } from "../app.js";
import type { AuthUser } from "../auth/types.js";
import { CoreRepository } from "../core/repository.js";
import type { ContactRow, TaskRow, UserProfileRow } from "../core/types.js";
import { CONTACT_TOUCH_TASK_TYPES, createId, nowIso, parseDate, requireMinimumRole, requiresContactTouch, serializeTask } from "../core/utils.js";

export class TasksService {
  private readonly repo: CoreRepository;

  constructor(env: BackendEnv, private readonly user: AuthUser) {
    this.repo = new CoreRepository(env);
  }

  async list(request: Request) {
    const status = new URL(request.url).searchParams.get("status");
    const filters = status ? [{ column: "status", value: status }] : [];
    const tasks = await this.repo.tasks(filters);
    return this.hydrateTasks(tasks);
  }

  async create(request: Request) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = createTaskSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid task payload", 400, parsed.error.flatten());
    const body = parsed.data;
    const contact = await this.repo.contactById(body.contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    const timestamp = nowIso();

    const task = await this.repo.createTask({
      id: createId(),
      contactId: body.contactId,
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

    if (task.contactId && requiresContactTouch(task.type)) await this.syncContactNextFollowUp(task.contactId);
    await this.createActivity(body.contactId, "TASK_CREATED", { taskId: task.id, title: task.title, type: task.type, hasExactTime: task.hasExactTime, durationMins: task.durationMins });
    return (await this.hydrateTasks([task]))[0] ?? task;
  }

  async complete(request: Request, id: string) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = completeScheduledContactSchema.safeParse(await this.readOptionalBody(request));
    if (!parsed.success) throw new HttpError("Invalid completion payload", 400, parsed.error.flatten());
    const completedAt = nowIso();
    const task = await this.repo.updateTask(id, {
      status: "COMPLETED",
      completedAt,
      completionResult: parsed.data.result ?? null,
      updatedAt: completedAt,
    });
    if (!task) throw new HttpError("Task not found", 404);

    if (task.contactId) {
      if (requiresContactTouch(task.type)) {
        await this.touchContact(task.contactId, completedAt);
        await this.syncContactNextFollowUp(task.contactId);
      }
      await this.createActivity(task.contactId, "TASK_COMPLETED", { taskId: task.id, title: task.title, type: task.type, result: task.completionResult });
    }

    return (await this.hydrateTasks([task]))[0] ?? task;
  }

  async reschedule(request: Request, id: string) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = rescheduleTaskSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid reschedule payload", 400, parsed.error.flatten());
    const task = await this.repo.updateTask(id, {
      dueAt: parseDate(parsed.data.dueAt, "dueAt"),
      status: "PENDING",
      hasExactTime: parsed.data.hasExactTime ?? false,
      updatedAt: nowIso(),
    });
    if (!task) throw new HttpError("Task not found", 404);
    if (task.contactId) {
      if (requiresContactTouch(task.type)) await this.syncContactNextFollowUp(task.contactId);
      await this.createActivity(task.contactId, "TASK_RESCHEDULED", { taskId: task.id, dueAt: task.dueAt, type: task.type, hasExactTime: task.hasExactTime });
    }
    return (await this.hydrateTasks([task]))[0] ?? task;
  }

  async updateStatus(request: Request, id: string) {
    requireMinimumRole(this.user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const parsed = updateTaskStatusSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid task status payload", 400, parsed.error.flatten());
    const completedAt = parsed.data.status === "COMPLETED" ? nowIso() : null;
    const task = await this.repo.updateTask(id, {
      status: parsed.data.status,
      completedAt,
      completionResult: parsed.data.status === "COMPLETED" ? parsed.data.result ?? null : null,
      updatedAt: nowIso(),
    });
    if (!task) throw new HttpError("Task not found", 404);

    if (task.contactId) {
      if (parsed.data.status === "COMPLETED" && requiresContactTouch(task.type)) await this.touchContact(task.contactId, completedAt ?? nowIso());
      if (requiresContactTouch(task.type)) await this.syncContactNextFollowUp(task.contactId);
      await this.createActivity(task.contactId, `TASK_${parsed.data.status}`, { taskId: task.id, title: task.title, type: task.type, result: task.completionResult });
    }

    return (await this.hydrateTasks([task]))[0] ?? task;
  }

  async createFollowUpForContact(request: Request, contactId: string) {
    const body = await readJsonBody(request);
    const parsed = createTaskSchema.omit({ contactId: true }).safeParse(body);
    if (!parsed.success) throw new HttpError("Invalid follow-up payload", 400, parsed.error.flatten());
    return this.create(new Request(request.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId, ...parsed.data }) }));
  }

  async syncContactNextFollowUp(contactId: string) {
    const tasks = await this.repo.tasks([
      { column: "contactId", value: contactId },
      { column: "status", value: "PENDING" },
      { column: "type", op: "in", value: [...CONTACT_TOUCH_TASK_TYPES] },
    ], [{ column: "dueAt", ascending: true }], 1);
    await this.repo.updateContact(contactId, { nextFollowUpAt: tasks[0]?.dueAt ?? null, updatedAt: nowIso() }).catch(() => null);
  }

  async touchContact(contactId: string, touchedAt = nowIso()) {
    await this.repo.updateContact(contactId, { lastContactedAt: touchedAt, updatedAt: nowIso() }).catch(() => null);
  }

  private async hydrateTasks(tasks: TaskRow[]) {
    const contactIds = Array.from(new Set(tasks.map((task) => task.contactId).filter((id): id is string => Boolean(id))));
    const ownerIds = Array.from(new Set(tasks.map((task) => task.ownerId).filter((id): id is string => Boolean(id))));
    const contacts = contactIds.length ? await Promise.all(contactIds.map((id) => this.repo.contactById(id))) : [];
    const users = ownerIds.length ? await this.repo.users([{ column: "id", op: "in", value: ownerIds }]) : [];
    const contactById = new Map(contacts.filter((contact): contact is ContactRow => Boolean(contact)).map((contact) => [contact.id, contact]));
    const userById = new Map(users.map((user: UserProfileRow) => [user.id, user]));
    return tasks.map((task) => serializeTask(task, task.contactId ? contactById.get(task.contactId) ?? null : null, task.ownerId ? userById.get(task.ownerId) ?? null : null));
  }

  private async createActivity(contactId: string, kind: string, meta?: unknown): Promise<void> {
    await this.repo.createActivity({ id: createId(), contactId, kind, meta: meta ?? null, createdAt: nowIso() }).catch(() => null);
  }

  private async readOptionalBody(request: Request): Promise<unknown> {
    const clone = request.clone();
    const text = await clone.text();
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new HttpError("Invalid JSON request body", 400);
    }
  }
}
