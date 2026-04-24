import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { requireRole } from "../../lib/authz.js";
import { writeAuditLog } from "../../lib/audit.js";

async function runAutomations(currentUser: { sub?: string; email?: string } | undefined) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const overduePayments = await prisma.paymentInstallment.updateMany({ where: { status: "PENDING", dueDate: { lt: now } }, data: { status: "OVERDUE" } });
  const staleContacts = await prisma.contact.findMany({
    where: {
      stage: { notIn: ["CLIENT", "LOST"] },
      OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: staleBefore } }],
      tasks: { none: { status: "PENDING" } },
    },
    take: 25,
  });

  let createdTasks = 0;
  for (const contact of staleContacts) {
    const dueAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    await prisma.task.create({
      data: {
        contactId: contact.id,
        ownerId: contact.ownerId ?? undefined,
        title: `Re-engage ${contact.fullName}`,
        description: "Auto-generated because no recent activity was detected.",
        type: "FOLLOW_UP",
        priority: "HIGH",
        dueAt,
      },
    });
    await prisma.contact.update({ where: { id: contact.id }, data: { nextFollowUpAt: dueAt } });
    createdTasks += 1;
  }

  const summary = `Marked ${overduePayments.count} payments overdue and created ${createdTasks} stale-contact follow-ups.`;
  const run = await prisma.automationRun.create({
    data: {
      kind: "LOCAL_DAILY_AUTOMATIONS",
      status: "SUCCESS",
      summary,
      meta: { overduePayments: overduePayments.count, createdTasks } as any,
    },
  });

  await writeAuditLog({ actorId: currentUser?.sub, actorEmail: currentUser?.email, action: "AUTOMATIONS_RUN", entityType: "automation", entityId: run.id, after: { summary, overduePayments: overduePayments.count, createdTasks } });
  return run;
}

export async function automationRoutes(app: FastifyInstance) {
  app.get("/automations", { preHandler: [app.authenticate] }, async () => {
    const runs = await prisma.automationRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return { runs };
  });

  app.post("/automations/run", { preHandler: [app.authenticate, requireRole("SALES_MANAGER")] }, async (request) => {
    const user = request.user;
    return runAutomations(user);
  });
}
