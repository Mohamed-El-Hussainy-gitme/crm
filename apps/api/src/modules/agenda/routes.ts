import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  addDays,
  endOfDay,
  endOfWeek,
  loadScheduleWindow,
  serializeScheduledContact,
  serializeScheduledTask,
  startOfDay,
} from "../../lib/scheduling.js";

export async function agendaRoutes(app: FastifyInstance) {
  app.get("/agenda", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        view: z.enum(["day", "week"]).optional().default("week"),
      })
      .parse(request.query);

    const from = query.from
      ? new Date(query.from)
      : startOfDay(new Date());
    const to = query.to
      ? new Date(query.to)
      : query.view === "day"
        ? endOfDay(from)
        : endOfWeek(from);

    const { tasks, payments, contacts } = await loadScheduleWindow(from, to);

    const events = [
      ...tasks.map((task) => ({
        ...serializeScheduledTask(task),
        when: task.dueAt.toISOString(),
        kind: task.type,
      })),
      ...contacts.map((contact) => ({
        ...serializeScheduledContact(contact),
        when: contact.nextFollowUpAt!.toISOString(),
      })),
      ...payments.map((payment) => ({
        id: `payment_${payment.id}`,
        source: "PAYMENT" as const,
        entityId: payment.id,
        kind: "PAYMENT",
        title: payment.label,
        when: payment.dueDate.toISOString(),
        dueAt: payment.dueDate.toISOString(),
        hasExactTime: false,
        durationMins: null,
        priority: payment.status === "OVERDUE" ? "HIGH" : "MEDIUM",
        status: payment.status,
        ownerId: null,
        ownerName: null,
        note: null,
        contactId: payment.contactId,
        contactName: payment.contact.fullName,
        company: payment.contact.company,
        stage: payment.contact.stage,
        amount: payment.amount,
      })),
    ].sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());

    const days = Array.from(
      { length: query.view === "day" ? 1 : Math.max(1, Math.ceil((endOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1) },
      (_, index) => {
        const date = addDays(startOfDay(from), index);
        const key = date.toISOString().slice(0, 10);
        return {
          key,
          label: date.toDateString(),
          slots: events.filter((event) => event.when.slice(0, 10) === key),
        };
      },
    );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      view: query.view,
      total: events.length,
      events,
      days,
    };
  });
}
