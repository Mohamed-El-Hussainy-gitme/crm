import { jsonResponse } from "../common/http.js";
import { requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { dateAtEndOfDay, dateAtStartOfDay, parsePositiveInt } from "../core/utils.js";
import { paymentRuntimeStatus } from "../core/business.js";

export async function handleNotificationsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "notifications") return null;
  await requireUser(request, env);
  const url = new URL(request.url);
  const limit = parsePositiveInt(url.searchParams.get("limit"), 50, 200);
  const now = new Date();
  const startOfDay = dateAtStartOfDay(now);
  const endOfDay = dateAtEndOfDay(now);
  const staleBefore = new Date(Date.now() - 3 * 86400000);
  const repo = new CoreRepository(env);
  const [tasks, payments, contacts, broadcasts] = await Promise.all([repo.tasks(), repo.payments(), repo.contacts(), repo.broadcasts()]);
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const dueToday = tasks.filter((task) => task.status === "PENDING" && new Date(task.dueAt).getTime() >= startOfDay.getTime() && new Date(task.dueAt).getTime() <= endOfDay.getTime()).slice(0, limit);
  const overdueTasks = tasks.filter((task) => task.status === "PENDING" && new Date(task.dueAt).getTime() < startOfDay.getTime()).slice(0, limit);
  const paymentAlerts = payments.filter((payment) => paymentRuntimeStatus(payment) === "OVERDUE").slice(0, limit);
  const staleContacts = contacts.filter((contact) => !["CLIENT", "LOST"].includes(contact.stage) && (!contact.lastContactedAt || new Date(contact.lastContactedAt).getTime() < staleBefore.getTime())).slice(0, limit);
  const queuedBroadcasts = broadcasts.filter((broadcast) => broadcast.status === "QUEUED").slice(0, limit);
  const items = [
    ...overdueTasks.map((task) => ({ id: `task-overdue-${task.id}`, kind: "TASK_OVERDUE", severity: "high", title: task.title, subtitle: contactsById.get(task.contactId ?? "")?.fullName ?? "Unassigned contact", dueAt: task.dueAt, contactId: task.contactId, taskId: task.id })),
    ...dueToday.map((task) => ({ id: `task-today-${task.id}`, kind: "TASK_DUE_TODAY", severity: "medium", title: task.title, subtitle: contactsById.get(task.contactId ?? "")?.fullName ?? "Unassigned contact", dueAt: task.dueAt, contactId: task.contactId, taskId: task.id })),
    ...paymentAlerts.map((payment) => ({ id: `payment-${payment.id}`, kind: "PAYMENT_ALERT", severity: "high", title: payment.label, subtitle: contactsById.get(payment.contactId)?.fullName ?? "Unknown contact", dueAt: payment.dueDate, contactId: payment.contactId, paymentId: payment.id, amount: payment.amount, status: paymentRuntimeStatus(payment) })),
    ...staleContacts.map((contact) => ({ id: `contact-stale-${contact.id}`, kind: "CONTACT_STALE", severity: "medium", title: contact.fullName, subtitle: contact.company ?? "No company", dueAt: contact.lastContactedAt, contactId: contact.id, stage: contact.stage })),
    ...queuedBroadcasts.map((broadcast) => ({ id: `broadcast-${broadcast.id}`, kind: "BROADCAST_QUEUED", severity: "low", title: broadcast.name, subtitle: broadcast.templateName ?? "Manual local execution", dueAt: broadcast.scheduledAt, broadcastId: broadcast.id })),
  ].sort((a, b) => {
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
  return jsonResponse({ counts: { total: items.length, overdueTasks: overdueTasks.length, dueToday: dueToday.length, paymentAlerts: paymentAlerts.length, staleContacts: staleContacts.length, queuedBroadcasts: queuedBroadcasts.length }, items });
}
