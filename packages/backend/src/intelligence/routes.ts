import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { describeContactIntelligence } from "../core/business.js";

async function enrichContact(repo: CoreRepository, contactId: string) {
  const contact = await repo.contactById(contactId);
  if (!contact) throw new HttpError("Contact not found", 404);
  const [tasks, payments, deals, notes, calls] = await Promise.all([repo.tasks([{ column: "contactId", value: contactId }, { column: "status", value: "PENDING" }]), repo.paymentsByContact(contactId), repo.dealsByContact(contactId), repo.notesByContact(contactId), repo.callsByContact(contactId)]);
  return { ...contact, tasks, payments, deals, notes: notes.slice(0, 3), calls: calls.slice(0, 3) };
}

export async function handleIntelligenceRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  const isOverview = pathSegments[0] === "intelligence";
  const isContactInsight = pathSegments[0] === "contacts" && pathSegments[2] === "intelligence";
  if (!isOverview && !isContactInsight) return null;
  await requireUser(request, env);
  const repo = new CoreRepository(env);

  if (isOverview && pathSegments[1] === "overview") {
    const contacts = (await repo.contacts([], [{ column: "updatedAt", ascending: false }], 200));
    const [tasks, payments, deals] = await Promise.all([repo.tasks(), repo.payments(), repo.deals()]);
    const enriched = contacts.map((contact) => ({
      ...contact,
      tasks: tasks.filter((task) => task.contactId === contact.id && task.status === "PENDING"),
      payments: payments.filter((payment) => payment.contactId === contact.id),
      deals: deals.filter((deal) => deal.contactId === contact.id),
    })).map((contact) => ({ ...contact, intelligence: describeContactIntelligence(contact) }));
    const hotLeads = enriched.filter((contact) => ["HOT", "WARM"].includes(contact.intelligence.momentum)).sort((a, b) => b.intelligence.score - a.intelligence.score).slice(0, 10);
    const rescueList = enriched.filter((contact) => contact.intelligence.risk !== "LOW").sort((a, b) => b.intelligence.stats.overdueTasks - a.intelligence.stats.overdueTasks || b.intelligence.stats.overduePayments - a.intelligence.stats.overduePayments).slice(0, 10);
    const withoutNextAction = enriched.filter((contact) => !contact.nextFollowUpAt).slice(0, 10);
    return jsonResponse({
      counts: { contactsAnalysed: enriched.length, hotLeads: hotLeads.length, rescueList: rescueList.length, noNextAction: withoutNextAction.length },
      hotLeads: hotLeads.map((contact) => ({ id: contact.id, fullName: contact.fullName, stage: contact.stage, company: contact.company, score: contact.intelligence.score, momentum: contact.intelligence.momentum, nextBestAction: contact.intelligence.nextBestAction })),
      rescueList: rescueList.map((contact) => ({ id: contact.id, fullName: contact.fullName, risk: contact.intelligence.risk, reasons: contact.intelligence.reasons, nextBestAction: contact.intelligence.nextBestAction })),
      broadcastSuggestions: [
        { key: "no-next-action", label: "Contacts without next action", count: withoutNextAction.length },
        { key: "warm-leads", label: "Warm and hot leads", count: hotLeads.length },
        { key: "payment-risk", label: "Contacts with overdue payments", count: enriched.filter((contact) => contact.intelligence.stats.overduePayments > 0).length },
      ],
    });
  }

  if (isContactInsight) {
    const contactId = pathSegments[1];
    if (!contactId) throw new HttpError("Contact id is required", 400);
    return jsonResponse(describeContactIntelligence(await enrichContact(repo, contactId)));
  }

  return null;
}
