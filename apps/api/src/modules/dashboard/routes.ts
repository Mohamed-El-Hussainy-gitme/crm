import { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", { preHandler: [app.authenticate] }, async () => {
    const now = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const staleBefore = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const [contacts, tasksToday, overduePayments, pendingTasks, broadcasts, dealsByStage, noNextAction, staleContacts] = await Promise.all([
      prisma.contact.groupBy({ by: ["stage"], _count: { stage: true } }),
      prisma.task.count({ where: { dueAt: { gte: startOfDay, lte: endOfDay }, status: "PENDING" } }),
      prisma.paymentInstallment.count({ where: { OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lt: now } }] } }),
      prisma.task.count({ where: { status: "PENDING" } }),
      prisma.broadcast.count(),
      prisma.deal.groupBy({ by: ["stage"], _count: { stage: true }, _sum: { amount: true } }),
      prisma.contact.count({
        where: {
          stage: { notIn: ["CLIENT", "LOST"] },
          OR: [{ nextFollowUpAt: null }, { tasks: { none: { status: "PENDING" } } }],
        },
      }),
      prisma.contact.count({
        where: {
          stage: { notIn: ["CLIENT", "LOST"] },
          OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: staleBefore } }],
        },
      }),
    ]);

    const stageMap = Object.fromEntries(
      contacts.map((item: { stage: string; _count: { stage: number } }) => [item.stage, item._count.stage]),
    );

    const dealStageMap = Object.fromEntries(
      dealsByStage.map((item: { stage: string; _count: { stage: number } }) => [item.stage, item._count.stage]),
    );

    return {
      stageMap,
      dealStageMap,
      tasksToday,
      overduePayments,
      pendingTasks,
      broadcasts,
      noNextAction,
      staleContacts,
    };
  });
}
