import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createActivity } from "../activities/service.js";
import { resolveBroadcastAudience } from "./service.js";
import { buildWhatsappLink } from "../../lib/whatsapp.js";

const filterSchema = z.object({
  stages: z
    .array(
      z.enum([
        "LEAD",
        "INTERESTED",
        "POTENTIAL",
        "VISIT",
        "FREE_TRIAL",
        "CLIENT",
        "ON_HOLD",
        "LOST",
      ]),
    )
    .optional(),
  optedInOnly: z.boolean().optional().default(true),
  overduePaymentsOnly: z.boolean().optional().default(false),
  withoutNextAction: z.boolean().optional().default(false),
  inactiveDays: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
});

export async function broadcastRoutes(app: FastifyInstance) {
  app.get("/broadcasts", { preHandler: [app.authenticate] }, async () => {
    return prisma.broadcast.findMany({
      include: { audience: { include: { contact: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post(
    "/broadcasts/preview",
    { preHandler: [app.authenticate] },
    async (request) => {
      const filters = filterSchema.parse(request.body);
      const audience = await resolveBroadcastAudience(filters);
      return {
        count: audience.length,
        contacts: audience.map((contact) => ({
          id: contact.id,
          fullName: contact.fullName,
          phone: contact.phone,
          stage: contact.stage,
          whatsappUrl: buildWhatsappLink(contact.phone),
        })),
      };
    },
  );

  app.post(
    "/broadcasts",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = z
        .object({
          name: z.string().min(3).max(140),
          description: z.string().max(1000).optional(),
          content: z.string().min(3).max(5000),
          templateName: z.string().max(120).optional(),
          scheduledAt: z.string().datetime().optional(),
          filters: filterSchema,
        })
        .parse(request.body);

      const audience = await resolveBroadcastAudience(body.filters);

      const broadcast = await prisma.broadcast.create({
        data: {
          name: body.name,
          description: body.description,
          content: body.content,
          templateName: body.templateName,
          filters: body.filters,
          status: body.scheduledAt ? "QUEUED" : "DRAFT",
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          audience: {
            createMany: {
              data: audience.map((contact) => ({ contactId: contact.id })),
            },
          },
        },
        include: { audience: true },
      });

      for (const contact of audience) {
        await createActivity(contact.id, "ADDED_TO_BROADCAST", {
          broadcastId: broadcast.id,
          name: broadcast.name,
        });
      }

      return reply.code(201).send({
        ...broadcast,
        executionMode: "manual-local",
        note: body.scheduledAt
          ? "Broadcast saved locally. Automatic scheduling is disabled in the local profile."
          : "Broadcast draft saved locally.",
      });
    },
  );

  app.post(
    "/broadcasts/:id/execute",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const broadcast = await prisma.broadcast.findUnique({
        where: { id },
        include: { audience: { include: { contact: true } } },
      });

      if (!broadcast) return reply.notFound("Broadcast not found");

      await prisma.broadcast.update({
        where: { id },
        data: { status: "PROCESSING" },
      });

      for (const item of broadcast.audience) {
        const result = {
          provider: "DEEP_LINK",
          status: "LINK_ONLY",
          url: buildWhatsappLink(item.contact.phone, broadcast.content),
        };

        await prisma.broadcastAudience.update({
          where: { id: item.id },
          data: { sentAt: new Date(), deliveryNote: JSON.stringify(result) },
        });
        await createActivity(item.contactId, "BROADCAST_SENT", {
          broadcastId: id,
          result,
        });
      }

      const updated = await prisma.broadcast.update({
        where: { id },
        data: { status: "COMPLETED" },
      });
      return reply.send(updated);
    },
  );
}
