import { FastifyInstance } from "fastify";
import {
  completeScheduledContactSchema,
  quickFollowUpSchema,
  rescheduleTaskSchema,
  updateTaskStatusSchema,
} from "@smartcrm/shared";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createActivity } from "../activities/service.js";
import { writeAuditLog } from "../../lib/audit.js";
import {
  requiresContactTouch,
  syncContactNextFollowUp,
  touchContact,
} from "../../lib/workflow.js";
import { loadPlannerOverview } from "../../lib/scheduling.js";

export async function followUpRoutes(app: FastifyInstance) {
  app.get(
    "/follow-ups/overview",
    { preHandler: [app.authenticate] },
    async (request) => {
      const query = z
        .object({ staleDays: z.coerce.number().min(1).max(60).default(3) })
        .parse(request.query);
      return loadPlannerOverview(query.staleDays);
    },
  );

  app.post(
    "/contacts/:id/follow-ups",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = quickFollowUpSchema.parse(request.body);
      const contact = await prisma.contact.findUnique({ where: { id } });
      if (!contact) return reply.notFound("Contact not found");

      const dueAt = new Date(body.dueAt);
      const task = await prisma.task.create({
        data: {
          contactId: id,
          ownerId: body.ownerId ?? request.user?.sub,
          title: body.title,
          description: body.description,
          type: body.type,
          priority: body.priority,
          dueAt,
          hasExactTime: body.hasExactTime ?? false,
          durationMins: body.durationMins,
        },
        include: { contact: true, owner: { select: { fullName: true } } },
      });

      await syncContactNextFollowUp(id);

      await createActivity(id, "FOLLOW_UP_CREATED", {
        taskId: task.id,
        title: task.title,
        dueAt: task.dueAt,
        type: task.type,
        hasExactTime: task.hasExactTime,
        durationMins: task.durationMins,
      });
      const user = request.user;
      await writeAuditLog({
        actorId: user?.sub,
        actorEmail: user?.email,
        action: "FOLLOW_UP_CREATED",
        entityType: "task",
        entityId: task.id,
        after: {
          title: task.title,
          dueAt: task.dueAt,
          type: task.type,
          hasExactTime: task.hasExactTime,
          durationMins: task.durationMins,
        },
      });
      return reply.code(201).send(task);
    },
  );

  app.patch(
    "/tasks/:id/reschedule",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = rescheduleTaskSchema.parse(request.body);
      const dueAt = new Date(body.dueAt);
      const task = await prisma.task
        .update({
          where: { id },
          data: {
            dueAt,
            status: "PENDING",
            hasExactTime: body.hasExactTime ?? false,
          },
          include: { contact: true, owner: { select: { fullName: true } } },
        })
        .catch(() => null);
      if (!task) return reply.notFound("Task not found");

      if (task.contactId) {
        if (requiresContactTouch(task.type)) {
          await syncContactNextFollowUp(task.contactId);
        }
        await createActivity(task.contactId, "TASK_RESCHEDULED", {
          taskId: task.id,
          dueAt: task.dueAt,
          type: task.type,
          hasExactTime: task.hasExactTime,
        });
      }
      const user = request.user;
      await writeAuditLog({
        actorId: user?.sub,
        actorEmail: user?.email,
        action: "TASK_RESCHEDULED",
        entityType: "task",
        entityId: task.id,
        after: {
          dueAt: task.dueAt,
          status: task.status,
          hasExactTime: task.hasExactTime,
        },
      });

      return task;
    },
  );

  app.patch(
    "/tasks/:id/status",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = updateTaskStatusSchema.parse(request.body);
      const task = await prisma.task
        .update({
          where: { id },
          data: {
            status: body.status,
            completedAt: body.status === "COMPLETED" ? new Date() : null,
            completionResult: body.status === "COMPLETED" ? body.result ?? null : null,
          },
          include: { contact: true, owner: { select: { fullName: true } } },
        })
        .catch(() => null);
      if (!task) return reply.notFound("Task not found");

      if (task.contactId) {
        if (body.status === "COMPLETED" && requiresContactTouch(task.type)) {
          await touchContact(task.contactId, task.completedAt ?? new Date());
        }
        if (requiresContactTouch(task.type)) {
          await syncContactNextFollowUp(task.contactId);
        }
        await createActivity(task.contactId, `TASK_${body.status}`, {
          taskId: task.id,
          title: task.title,
          type: task.type,
          result: task.completionResult,
        });
      }
      const user = request.user;
      await writeAuditLog({
        actorId: user?.sub,
        actorEmail: user?.email,
        action: "TASK_STATUS_CHANGED",
        entityType: "task",
        entityId: task.id,
        after: {
          status: task.status,
          completedAt: task.completedAt,
          result: task.completionResult,
        },
      });
      return task;
    },
  );

  app.patch(
    "/contacts/:id/next-follow-up",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = rescheduleTaskSchema.parse(request.body);
      const contact = await prisma.contact
        .update({
          where: { id },
          data: { nextFollowUpAt: new Date(body.dueAt) },
          include: { owner: { select: { fullName: true } } },
        })
        .catch(() => null);
      if (!contact) return reply.notFound("Contact not found");

      await createActivity(contact.id, "FOLLOW_UP_RESCHEDULED", {
        dueAt: contact.nextFollowUpAt,
        source: "CONTACT",
      });
      const user = request.user;
      await writeAuditLog({
        actorId: user?.sub,
        actorEmail: user?.email,
        action: "CONTACT_NEXT_FOLLOW_UP_UPDATED",
        entityType: "contact",
        entityId: contact.id,
        after: { nextFollowUpAt: contact.nextFollowUpAt },
      });
      return {
        id: contact.id,
        nextFollowUpAt: contact.nextFollowUpAt?.toISOString() ?? null,
        hasExactTime: body.hasExactTime ?? false,
      };
    },
  );

  app.post(
    "/contacts/:id/next-follow-up/complete",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = completeScheduledContactSchema.parse(request.body ?? {});
      const contact = await prisma.contact.findUnique({ where: { id } });
      if (!contact) return reply.notFound("Contact not found");

      const completedAt = new Date();
      const updated = await prisma.contact.update({
        where: { id },
        data: {
          nextFollowUpAt: null,
          lastContactedAt: completedAt,
        },
      });

      await createActivity(id, "FOLLOW_UP_COMPLETED", {
        source: "CONTACT",
        completedAt,
        result: body.result,
      });
      const user = request.user;
      await writeAuditLog({
        actorId: user?.sub,
        actorEmail: user?.email,
        action: "CONTACT_SCHEDULE_COMPLETED",
        entityType: "contact",
        entityId: updated.id,
        after: {
          lastContactedAt: updated.lastContactedAt,
          nextFollowUpAt: updated.nextFollowUpAt,
          result: body.result,
        },
      });
      return {
        id: updated.id,
        lastContactedAt: updated.lastContactedAt?.toISOString() ?? null,
        nextFollowUpAt: updated.nextFollowUpAt?.toISOString() ?? null,
      };
    },
  );
}
