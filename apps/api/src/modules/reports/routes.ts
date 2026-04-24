import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

function csvEscape(value: string | number | null | undefined) {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export async function reportRoutes(app: FastifyInstance) {
  app.get("/reports/overview", { preHandler: [app.authenticate] }, async (request) => {
    const query = z.object({ rangeDays: z.coerce.number().min(1).max(365).default(30) }).parse(request.query);
    const rangeStart = new Date(Date.now() - query.rangeDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [
      contactsByStage,
      contactsBySource,
      dealsByStage,
      overdueTasks,
      tasksDone,
      openDeals,
      wonDeals,
      overduePayments,
      noNextActionCount,
      staleContactsCount,
      companiesCount,
      activeContactsCount,
      contactsCreatedInRange,
      dueTasksNext7Days,
      upcomingPayments,
    ] = await Promise.all([
      prisma.contact.groupBy({ by: ["stage"], _count: { stage: true } }),
      prisma.contact.groupBy({ by: ["source"], _count: { source: true } }),
      prisma.deal.groupBy({ by: ["stage"], _count: { stage: true }, _sum: { amount: true } }),
      prisma.task.count({ where: { status: "PENDING", dueAt: { lt: now } } }),
      prisma.task.count({ where: { status: "COMPLETED", completedAt: { gte: rangeStart } } }),
      prisma.deal.aggregate({ where: { stage: { notIn: ["WON", "LOST"] } }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.deal.aggregate({ where: { stage: "WON", updatedAt: { gte: rangeStart } }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.paymentInstallment.aggregate({ where: { OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lt: now } }] }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.contact.count({ where: { OR: [{ nextFollowUpAt: null }, { tasks: { none: { status: "PENDING" } } }] } }),
      prisma.contact.count({ where: { OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: new Date(Date.now() - 7 * 86400000) } }] } }),
      prisma.company.count(),
      prisma.contact.count({ where: { stage: { notIn: ["CLIENT", "LOST"] } } }),
      prisma.contact.count({ where: { createdAt: { gte: rangeStart } } }),
      prisma.task.count({ where: { status: "PENDING", dueAt: { gte: now, lte: nextWeek } } }),
      prisma.paymentInstallment.aggregate({ where: { status: "PENDING", dueDate: { gte: now, lte: nextWeek } }, _sum: { amount: true }, _count: { _all: true } }),
    ]);

    const totalContacts = contactsByStage.reduce((sum, item) => sum + item._count.stage, 0);
    const totalDeals = dealsByStage.reduce((sum, item) => sum + item._count.stage, 0);
    const wonCount = dealsByStage.find((item) => item.stage === "WON")?._count.stage ?? 0;
    const followUpCompletionRate = overdueTasks + tasksDone > 0 ? Number(((tasksDone / (tasksDone + overdueTasks)) * 100).toFixed(1)) : 0;
    const averageWonDealSize = wonDeals._count._all ? Number(((wonDeals._sum.amount ?? 0) / wonDeals._count._all).toFixed(2)) : 0;
    const overduePressureScore = Math.min(100, overdueTasks * 7 + overduePayments._count._all * 12 + noNextActionCount * 3);

    return {
      contactsByStage,
      contactsBySource,
      dealsByStage,
      stagePerformance: contactsByStage.map((item) => ({
        stage: item.stage,
        count: item._count.stage,
        share: totalContacts ? Number(((item._count.stage / totalContacts) * 100).toFixed(1)) : 0,
      })),
      insights: [
        noNextActionCount ? `${noNextActionCount} contacts currently have no next action.` : "Every active contact has a next action right now.",
        staleContactsCount ? `${staleContactsCount} contacts look stale based on seven days without contact.` : "No stale contacts detected for the last seven days.",
        openDeals._count._all ? `${openDeals._count._all} open deals are still in progress.` : "There are no open deals in the pipeline.",
        upcomingPayments._count._all ? `${upcomingPayments._count._all} payments are due in the next seven days.` : "No payments are due in the next seven days.",
      ],
      attentionBoard: [
        { label: "Overdue follow-ups", value: overdueTasks, tone: overdueTasks ? "rose" : "emerald" },
        { label: "No next action", value: noNextActionCount, tone: noNextActionCount ? "amber" : "emerald" },
        { label: "Upcoming payments (7d)", value: upcomingPayments._count._all, tone: upcomingPayments._count._all ? "sky" : "slate" },
        { label: "Stale contacts", value: staleContactsCount, tone: staleContactsCount ? "amber" : "emerald" },
      ],
      metrics: {
        overdueTasks,
        tasksDone,
        followUpCompletionRate,
        noNextActionCount,
        staleContactsCount,
        companiesCount,
        activeContactsCount,
        contactsCreatedInRange,
        dueTasksNext7Days,
        openDealCount: openDeals._count._all,
        openPipelineValue: openDeals._sum.amount ?? 0,
        wonDealsCount: wonDeals._count._all,
        wonValue: wonDeals._sum.amount ?? 0,
        averageWonDealSize,
        upcomingPaymentsCount: upcomingPayments._count._all,
        upcomingPaymentsValue: upcomingPayments._sum.amount ?? 0,
        overduePaymentsCount: overduePayments._count._all,
        overduePaymentsValue: overduePayments._sum.amount ?? 0,
        overduePressureScore,
        dealWinRate: totalDeals ? Number(((wonCount / totalDeals) * 100).toFixed(1)) : 0,
      },
    };
  });

  app.get("/reports/contacts-export", { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({ stage: z.string().optional(), search: z.string().optional() }).parse(request.query);
    const contacts = await prisma.contact.findMany({
      where: {
        ...(query.stage ? { stage: query.stage as never } : {}),
        ...(query.search ? { OR: [{ fullName: { contains: query.search } }, { phone: { contains: query.search } }, { company: { contains: query.search } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { companyRecord: true },
    });

    const rows = [["id","fullName","phone","email","company","source","stage","expectedDealValue","nextFollowUpAt","tags"],
      ...contacts.map((contact: any) => [contact.id, contact.fullName, contact.phone, contact.email ?? "", contact.companyRecord?.name ?? contact.company ?? "", contact.source ?? "", contact.stage, contact.expectedDealValue, contact.nextFollowUpAt?.toISOString() ?? "", contact.tags ?? ""])
    ];
    const csv = rows.map((row) => row.map((cell: any) => csvEscape(cell)).join(",")).join("\n");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="contacts-export.csv"');
    return reply.send(csv);
  });
}
