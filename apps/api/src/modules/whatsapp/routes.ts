import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { buildWhatsappLink } from "../../lib/whatsapp.js";
import { createActivity } from "../activities/service.js";
import { findContactByPhone } from "../../lib/workflow.js";

const templateLibrary = [
  { id: "intro", name: "Introduction", content: "Hello {{name}}, thank you for reaching out. I can share the details and next steps here." },
  { id: "follow-up", name: "Follow-up", content: "Hello {{name}}, just following up on our previous conversation. Is this still a priority for you?" },
  { id: "proposal", name: "Proposal reminder", content: "Hello {{name}}, checking whether you had a chance to review the proposal. I can answer any questions." },
  { id: "payment", name: "Payment reminder", content: "Hello {{name}}, a reminder that your scheduled payment is due. Let me know if you need the details again." },
];

export async function whatsappRoutes(app: FastifyInstance) {
  app.get("/whatsapp/link/:contactId", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { contactId } = z.object({ contactId: z.string().cuid() }).parse(request.params);
    const query = z.object({ message: z.string().optional() }).parse(request.query);
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return reply.notFound("Contact not found");
    return { url: buildWhatsappLink(contact.phone, query.message || `Hello ${contact.fullName}`) };
  });

  app.get("/whatsapp/templates", { preHandler: [app.authenticate] }, async () => ({ items: templateLibrary }));

  app.get("/whatsapp/conversations", { preHandler: [app.authenticate] }, async () => {
    const conversations = await prisma.whatsappConversation.findMany({ include: { contact: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } });
    return conversations.map((conversation: any) => ({
      id: conversation.id,
      contactId: conversation.contactId,
      contact: conversation.contact,
      lastMessage: conversation.messages[0] ?? null,
      updatedAt: conversation.updatedAt,
      openWhatsappUrl: buildWhatsappLink(conversation.contact.phone, conversation.messages[0]?.content ?? `Hello ${conversation.contact.fullName}`),
    }));
  });

  app.get("/whatsapp/conversations/:contactId", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { contactId } = z.object({ contactId: z.string().cuid() }).parse(request.params);
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return reply.notFound("Contact not found");
    const conversation = await prisma.whatsappConversation.upsert({ where: { id: contactId }, create: { id: contactId, contactId }, update: {}, include: { messages: { orderBy: { createdAt: "asc" } }, contact: true } });
    return { ...conversation, openWhatsappUrl: buildWhatsappLink(contact.phone, `Hello ${contact.fullName}`) };
  });

  app.post("/whatsapp/conversations/:contactId/messages", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { contactId } = z.object({ contactId: z.string().cuid() }).parse(request.params);
    const body = z.object({ content: z.string().min(1).max(4000) }).parse(request.body);
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return reply.notFound("Contact not found");
    const conversation = await prisma.whatsappConversation.upsert({ where: { id: contactId }, create: { id: contactId, contactId }, update: {} });
    const message = await prisma.whatsappMessage.create({ data: { conversationId: conversation.id, direction: "OUTBOUND", content: body.content } });
    await prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    await prisma.contact.update({ where: { id: contactId }, data: { lastContactedAt: new Date() } });
    await createActivity(contactId, "WHATSAPP_OUTBOUND", { content: body.content, messageId: message.id });
    return reply.code(201).send({ message, openWhatsappUrl: buildWhatsappLink(contact.phone, body.content), deliveryMode: "local-log-with-deep-link" });
  });

  app.get("/whatsapp/broadcasts/:id/delivery", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const broadcast = await prisma.broadcast.findUnique({ where: { id }, include: { audience: { include: { contact: true } } } });
    if (!broadcast) return reply.notFound("Broadcast not found");
    return { id: broadcast.id, name: broadcast.name, status: broadcast.status, audience: broadcast.audience.map((item: any) => ({ id: item.id, contactId: item.contactId, contact: item.contact, sentAt: item.sentAt, replyAt: item.replyAt, failedAt: item.failedAt, deliveryNote: item.deliveryNote })) };
  });

  app.post("/whatsapp/webhook", async (request) => {
    const body = request.body as any;
    const change = body?.entry?.[0]?.changes?.[0]?.value;
    const messages = change?.messages ?? [];
    for (const message of messages) {
      const phone = message?.from;
      const text = message?.text?.body ?? "";
      const contact = await findContactByPhone(phone);
      if (!contact) continue;
      const conversation = await prisma.whatsappConversation.upsert({ where: { id: contact.id }, create: { id: contact.id, contactId: contact.id }, update: { updatedAt: new Date() } });
      await prisma.whatsappMessage.create({ data: { conversationId: conversation.id, direction: "INBOUND", content: text, externalId: message.id } });
      await prisma.contact.update({ where: { id: contact.id }, data: { lastContactedAt: new Date(), stage: contact.stage === "LEAD" ? "INTERESTED" : contact.stage } });
      await createActivity(contact.id, "WHATSAPP_INBOUND", { text, externalId: message.id });
    }
    return { ok: true };
  });
}
