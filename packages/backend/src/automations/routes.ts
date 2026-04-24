import { jsonResponse } from "../common/http.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { createId, nowIso, requireMinimumRole } from "../core/utils.js";
import { writeAudit } from "../core/business.js";

export async function handleAutomationsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "automations") return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);
  const user = await requireUser(request, env);
  const repo = new CoreRepository(env);
  const method = request.method.toUpperCase();

  if (pathSegments.length === 1 && method === "GET") {
    return jsonResponse({ runs: await repo.automationRuns(20) });
  }

  if (pathSegments[1] === "run" && method === "POST") {
    requireMinimumRole(user, ["SALES_MANAGER", "ADMIN"]);
    const now = new Date();
    const staleBefore = new Date(Date.now() - 3 * 86400000);
    const [payments, contacts, tasks] = await Promise.all([repo.payments(), repo.contacts(), repo.tasks()]);
    let overduePayments = 0;
    for (const payment of payments.filter((payment) => payment.status === "PENDING" && new Date(payment.dueDate).getTime() < now.getTime())) {
      await repo.updatePayment(payment.id, { status: "OVERDUE", updatedAt: nowIso() });
      overduePayments += 1;
    }
    const pendingTaskContacts = new Set(tasks.filter((task) => task.status === "PENDING" && task.contactId).map((task) => task.contactId as string));
    const staleContacts = contacts.filter((contact) => !["CLIENT", "LOST"].includes(contact.stage) && (!contact.lastContactedAt || new Date(contact.lastContactedAt).getTime() < staleBefore.getTime()) && !pendingTaskContacts.has(contact.id)).slice(0, 25);
    let createdTasks = 0;
    for (const contact of staleContacts) {
      const dueAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
      await repo.createTask({ id: createId(), contactId: contact.id, ownerId: contact.ownerId ?? user.id, title: `Re-engage ${contact.fullName}`, description: "Auto-generated because no recent activity was detected.", type: "FOLLOW_UP", priority: "HIGH", status: "PENDING", dueAt, hasExactTime: true, durationMins: null, completionResult: null, completedAt: null, createdAt: nowIso(), updatedAt: nowIso() });
      await repo.updateContact(contact.id, { nextFollowUpAt: dueAt, updatedAt: nowIso() });
      createdTasks += 1;
    }
    const summary = `Marked ${overduePayments} payments overdue and created ${createdTasks} stale-contact follow-ups.`;
    const run = await repo.createAutomationRun({ id: createId(), kind: "CLOUDFLARE_DAILY_AUTOMATIONS", status: "SUCCESS", summary, meta: { overduePayments, createdTasks }, createdAt: nowIso() });
    await writeAudit(repo, user, { action: "AUTOMATIONS_RUN", entityType: "automation", entityId: run.id, after: { summary, overduePayments, createdTasks } });
    return jsonResponse(run);
  }

  return null;
}
