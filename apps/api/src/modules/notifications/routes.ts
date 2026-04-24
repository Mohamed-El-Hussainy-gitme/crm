import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/notifications", { preHandler: [app.authenticate] }, async (request) => {
    const query = z.object({ limit: z.coerce.number().min(1).max(200).default(50) }).parse(request.query);
    const now = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const staleBefore = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const [dueToday, overdueTasks, paymentAlerts, staleContacts, queuedBroadcasts] = await Promise.all([
      prisma.task.findMany({ where: { status: "PENDING", dueAt: { gte: startOfDay, lte: endOfDay } }, include: { contact: true }, orderBy: { dueAt: "asc" }, take: query.limit }),
      prisma.task.findMany({ where: { status: "PENDING", dueAt: { lt: startOfDay } }, include: { contact: true }, orderBy: { dueAt: "asc" }, take: query.limit }),
      prisma.paymentInstallment.findMany({ where: { OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lt: now } }] }, include: { contact: true }, orderBy: { dueDate: "asc" }, take: query.limit }),
      prisma.contact.findMany({ where: { stage: { notIn: ["CLIENT", "LOST"] }, OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: staleBefore } }] }, orderBy: { updatedAt: "desc" }, take: query.limit }),
      prisma.broadcast.findMany({ where: { status: "QUEUED" }, orderBy: { scheduledAt: "asc" }, take: query.limit }),
    ]);

    const items = [
      ...overdueTasks.map((task: any) => ({ id: `task-overdue-${task.id}`, kind: "TASK_OVERDUE", severity: "high", title: task.title, subtitle: task.contact?.fullName ?? "Unassigned contact", dueAt: task.dueAt, contactId: task.contactId, taskId: task.id })),
      ...dueToday.map((task: any) => ({ id: `task-today-${task.id}`, kind: "TASK_DUE_TODAY", severity: "medium", title: task.title, subtitle: task.contact?.fullName ?? "Unassigned contact", dueAt: task.dueAt, contactId: task.contactId, taskId: task.id })),
      ...paymentAlerts.map((payment: any) => ({ id: `payment-${payment.id}`, kind: "PAYMENT_ALERT", severity: "high", title: payment.label, subtitle: payment.contact.fullName, dueAt: payment.dueDate, contactId: payment.contactId, paymentId: payment.id, amount: payment.amount, status: payment.status })),
      ...staleContacts.map((contact: any) => ({ id: `contact-stale-${contact.id}`, kind: "CONTACT_STALE", severity: "medium", title: contact.fullName, subtitle: contact.company ?? "No company", dueAt: contact.lastContactedAt, contactId: contact.id, stage: contact.stage })),
      ...queuedBroadcasts.map((broadcast: any) => ({ id: `broadcast-${broadcast.id}`, kind: "BROADCAST_QUEUED", severity: "low", title: broadcast.name, subtitle: broadcast.templateName ?? "Manual local execution", dueAt: broadcast.scheduledAt, broadcastId: broadcast.id })),
    ].sort((a, b) => {
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });

    return { counts: { total: items.length, overdueTasks: overdueTasks.length, dueToday: dueToday.length, paymentAlerts: paymentAlerts.length, staleContacts: staleContacts.length, queuedBroadcasts: queuedBroadcasts.length }, items };
  });
}
