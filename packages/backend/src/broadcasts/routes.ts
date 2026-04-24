import { buildWhatsappUrl } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { readJsonBody } from "../common/validation.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { createActivity } from "../core/business.js";
import { createId, nowIso, splitTags } from "../core/utils.js";

function normalizeFilters(raw: unknown) {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    stages: Array.isArray(input.stages) ? input.stages.map(String) : undefined,
    optedInOnly: input.optedInOnly !== false,
    overduePaymentsOnly: Boolean(input.overduePaymentsOnly),
    withoutNextAction: Boolean(input.withoutNextAction),
    inactiveDays: typeof input.inactiveDays === "number" && input.inactiveDays > 0 ? input.inactiveDays : undefined,
    tags: Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean) : undefined,
  };
}

async function resolveAudience(repo: CoreRepository, rawFilters: unknown) {
  const filters = normalizeFilters(rawFilters);
  const [contacts, payments, tasks] = await Promise.all([repo.contacts(), repo.payments(), repo.tasks()]);
  const paymentRisk = new Set(payments.filter((payment) => payment.status === "OVERDUE" || (payment.status === "PENDING" && new Date(payment.dueDate).getTime() < Date.now())).map((payment) => payment.contactId));
  const pendingTaskContacts = new Set(tasks.filter((task) => task.status === "PENDING" && task.contactId).map((task) => task.contactId as string));
  const inactiveBefore = filters.inactiveDays ? Date.now() - filters.inactiveDays * 86400000 : null;
  return contacts.filter((contact) => {
    if (filters.stages?.length && !filters.stages.includes(contact.stage)) return false;
    if (filters.optedInOnly && !contact.isWhatsappOptedIn) return false;
    if (filters.overduePaymentsOnly && !paymentRisk.has(contact.id)) return false;
    if (filters.withoutNextAction && contact.nextFollowUpAt && pendingTaskContacts.has(contact.id)) return false;
    if (inactiveBefore !== null && contact.lastContactedAt && new Date(contact.lastContactedAt).getTime() >= inactiveBefore) return false;
    if (filters.tags?.length && !filters.tags.every((tag) => splitTags(contact.tags).includes(tag))) return false;
    return true;
  });
}

export async function handleBroadcastsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "broadcasts") return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);
  await requireUser(request, env);
  const repo = new CoreRepository(env);
  const method = request.method.toUpperCase();

  if (pathSegments.length === 1 && method === "GET") {
    const broadcasts = await repo.broadcasts();
    const audiences = await Promise.all(broadcasts.map((broadcast) => repo.broadcastAudience(broadcast.id)));
    return jsonResponse(broadcasts.map((broadcast, index) => ({ ...broadcast, audience: audiences[index] ?? [] })));
  }

  if (pathSegments[1] === "preview" && method === "POST") {
    const filters = await readJsonBody(request);
    const audience = await resolveAudience(repo, filters);
    return jsonResponse({ count: audience.length, contacts: audience.map((contact) => ({ id: contact.id, fullName: contact.fullName, phone: contact.phone, stage: contact.stage, whatsappUrl: buildWhatsappUrl(contact.phone) })) });
  }

  if (pathSegments.length === 1 && method === "POST") {
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const name = typeof body.name === "string" && body.name.trim().length >= 3 ? body.name.trim() : `Broadcast ${new Date().toISOString()}`;
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (content.length < 3 || content.length > 5000) throw new HttpError("Broadcast content is invalid", 400);
    const filters = normalizeFilters(body.filters);
    const audience = await resolveAudience(repo, filters);
    const timestamp = nowIso();
    const broadcast = await repo.createBroadcast({ id: createId(), name, description: typeof body.description === "string" ? body.description : null, templateName: typeof body.templateName === "string" ? body.templateName : null, content, filters, status: typeof body.scheduledAt === "string" ? "QUEUED" : "DRAFT", scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : null, createdAt: timestamp, updatedAt: timestamp });
    for (const contact of audience) {
      await repo.createBroadcastAudience({ id: createId(), broadcastId: broadcast.id, contactId: contact.id, deliveryNote: null, sentAt: null, replyAt: null, failedAt: null }).catch(() => null);
      await createActivity(repo, contact.id, "ADDED_TO_BROADCAST", { broadcastId: broadcast.id, name: broadcast.name });
    }
    return jsonResponse({ ...broadcast, audience: await repo.broadcastAudience(broadcast.id), executionMode: "manual-cloudflare", note: "Broadcast saved. Delivery remains manual via WhatsApp deep links." }, { status: 201 });
  }

  if (pathSegments.length === 3 && pathSegments[2] === "execute" && method === "POST") {
    const broadcastId = pathSegments[1];
    if (!broadcastId) throw new HttpError("Broadcast id is required", 400);
    const broadcast = await repo.broadcastById(broadcastId);
    if (!broadcast) throw new HttpError("Broadcast not found", 404);
    const [audience, contacts] = await Promise.all([repo.broadcastAudience(broadcastId), repo.contacts()]);
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    await repo.updateBroadcast(broadcastId, { status: "PROCESSING", updatedAt: nowIso() });
    for (const item of audience) {
      const contact = contactsById.get(item.contactId);
      if (!contact) continue;
      const result = { provider: "DEEP_LINK", status: "LINK_ONLY", url: buildWhatsappUrl(contact.phone, broadcast.content) };
      await repo.updateBroadcastAudience(item.id, { sentAt: nowIso(), deliveryNote: JSON.stringify(result) });
      await createActivity(repo, contact.id, "BROADCAST_SENT", { broadcastId, result });
    }
    return jsonResponse(await repo.updateBroadcast(broadcastId, { status: "COMPLETED", updatedAt: nowIso() }));
  }

  return null;
}
