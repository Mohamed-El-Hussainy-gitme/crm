import { jsonResponse } from "../common/http.js";
import { requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { addDays, dateAtEndOfDay, dateAtStartOfDay, endOfWeek, withinRange } from "../core/utils.js";

function eventDate(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function scheduledTask(task: Awaited<ReturnType<CoreRepository["tasks"]>>[number], contact?: Awaited<ReturnType<CoreRepository["contacts"]>>[number] | null) {
  return {
    id: task.id,
    source: "TASK" as const,
    entityId: task.id,
    kind: task.type,
    title: task.title,
    when: task.dueAt,
    dueAt: task.dueAt,
    hasExactTime: task.hasExactTime,
    durationMins: task.durationMins,
    priority: task.priority,
    status: task.status,
    ownerId: task.ownerId,
    ownerName: null,
    note: task.description,
    contactId: task.contactId,
    contactName: contact?.fullName ?? null,
    company: contact?.company ?? null,
    stage: contact?.stage ?? null,
  };
}

export async function handleAgendaRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "agenda") return null;
  await requireUser(request, env);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") === "day" ? "day" : "week";
  const from = url.searchParams.get("from") ? new Date(String(url.searchParams.get("from"))) : dateAtStartOfDay(new Date());
  const to = url.searchParams.get("to") ? new Date(String(url.searchParams.get("to"))) : view === "day" ? dateAtEndOfDay(from) : endOfWeek(from);
  const repo = new CoreRepository(env);
  const [tasks, payments, contacts] = await Promise.all([repo.tasks(), repo.payments(), repo.contacts()]);
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const tasksInRange = tasks.filter((task) => withinRange(task.dueAt, from, to));
  const paymentsInRange = payments.filter((payment) => withinRange(payment.dueDate, from, to));
  const scheduledTaskContactIds = new Set(tasksInRange.map((task) => task.contactId).filter((id): id is string => Boolean(id)));
  const contactsInRange = contacts.filter((contact) => contact.nextFollowUpAt && withinRange(contact.nextFollowUpAt, from, to) && !scheduledTaskContactIds.has(contact.id));
  const events = [
    ...tasksInRange.map((task) => scheduledTask(task, task.contactId ? contactsById.get(task.contactId) ?? null : null)),
    ...contactsInRange.map((contact) => ({ id: `contact_${contact.id}`, source: "CONTACT" as const, entityId: contact.id, kind: "FOLLOW_UP", title: `Follow up with ${contact.fullName}`, when: contact.nextFollowUpAt as string, dueAt: contact.nextFollowUpAt, hasExactTime: false, durationMins: null, priority: "MEDIUM", status: "PENDING", ownerId: contact.ownerId, ownerName: null, note: null, contactId: contact.id, contactName: contact.fullName, company: contact.company, stage: contact.stage })),
    ...paymentsInRange.map((payment) => {
      const contact = contactsById.get(payment.contactId);
      return { id: `payment_${payment.id}`, source: "PAYMENT" as const, entityId: payment.id, kind: "PAYMENT", title: payment.label, when: payment.dueDate, dueAt: payment.dueDate, hasExactTime: false, durationMins: null, priority: payment.status === "OVERDUE" ? "HIGH" : "MEDIUM", status: payment.status, ownerId: null, ownerName: null, note: null, contactId: payment.contactId, contactName: contact?.fullName ?? null, company: contact?.company ?? null, stage: contact?.stage ?? null, amount: Number(payment.amount || 0) };
    }),
  ].sort((a, b) => eventDate(a.when) - eventDate(b.when));
  const start = dateAtStartOfDay(from);
  const totalDays = view === "day" ? 1 : Math.max(1, Math.ceil((dateAtEndOfDay(to).getTime() - start.getTime()) / 86400000) + 1);
  const days = Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(start, index);
    const key = date.toISOString().slice(0, 10);
    return { key, label: date.toDateString(), slots: events.filter((event) => event.when.slice(0, 10) === key) };
  });
  return jsonResponse({ from: from.toISOString(), to: to.toISOString(), view, total: events.length, events, days });
}
