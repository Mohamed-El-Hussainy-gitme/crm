import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

function daysBetween(dateLike: Date | string | null | undefined) {
  if (!dateLike) return 999;
  const value = new Date(dateLike).getTime();
  return Math.max(0, Math.floor((Date.now() - value) / (24 * 60 * 60 * 1000)));
}

function describeContact(contact: any) {
  let score = 50;
  const reasons: string[] = [];

  if (contact.stage === "POTENTIAL") {
    score += 18;
    reasons.push("Potential stage");
  }
  if (contact.stage === "INTERESTED") {
    score += 10;
    reasons.push("Interested stage");
  }
  if (contact.stage === "CLIENT") {
    score += 8;
    reasons.push("Already client");
  }
  if (contact.stage === "LOST") {
    score -= 30;
    reasons.push("Marked lost");
  }

  if ((contact.deals ?? []).length > 0) {
    score += 12;
    reasons.push("Has deal context");
  }

  const openDeals = (contact.deals ?? []).filter((deal: any) => !["WON", "LOST"].includes(deal.stage));
  if (openDeals.length > 0) {
    score += 10;
    reasons.push("Open deal exists");
  }

  const overdueTasks = (contact.tasks ?? []).filter((task: any) => task.status === "PENDING" && new Date(task.dueAt).getTime() < Date.now());
  if (overdueTasks.length > 0) {
    score -= 12;
    reasons.push("Overdue follow-up exists");
  }

  const overduePayments = (contact.payments ?? []).filter((payment: any) => payment.status === "OVERDUE" || (payment.status === "PENDING" && new Date(payment.dueDate).getTime() < Date.now()));
  if (overduePayments.length > 0) {
    score -= 15;
    reasons.push("Payment risk detected");
  }

  const daysSinceContact = daysBetween(contact.lastContactedAt);
  if (daysSinceContact <= 2) {
    score += 8;
    reasons.push("Recent activity");
  }
  if (daysSinceContact >= 7) {
    score -= 10;
    reasons.push("No recent activity");
  }

  if (!contact.nextFollowUpAt) {
    score -= 8;
    reasons.push("No next action");
  }

  score += Math.min(15, Math.floor(Number(contact.expectedDealValue || 0) / 5000));

  const normalized = Math.max(0, Math.min(100, score));
  const risk = overduePayments.length > 0 || overdueTasks.length > 0 ? "HIGH" : !contact.nextFollowUpAt || daysSinceContact >= 7 ? "MEDIUM" : "LOW";
  const momentum = normalized >= 75 ? "HOT" : normalized >= 55 ? "WARM" : "COLD";

  let nextBestAction = "Create next follow-up";
  if (overduePayments.length > 0) nextBestAction = "Resolve overdue payment";
  else if (overdueTasks.length > 0) nextBestAction = "Complete overdue follow-up";
  else if (!contact.lastContactedAt || daysSinceContact >= 7) nextBestAction = "Re-engage on WhatsApp today";
  else if (openDeals.some((deal: any) => deal.stage === "PROPOSAL")) nextBestAction = "Follow up on proposal";
  else if (openDeals.some((deal: any) => deal.stage === "NEGOTIATION")) nextBestAction = "Push deal to close";

  const summary = `${contact.fullName} is ${momentum.toLowerCase()} with ${normalized}/100 score. Stage: ${contact.stage}. ${contact.lastContactedAt ? `Last contacted ${daysSinceContact} day(s) ago.` : "No contact logged yet."} ${contact.nextFollowUpAt ? "A next action exists." : "No next action is queued."}`;

  return {
    score: normalized,
    momentum,
    risk,
    nextBestAction,
    reasons,
    summary,
    stats: {
      openDeals: openDeals.length,
      overdueTasks: overdueTasks.length,
      overduePayments: overduePayments.length,
      daysSinceContact,
    },
  };
}

export async function intelligenceRoutes(app: FastifyInstance) {
  app.get("/intelligence/overview", { preHandler: [app.authenticate] }, async () => {
    const contacts = await prisma.contact.findMany({
      include: {
        tasks: { where: { status: "PENDING" }, orderBy: { dueAt: "asc" } },
        payments: true,
        deals: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const enriched = contacts.map((contact: any) => ({ ...contact, intelligence: describeContact(contact) }));
    const hotLeads = enriched.filter((contact: any) => ["HOT", "WARM"].includes(contact.intelligence.momentum)).sort((a: any, b: any) => b.intelligence.score - a.intelligence.score).slice(0, 10);
    const rescueList = enriched.filter((contact: any) => contact.intelligence.risk !== "LOW").sort((a: any, b: any) => b.intelligence.stats.overdueTasks - a.intelligence.stats.overdueTasks || b.intelligence.stats.overduePayments - a.intelligence.stats.overduePayments).slice(0, 10);
    const withoutNextAction = enriched.filter((contact: any) => !contact.nextFollowUpAt).slice(0, 10);

    return {
      counts: {
        contactsAnalysed: enriched.length,
        hotLeads: hotLeads.length,
        rescueList: rescueList.length,
        noNextAction: withoutNextAction.length,
      },
      hotLeads: hotLeads.map((contact: any) => ({ id: contact.id, fullName: contact.fullName, stage: contact.stage, company: contact.company, score: contact.intelligence.score, momentum: contact.intelligence.momentum, nextBestAction: contact.intelligence.nextBestAction })),
      rescueList: rescueList.map((contact: any) => ({ id: contact.id, fullName: contact.fullName, risk: contact.intelligence.risk, reasons: contact.intelligence.reasons, nextBestAction: contact.intelligence.nextBestAction })),
      broadcastSuggestions: [
        { key: "no-next-action", label: "Contacts without next action", count: withoutNextAction.length },
        { key: "warm-leads", label: "Warm and hot leads", count: hotLeads.length },
        { key: "payment-risk", label: "Contacts with overdue payments", count: enriched.filter((contact: any) => contact.intelligence.stats.overduePayments > 0).length },
      ],
    };
  });

  app.get("/contacts/:id/intelligence", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        tasks: { where: { status: "PENDING" }, orderBy: { dueAt: "asc" } },
        payments: true,
        deals: true,
        notes: { orderBy: { createdAt: "desc" }, take: 3 },
        calls: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    });
    if (!contact) return reply.notFound("Contact not found");
    return describeContact(contact);
  });
}
