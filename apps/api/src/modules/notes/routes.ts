import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createActivity } from "../activities/service.js";

export async function noteRoutes(app: FastifyInstance) {
  app.post("/contacts/:contactId/notes", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ contactId: z.string().cuid() }).parse(request.params);
    const body = z.object({ body: z.string().min(2).max(4000) }).parse(request.body);
    const note = await prisma.note.create({
      data: {
        contactId: params.contactId,
        body: body.body,
      },
    });
    await createActivity(params.contactId, "NOTE_CREATED", { noteId: note.id });
    return reply.code(201).send(note);
  });
}
