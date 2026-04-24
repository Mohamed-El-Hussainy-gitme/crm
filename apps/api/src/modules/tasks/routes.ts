import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createTaskSchema, completeScheduledContactSchema } from "@smartcrm/shared";
import { prisma } from "../../lib/prisma.js";
import { createActivity } from "../activities/service.js";
import {
  requiresContactTouch,
  syncContactNextFollowUp,
  touchContact,
} from "../../lib/workflow.js";

export async function taskRoutes(app: FastifyInstance) {
  app.get("/tasks", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({ status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]).optional() })
      .parse(request.query);
    return prisma.task.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: { contact: true, owner: { select: { fullName: true } } },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    });
  });

  app.post("/tasks", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createTaskSchema.parse(request.body);
    const contact = await prisma.contact.findUnique({ where: { id: body.contactId } });
    if (!contact) return reply.notFound("Contact not found");

    const task = await prisma.task.create({
      data: {
        contactId: body.contactId,
        ownerId: body.ownerId ?? request.user?.sub,
        title: body.title,
        description: body.description,
        type: body.type,
        priority: body.priority,
        dueAt: new Date(body.dueAt),
        hasExactTime: body.hasExactTime ?? false,
        durationMins: body.durationMins,
      },
      include: { contact: true, owner: { select: { fullName: true } } },
    });

    if (task.contactId && requiresContactTouch(task.type)) {
      await syncContactNextFollowUp(task.contactId);
    }

    await createActivity(body.contactId, "TASK_CREATED", {
      taskId: task.id,
      title: task.title,
      type: task.type,
      hasExactTime: task.hasExactTime,
      durationMins: task.durationMins,
    });
    return reply.code(201).send(task);
  });

  app.patch("/tasks/:id/complete", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = completeScheduledContactSchema.parse(request.body ?? {});
    const task = await prisma.task
      .update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          completionResult: body.result ?? null,
        },
        include: { contact: true, owner: { select: { fullName: true } } },
      })
      .catch(() => null);

    if (!task) return reply.notFound("Task not found");
    if (task.contactId) {
      if (requiresContactTouch(task.type)) {
        await touchContact(task.contactId, task.completedAt ?? new Date());
        await syncContactNextFollowUp(task.contactId);
      }
      await createActivity(task.contactId, "TASK_COMPLETED", {
        taskId: task.id,
        title: task.title,
        type: task.type,
        result: task.completionResult,
      });
    }
    return task;
  });
}
