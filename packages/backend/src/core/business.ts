import { buildWhatsappUrl } from "@smartcrm/shared";
import type { AuthUser } from "../auth/types.js";
import { CoreRepository } from "./repository.js";
import type { CallLogRow, CompanyRow, ContactRow, DealRow, PaymentRow, TaskRow, WhatsappConversationRow, WhatsappMessageRow } from "./types.js";
import { createId, normalizePhone, nowIso } from "./utils.js";

export function daysBetween(dateLike: string | null | undefined): number {
  if (!dateLike) return 999;
  const value = new Date(dateLike).getTime();
  if (!Number.isFinite(value)) return 999;
  return Math.max(0, Math.floor((Date.now() - value) / 86400000));
}

export function paymentRuntimeStatus(payment: Pick<PaymentRow, "status" | "dueDate">): PaymentRow["status"] {
  if (payment.status === "PENDING" && new Date(payment.dueDate).getTime() < Date.now()) return "OVERDUE";
  return payment.status;
}

export function resolvePaymentStatus(dueDate: string | Date): PaymentRow["status"] {
  return new Date(dueDate).getTime() < Date.now() ? "OVERDUE" : "PENDING";
}

export async function writeAudit(repo: CoreRepository, user: AuthUser | null, params: { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown }): Promise<void> {
  await repo
    .createAuditLog({
      id: createId(),
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: params.before ?? null,
      after: params.after ?? null,
      createdAt: nowIso(),
    })
    .catch(() => null);
}

export async function createActivity(repo: CoreRepository, contactId: string, kind: string, meta?: unknown): Promise<void> {
  await repo.createActivity({ id: createId(), contactId, kind, meta: meta ?? null, createdAt: nowIso() }).catch(() => null);
}

export async function promoteContactToClient(repo: CoreRepository, contactId: string): Promise<void> {
  await repo.updateContact(contactId, { stage: "CLIENT", updatedAt: nowIso() }).catch(() => null);
}

export async function findContactByPhone(repo: CoreRepository, phone: string): Promise<ContactRow | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const contacts = await repo.contacts();
  return contacts.find((contact) => normalizePhone(contact.normalizedPhone || contact.phone) === normalized || contact.phone.trim() === phone.trim()) ?? null;
}

export function describeContactIntelligence(contact: ContactRow & { tasks?: TaskRow[]; payments?: PaymentRow[]; deals?: DealRow[]; notes?: unknown[]; calls?: unknown[] }) {
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

  const deals = contact.deals ?? [];
  const tasks = contact.tasks ?? [];
  const payments = contact.payments ?? [];

  if (deals.length > 0) {
    score += 12;
    reasons.push("Has deal context");
  }

  const openDeals = deals.filter((deal) => !["WON", "LOST"].includes(deal.stage));
  if (openDeals.length > 0) {
    score += 10;
    reasons.push("Open deal exists");
  }

  const overdueTasks = tasks.filter((task) => task.status === "PENDING" && new Date(task.dueAt).getTime() < Date.now());
  if (overdueTasks.length > 0) {
    score -= 12;
    reasons.push("Overdue follow-up exists");
  }

  const overduePayments = payments.filter((payment) => payment.status === "OVERDUE" || (payment.status === "PENDING" && new Date(payment.dueDate).getTime() < Date.now()));
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
  else if (openDeals.some((deal) => deal.stage === "PROPOSAL")) nextBestAction = "Follow up on proposal";
  else if (openDeals.some((deal) => deal.stage === "NEGOTIATION")) nextBestAction = "Push deal to close";

  return {
    score: normalized,
    momentum,
    risk,
    nextBestAction,
    reasons,
    summary: `${contact.fullName} is ${momentum.toLowerCase()} with ${normalized}/100 score. Stage: ${contact.stage}. ${contact.lastContactedAt ? `Last contacted ${daysSinceContact} day(s) ago.` : "No contact logged yet."} ${contact.nextFollowUpAt ? "A next action exists." : "No next action is queued."}`,
    stats: {
      openDeals: openDeals.length,
      overdueTasks: overdueTasks.length,
      overduePayments: overduePayments.length,
      daysSinceContact,
    },
  };
}

export function serializeDeal(deal: DealRow, contact?: ContactRow | null, company?: CompanyRow | null) {
  return {
    ...deal,
    amount: Number(deal.amount ?? 0),
    probability: Number(deal.probability ?? 0),
    contact: contact ? { id: contact.id, fullName: contact.fullName, phone: contact.phone, stage: contact.stage } : null,
    company: company ? { id: company.id, name: company.name } : null,
  };
}

export function serializePayment(payment: PaymentRow, contact?: ContactRow | null) {
  return {
    ...payment,
    amount: Number(payment.amount ?? 0),
    status: paymentRuntimeStatus(payment),
    contact: contact ? { id: contact.id, fullName: contact.fullName, phone: contact.phone, company: contact.company, stage: contact.stage } : null,
  };
}

export function serializeCall(call: CallLogRow) {
  return { ...call, durationMins: Number(call.durationMins ?? 0) };
}

export function serializeConversation(conversation: WhatsappConversationRow, contact: ContactRow, lastMessage?: WhatsappMessageRow | null) {
  return {
    id: conversation.id,
    contactId: conversation.contactId,
    contact: { fullName: contact.fullName, phone: contact.phone },
    lastMessage: lastMessage ?? null,
    updatedAt: conversation.updatedAt,
    openWhatsappUrl: buildWhatsappUrl(contact.phone, lastMessage?.content ?? `Hello ${contact.fullName}`),
  };
}
