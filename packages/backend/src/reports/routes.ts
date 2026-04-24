import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { buildCsv, groupCount, groupCountSum, parsePositiveInt, withinRange } from "../core/utils.js";
import { paymentRuntimeStatus } from "../core/business.js";

function isActiveStage(stage: string): boolean {
  return !["CLIENT", "LOST"].includes(stage);
}

export async function handleReportsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "reports") return null;
  await requireUser(request, env);
  const repo = new CoreRepository(env);
  const method = request.method.toUpperCase();

  if (pathSegments.length === 2 && pathSegments[1] === "overview" && method === "GET") {
    const url = new URL(request.url);
    const rangeDays = parsePositiveInt(url.searchParams.get("rangeDays"), 30, 365);
    const now = new Date();
    const rangeStart = new Date(Date.now() - rangeDays * 86400000);
    const nextWeek = new Date(Date.now() + 7 * 86400000);
    const staleBefore = new Date(Date.now() - 7 * 86400000);

    const [contacts, deals, tasks, payments, companies] = await Promise.all([repo.contacts(), repo.deals(), repo.tasks(), repo.payments(), repo.companies()]);
    const contactsByStage = groupCount(contacts, "stage");
    const contactsBySource = groupCount(contacts, "source");
    const dealsByStage = groupCountSum(deals, "stage", "amount");
    const totalContacts = contacts.length;
    const totalDeals = deals.length;
    const wonDeals = deals.filter((deal) => deal.stage === "WON" && withinRange(deal.updatedAt, rangeStart, now));
    const openDeals = deals.filter((deal) => !["WON", "LOST"].includes(deal.stage));
    const overdueTasks = tasks.filter((task) => task.status === "PENDING" && new Date(task.dueAt).getTime() < now.getTime()).length;
    const tasksDone = tasks.filter((task) => task.status === "COMPLETED" && task.completedAt && new Date(task.completedAt).getTime() >= rangeStart.getTime()).length;
    const overduePayments = payments.filter((payment) => paymentRuntimeStatus(payment) === "OVERDUE");
    const upcomingPayments = payments.filter((payment) => payment.status === "PENDING" && withinRange(payment.dueDate, now, nextWeek));
    const pendingTasksByContact = new Set(tasks.filter((task) => task.status === "PENDING" && task.contactId).map((task) => task.contactId as string));
    const noNextActionCount = contacts.filter((contact) => !contact.nextFollowUpAt || !pendingTasksByContact.has(contact.id)).length;
    const staleContactsCount = contacts.filter((contact) => !contact.lastContactedAt || new Date(contact.lastContactedAt).getTime() < staleBefore.getTime()).length;
    const activeContactsCount = contacts.filter((contact) => isActiveStage(contact.stage)).length;
    const contactsCreatedInRange = contacts.filter((contact) => new Date(contact.createdAt).getTime() >= rangeStart.getTime()).length;
    const dueTasksNext7Days = tasks.filter((task) => task.status === "PENDING" && withinRange(task.dueAt, now, nextWeek)).length;
    const openPipelineValue = openDeals.reduce((sum, deal) => sum + Number(deal.amount || 0), 0);
    const wonValue = wonDeals.reduce((sum, deal) => sum + Number(deal.amount || 0), 0);
    const wonCount = deals.filter((deal) => deal.stage === "WON").length;
    const followUpCompletionRate = overdueTasks + tasksDone > 0 ? Number(((tasksDone / (tasksDone + overdueTasks)) * 100).toFixed(1)) : 0;
    const averageWonDealSize = wonDeals.length ? Number((wonValue / wonDeals.length).toFixed(2)) : 0;
    const overduePressureScore = Math.min(100, overdueTasks * 7 + overduePayments.length * 12 + noNextActionCount * 3);

    return jsonResponse({
      contactsByStage,
      contactsBySource,
      dealsByStage,
      stagePerformance: contactsByStage.map((item) => {
        const stage = String(item.stage ?? "");
        const count = Number(item._count.stage ?? 0);
        return { stage, count, share: totalContacts ? Number(((count / totalContacts) * 100).toFixed(1)) : 0 };
      }),
      insights: [
        noNextActionCount ? `${noNextActionCount} contacts currently have no next action.` : "Every active contact has a next action right now.",
        staleContactsCount ? `${staleContactsCount} contacts look stale based on seven days without contact.` : "No stale contacts detected for the last seven days.",
        openDeals.length ? `${openDeals.length} open deals are still in progress.` : "There are no open deals in the pipeline.",
        upcomingPayments.length ? `${upcomingPayments.length} payments are due in the next seven days.` : "No payments are due in the next seven days.",
      ],
      attentionBoard: [
        { label: "Overdue follow-ups", value: overdueTasks, tone: overdueTasks ? "rose" : "emerald" },
        { label: "No next action", value: noNextActionCount, tone: noNextActionCount ? "amber" : "emerald" },
        { label: "Upcoming payments (7d)", value: upcomingPayments.length, tone: upcomingPayments.length ? "sky" : "slate" },
        { label: "Stale contacts", value: staleContactsCount, tone: staleContactsCount ? "amber" : "emerald" },
      ],
      metrics: {
        overdueTasks,
        tasksDone,
        followUpCompletionRate,
        noNextActionCount,
        staleContactsCount,
        companiesCount: companies.length,
        activeContactsCount,
        contactsCreatedInRange,
        dueTasksNext7Days,
        openDealCount: openDeals.length,
        openPipelineValue,
        wonDealsCount: wonDeals.length,
        wonValue,
        averageWonDealSize,
        upcomingPaymentsCount: upcomingPayments.length,
        upcomingPaymentsValue: upcomingPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        overduePaymentsCount: overduePayments.length,
        overduePaymentsValue: overduePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        overduePressureScore,
        dealWinRate: totalDeals ? Number(((wonCount / totalDeals) * 100).toFixed(1)) : 0,
      },
    });
  }

  if (pathSegments.length === 2 && pathSegments[1] === "contacts-export" && method === "GET") {
    const url = new URL(request.url);
    const stage = url.searchParams.get("stage");
    const search = url.searchParams.get("search")?.trim().toLowerCase();
    const contacts = await repo.contacts();
    const companies = await repo.companies();
    const companiesById = new Map(companies.map((company) => [company.id, company]));
    const filtered = contacts
      .filter((contact) => !stage || contact.stage === stage)
      .filter((contact) => !search || [contact.fullName, contact.phone, contact.company, contact.email].filter(Boolean).join(" ").toLowerCase().includes(search));
    const csv = buildCsv([
      ["id", "fullName", "phone", "email", "company", "source", "stage", "expectedDealValue", "nextFollowUpAt", "tags"],
      ...filtered.map((contact) => [contact.id, contact.fullName, contact.phone, contact.email ?? "", (contact.companyId ? companiesById.get(contact.companyId)?.name : contact.company) ?? "", contact.source ?? "", contact.stage, contact.expectedDealValue, contact.nextFollowUpAt ?? "", contact.tags ?? ""]),
    ]);
    return new Response(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="contacts-export.csv"' } });
  }

  throw new HttpError("Reports route not found", 404);
}
