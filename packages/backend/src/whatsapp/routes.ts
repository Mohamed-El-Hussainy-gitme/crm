import { buildWhatsappUrl } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { readJsonBody } from "../common/validation.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { createActivity, findContactByPhone, serializeConversation } from "../core/business.js";
import { createId, nowIso, requireMinimumRole } from "../core/utils.js";

const templateLibrary = [
  { id: "intro", name: "Introduction", content: "Hello {{name}}, thank you for reaching out. I can share the details and next steps here." },
  { id: "follow-up", name: "Follow-up", content: "Hello {{name}}, just following up on our previous conversation. Is this still a priority for you?" },
  { id: "proposal", name: "Proposal reminder", content: "Hello {{name}}, checking whether you had a chance to review the proposal. I can answer any questions." },
  { id: "payment", name: "Payment reminder", content: "Hello {{name}}, a reminder that your scheduled payment is due. Let me know if you need the details again." },
];

async function ensureConversation(repo: CoreRepository, contactId: string) {
  const existing = await repo.conversationByContact(contactId);
  if (existing) return existing;
  const timestamp = nowIso();
  return repo.createConversation({ id: contactId, contactId, createdAt: timestamp, updatedAt: timestamp });
}

export async function handleWhatsappRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "whatsapp") return null;
  if (pathSegments[1] !== "webhook") {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);
    await requireUser(request, env);
  }
  const repo = new CoreRepository(env);
  const method = request.method.toUpperCase();

  if (pathSegments[1] === "templates" && method === "GET") {
    return jsonResponse({ items: templateLibrary });
  }

  if (pathSegments[1] === "link" && pathSegments[2] && method === "GET") {
    const contact = await repo.contactById(pathSegments[2]);
    if (!contact) throw new HttpError("Contact not found", 404);
    const message = new URL(request.url).searchParams.get("message") || `Hello ${contact.fullName}`;
    return jsonResponse({ url: buildWhatsappUrl(contact.phone, message) });
  }

  if (pathSegments[1] === "conversations" && pathSegments.length === 2 && method === "GET") {
    const [conversations, contacts] = await Promise.all([repo.conversations(), repo.contacts()]);
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    const payload = [];
    for (const conversation of conversations) {
      const contact = contactsById.get(conversation.contactId);
      if (!contact) continue;
      const lastMessage = (await repo.messagesByConversation(conversation.id, false, 1))[0] ?? null;
      payload.push(serializeConversation(conversation, contact, lastMessage));
    }
    return jsonResponse(payload);
  }

  if (pathSegments[1] === "conversations" && pathSegments[2] && pathSegments.length === 3 && method === "GET") {
    const contactId = pathSegments[2];
    const contact = await repo.contactById(contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    const conversation = await ensureConversation(repo, contactId);
    const messages = await repo.messagesByConversation(conversation.id, true, 500);
    return jsonResponse({ ...conversation, contact, messages, openWhatsappUrl: buildWhatsappUrl(contact.phone, `Hello ${contact.fullName}`) });
  }

  if (pathSegments[1] === "conversations" && pathSegments[2] && pathSegments[3] === "messages" && method === "POST") {
    const contactId = pathSegments[2];
    const contact = await repo.contactById(contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    const body = (await readJsonBody(request)) as { content?: unknown };
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content || content.length > 4000) throw new HttpError("Invalid message content", 400);
    const conversation = await ensureConversation(repo, contactId);
    const message = await repo.createMessage({ id: createId(), conversationId: conversation.id, direction: "OUTBOUND", content, externalId: null, createdAt: nowIso() });
    await repo.updateConversation(conversation.id, { updatedAt: nowIso() });
    await repo.updateContact(contactId, { lastContactedAt: nowIso(), updatedAt: nowIso() }).catch(() => null);
    await createActivity(repo, contactId, "WHATSAPP_OUTBOUND", { content, messageId: message.id });
    return jsonResponse({ message, openWhatsappUrl: buildWhatsappUrl(contact.phone, content), deliveryMode: "cloudflare-log-with-deep-link" }, { status: 201 });
  }

  if (pathSegments[1] === "broadcasts" && pathSegments[3] === "delivery" && method === "GET") {
    const broadcastId = pathSegments[2];
    if (!broadcastId) throw new HttpError("Broadcast id is required", 400);
    const broadcast = await repo.broadcastById(broadcastId);
    if (!broadcast) throw new HttpError("Broadcast not found", 404);
    const [audience, contacts] = await Promise.all([repo.broadcastAudience(broadcastId), repo.contacts()]);
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    return jsonResponse({ id: broadcast.id, name: broadcast.name, status: broadcast.status, audience: audience.map((item) => ({ id: item.id, contactId: item.contactId, contact: contactsById.get(item.contactId) ?? null, sentAt: item.sentAt, replyAt: item.replyAt, failedAt: item.failedAt, deliveryNote: item.deliveryNote })) });
  }

  if (pathSegments[1] === "webhook" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as any;
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
    for (const item of messages) {
      const phone = String(item?.from ?? "");
      const text = String(item?.text?.body ?? "");
      const externalId = typeof item?.id === "string" ? item.id : null;
      const contact = await findContactByPhone(repo, phone);
      if (!contact || !text) continue;
      if (externalId && await repo.messageByExternalId(externalId)) continue;
      const conversation = await ensureConversation(repo, contact.id);
      await repo.createMessage({ id: createId(), conversationId: conversation.id, direction: "INBOUND", content: text, externalId, createdAt: nowIso() });
      await repo.updateConversation(conversation.id, { updatedAt: nowIso() });
      await repo.updateContact(contact.id, { lastContactedAt: nowIso(), stage: contact.stage === "LEAD" ? "INTERESTED" : contact.stage, updatedAt: nowIso() }).catch(() => null);
      await createActivity(repo, contact.id, "WHATSAPP_INBOUND", { text, externalId });
    }
    return jsonResponse({ ok: true });
  }

  return null;
}
