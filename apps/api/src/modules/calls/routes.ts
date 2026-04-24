import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createActivity } from "../activities/service.js";

export async function callRoutes(app: FastifyInstance) {
  app.post("/contacts/:contactId/calls", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ contactId: z.string().cuid() }).parse(request.params);
    const body = z.object({
      outcome: z.string().min(2).max(120),
      durationMins: z.number().int().min(0).max(600).default(0),
      summary: z.string().min(2).max(3000),
    }).parse(request.body);

    const call = await prisma.callLog.create({
      data: {
        contactId: params.contactId,
        outcome: body.outcome,
        durationMins: body.durationMins,
        summary: body.summary,
      },
    });

    await prisma.contact.update({
      where: { id: params.contactId },
      data: { lastContactedAt: new Date() },
    });

    await createActivity(params.contactId, "CALL_LOGGED", { callId: call.id, outcome: call.outcome });
    return reply.code(201).send(call);
  });
}
