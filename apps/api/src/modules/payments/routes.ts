import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createActivity } from "../activities/service.js";
import { promoteContactToClient, resolvePaymentStatus } from "../../lib/workflow.js";

export async function paymentRoutes(app: FastifyInstance) {
  app.get("/payments", { preHandler: [app.authenticate] }, async () => {
    return prisma.paymentInstallment.findMany({
      include: { contact: true },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    });
  });

  app.post("/contacts/:contactId/payments", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ contactId: z.string().cuid() }).parse(request.params);
    const body = z.object({
      label: z.string().min(2).max(160),
      amount: z.number().positive(),
      dueDate: z.string().datetime(),
    }).parse(request.body);

    const contact = await prisma.contact.findUnique({ where: { id: params.contactId } });
    if (!contact) return reply.notFound("Contact not found");

    const dueDate = new Date(body.dueDate);
    const payment = await prisma.paymentInstallment.create({
      data: {
        contactId: params.contactId,
        label: body.label,
        amount: body.amount,
        dueDate,
        status: resolvePaymentStatus(dueDate),
      },
    });
    await createActivity(params.contactId, "PAYMENT_SCHEDULED", { paymentId: payment.id, amount: body.amount, status: payment.status });
    return reply.code(201).send(payment);
  });

  app.patch("/payments/:id/mark-paid", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const payment = await prisma.paymentInstallment.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date() },
      include: { contact: true },
    }).catch(() => null);

    if (!payment) return reply.notFound("Payment installment not found");
    await promoteContactToClient(payment.contactId);
    await createActivity(payment.contactId, "PAYMENT_PAID", { paymentId: payment.id, amount: payment.amount.toString() });
    return payment;
  });
}
