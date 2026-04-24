import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createActivity } from "../activities/service.js";
import { writeAuditLog } from "../../lib/audit.js";
import { assertDealWorkflow, promoteContactToClient } from "../../lib/workflow.js";

const dealStageSchema = z.enum(["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ON_HOLD"]);
const createDealSchema = z.object({
  contactId: z.string().cuid(),
  title: z.string().min(3).max(160),
  amount: z.number().nonnegative().default(0),
  probability: z.number().int().min(0).max(100).default(10),
  stage: dealStageSchema.default("NEW"),
  expectedCloseAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
const updateDealSchema = createDealSchema.partial().omit({ contactId: true });

export async function dealRoutes(app: FastifyInstance) {
  app.get("/deals", { preHandler: [app.authenticate] }, async (request) => {
    const query = z.object({
      stage: dealStageSchema.optional(),
      contactId: z.string().cuid().optional(),
      companyId: z.string().cuid().optional(),
      search: z.string().optional(),
    }).parse(request.query);
    return prisma.deal.findMany({
      where: {
        ...(query.stage ? { stage: query.stage } : {}),
        ...(query.contactId ? { contactId: query.contactId } : {}),
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.search ? { OR: [{ title: { contains: query.search } }, { notes: { contains: query.search } }, { contact: { fullName: { contains: query.search } } }] } : {}),
      },
      include: { contact: true, company: true },
      orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
    });
  });

  app.get("/deals/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const deal = await prisma.deal.findUnique({ where: { id }, include: { contact: true, company: true } });
    if (!deal) return reply.notFound("Deal not found");
    return deal;
  });

  app.post("/deals", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createDealSchema.parse(request.body);
    const contact = await prisma.contact.findUnique({ where: { id: body.contactId } });
    if (!contact) return reply.notFound("Contact not found");
    await assertDealWorkflow({ contactId: body.contactId, stage: body.stage, amount: body.amount });

    const created = await prisma.deal.create({
      data: {
        contactId: body.contactId,
        companyId: contact.companyId,
        title: body.title,
        amount: body.amount,
        probability: body.probability,
        stage: body.stage,
        expectedCloseAt: body.expectedCloseAt ? new Date(body.expectedCloseAt) : null,
        notes: body.notes,
      },
      include: { contact: true, company: true },
    });

    if (created.stage === "WON") {
      await promoteContactToClient(created.contactId);
    } else if (["PROPOSAL", "NEGOTIATION"].includes(created.stage) && ["LEAD", "INTERESTED"].includes(contact.stage)) {
      await prisma.contact.update({ where: { id: created.contactId }, data: { stage: "POTENTIAL" } }).catch(() => null);
    }

    await createActivity(body.contactId, "DEAL_CREATED", { dealId: created.id, title: created.title, amount: created.amount, stage: created.stage });
    const user = request.user;
    await writeAuditLog({ actorId: user?.sub, actorEmail: user?.email, action: "DEAL_CREATED", entityType: "deal", entityId: created.id, after: { title: created.title, stage: created.stage, amount: created.amount } });
    return reply.code(201).send(created);
  });

  app.patch("/deals/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = updateDealSchema.parse(request.body);
    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing) return reply.notFound("Deal not found");

    await assertDealWorkflow({
      dealId: id,
      stage: body.stage ?? existing.stage,
      amount: body.amount ?? existing.amount,
    });

    const updated = await prisma.deal.update({
      where: { id },
      data: { ...body, expectedCloseAt: body.expectedCloseAt ? new Date(body.expectedCloseAt) : undefined },
      include: { contact: true, company: true },
    }).catch(() => null);
    if (!updated) return reply.notFound("Deal not found");
    if (updated.stage === "WON") {
      await promoteContactToClient(updated.contactId);
    }
    await createActivity(updated.contactId, "DEAL_UPDATED", { dealId: updated.id, stage: updated.stage, amount: updated.amount });
    const user = request.user;
    await writeAuditLog({ actorId: user?.sub, actorEmail: user?.email, action: "DEAL_UPDATED", entityType: "deal", entityId: updated.id, before: { stage: existing.stage, amount: existing.amount }, after: { stage: updated.stage, amount: updated.amount } });
    return updated;
  });

  app.patch("/deals/:id/stage", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({ stage: dealStageSchema }).parse(request.body);
    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing) return reply.notFound("Deal not found");
    await assertDealWorkflow({ dealId: id, stage: body.stage, amount: existing.amount });
    const updated = await prisma.deal.update({ where: { id }, data: { stage: body.stage }, include: { contact: true, company: true } }).catch(() => null);
    if (!updated) return reply.notFound("Deal not found");
    if (updated.stage === "WON") {
      await promoteContactToClient(updated.contactId);
    }
    await createActivity(updated.contactId, "DEAL_STAGE_CHANGED", { dealId: updated.id, stage: updated.stage });
    const user = request.user;
    await writeAuditLog({ actorId: user?.sub, actorEmail: user?.email, action: "DEAL_STAGE_CHANGED", entityType: "deal", entityId: updated.id, before: { stage: existing.stage }, after: { stage: updated.stage } });
    return updated;
  });

  app.delete("/deals/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const deleted = await prisma.deal.delete({ where: { id } }).catch(() => null);
    if (!deleted) return reply.notFound("Deal not found");
    return reply.code(204).send();
  });
}
