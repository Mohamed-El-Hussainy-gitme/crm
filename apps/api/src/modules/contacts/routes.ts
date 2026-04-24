import { FastifyInstance } from "fastify";
import {
  PIPELINE_STAGES,
  createContactSchema,
  parseLocationIntake,
  pipelineStageSchema,
} from "@smartcrm/shared";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { createActivity } from "../activities/service.js";
import { writeAuditLog } from "../../lib/audit.js";
import { serializeContact } from "./serializers.js";
import {
  applyLostContactState,
  assertUniqueContactIdentity,
  ensureContactStageChangeAllowed,
  normalizeEmail,
  normalizePhone,
} from "../../lib/workflow.js";

const updateContactSchema = createContactSchema.partial().extend({
  companyId: z.string().cuid().nullable().optional(),
});
const stageEnum = z.enum(PIPELINE_STAGES);
const locationIntakeSchema = z.object({
  input: z.string().trim().min(4).max(2000),
});

const stagesRequiringNextAction = [
  "INTERESTED",
  "POTENTIAL",
  "VISIT",
  "FREE_TRIAL",
  "ON_HOLD",
];

async function upsertCompanyByName(name?: string | null) {
  if (!name?.trim()) return null;
  return prisma.company.upsert({
    where: { name: name.trim() },
    update: {},
    create: { name: name.trim() },
  });
}

function toUniqueTags(tags: string[] | undefined) {
  return Array.from(
    new Set((tags ?? []).map((item) => item.trim()).filter(Boolean)),
  ).join(",");
}

function mapCreateInputToContactData(
  body: z.infer<typeof createContactSchema>,
  companyId?: string | null,
) {
  const fullName = `${body.firstName} ${body.lastName ?? ""}`.trim();

  return {
    firstName: body.firstName.trim(),
    lastName: body.lastName?.trim() || null,
    fullName,
    phone: body.phone.trim(),
    normalizedPhone: normalizePhone(body.phone),
    email: normalizeEmail(body.email),
    source: body.source?.trim() || null,
    company: body.company?.trim() || null,
    companyId: companyId || null,
    locationText: body.locationText?.trim() || null,
    area: body.area?.trim() || null,
    mapUrl: body.mapUrl?.trim() || null,
    placeLabel: body.placeLabel?.trim() || null,
    stage: body.stage,
    expectedDealValue: body.expectedDealValue ?? 0,
    lastContactedAt: body.lastContactedAt
      ? new Date(body.lastContactedAt)
      : null,
    nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null,
    isWhatsappOptedIn: Boolean(body.isWhatsappOptedIn),
    tags: toUniqueTags(body.tags),
  };
}

export async function contactRoutes(app: FastifyInstance) {
  app.get("/contacts", { preHandler: [app.authenticate] }, async (request) => {
    const query = z
      .object({
        stage: z.string().optional(),
        source: z.string().optional(),
        search: z.string().optional(),
        noNextAction: z.coerce.boolean().optional(),
        staleDays: z.coerce.number().min(1).max(90).optional(),
        companyId: z.string().cuid().optional(),
        tag: z.string().optional(),
      })
      .parse(request.query);

    const normalizedSearchPhone = normalizePhone(query.search);

    const contacts = await prisma.contact.findMany({
      where: {
        ...(query.stage
          ? { stage: query.stage as z.infer<typeof pipelineStageSchema> }
          : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.tag ? { tags: { contains: query.tag } } : {}),
        ...(query.noNextAction
          ? {
              OR: [
                { nextFollowUpAt: null },
                { tasks: { none: { status: "PENDING" } } },
              ],
            }
          : {}),
        ...(query.staleDays
          ? {
              OR: [
                { lastContactedAt: null },
                {
                  lastContactedAt: {
                    lt: new Date(Date.now() - query.staleDays * 86400000),
                  },
                },
              ],
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                { fullName: { contains: query.search } },
                { phone: { contains: query.search } },
                ...(normalizedSearchPhone
                  ? [{ normalizedPhone: { contains: normalizedSearchPhone } }]
                  : []),
                { company: { contains: query.search } },
                { source: { contains: query.search } },
                { locationText: { contains: query.search } },
                { area: { contains: query.search } },
                { placeLabel: { contains: query.search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        tasks: true,
        notes: true,
        payments: true,
        deals: true,
        companyRecord: true,
      },
    });

    return contacts.map((contact) => serializeContact(contact));
  });

  app.post(
    "/contacts/intake/parse-location",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = locationIntakeSchema.parse(request.body);
      return parseLocationIntake(body.input);
    },
  );

  app.get(
    "/contacts/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const contact = await prisma.contact.findUnique({
        where: { id },
        include: {
          notes: { orderBy: { createdAt: "desc" } },
          tasks: { orderBy: { dueAt: "asc" } },
          calls: { orderBy: { createdAt: "desc" } },
          payments: { orderBy: { dueDate: "asc" } },
          deals: { orderBy: { updatedAt: "desc" } },
          activities: { orderBy: { createdAt: "desc" } },
          companyRecord: true,
        },
      });
      if (!contact) return reply.notFound("Contact not found");
      return serializeContact(contact);
    },
  );

  app.post(
    "/contacts",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = createContactSchema.parse(request.body);
      if (
        stagesRequiringNextAction.includes(body.stage) &&
        !body.nextFollowUpAt
      ) {
        const error = new Error(
          "Creating a contact in this stage requires a scheduled next action.",
        ) as Error & { statusCode: number };
        error.statusCode = 409;
        throw error;
      }
      if (body.stage === "CLIENT") {
        const error = new Error(
          "Create the contact first, then move it to CLIENT after a won deal or payment is recorded.",
        ) as Error & { statusCode: number };
        error.statusCode = 409;
        throw error;
      }
      await assertUniqueContactIdentity({
        phone: body.phone,
        email: body.email,
      });
      const company = await upsertCompanyByName(body.company);
      const created = await prisma.contact.create({
        data: {
          ...mapCreateInputToContactData(body, company?.id),
          notes: body.notes ? { create: { body: body.notes } } : undefined,
        },
        include: { companyRecord: true },
      });
      await createActivity(created.id, "CONTACT_CREATED", {
        stage: created.stage,
        source: created.source,
        placeLabel: created.placeLabel,
        area: created.area,
      });
      const user = request.user;
      await writeAuditLog({
        actorId: user?.sub,
        actorEmail: user?.email,
        action: "CONTACT_CREATED",
        entityType: "contact",
        entityId: created.id,
        after: {
          stage: created.stage,
          fullName: created.fullName,
          normalizedPhone: created.normalizedPhone,
        },
      });
      return reply.code(201).send(serializeContact(created));
    },
  );

  app.patch(
    "/contacts/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = updateContactSchema.parse(request.body);
      const existing = await prisma.contact.findUnique({ where: { id } });
      if (!existing) return reply.notFound("Contact not found");
      await assertUniqueContactIdentity({
        phone: body.phone ?? existing.phone,
        email: body.email ?? existing.email,
        excludeContactId: id,
      });
      if (body.stage && body.stage !== existing.stage) {
        await ensureContactStageChangeAllowed(id, body.stage);
      }
      const company =
        body.company !== undefined
          ? await upsertCompanyByName(body.company)
          : null;
      const fullName =
        `${body.firstName ?? existing.firstName} ${body.lastName ?? existing.lastName ?? ""}`.trim();

      const data: Record<string, unknown> = {
        fullName,
        firstName: body.firstName?.trim(),
        lastName:
          body.lastName !== undefined
            ? body.lastName.trim() || null
            : undefined,
        phone: body.phone?.trim(),
        normalizedPhone:
          body.phone !== undefined ? normalizePhone(body.phone) : undefined,
        email:
          body.email !== undefined ? normalizeEmail(body.email) : undefined,
        source:
          body.source !== undefined ? body.source?.trim() || null : undefined,
        stage: body.stage,
        expectedDealValue: body.expectedDealValue,
        lastContactedAt: body.lastContactedAt
          ? new Date(body.lastContactedAt)
          : body.lastContactedAt === undefined
            ? undefined
            : null,
        nextFollowUpAt: body.nextFollowUpAt
          ? new Date(body.nextFollowUpAt)
          : body.nextFollowUpAt === undefined
            ? undefined
            : null,
        isWhatsappOptedIn: body.isWhatsappOptedIn,
        tags: body.tags ? toUniqueTags(body.tags) : undefined,
        company:
          body.company !== undefined
            ? (company?.name ?? (body.company?.trim() || null))
            : undefined,
        locationText:
          body.locationText !== undefined
            ? body.locationText?.trim() || null
            : undefined,
        area: body.area !== undefined ? body.area?.trim() || null : undefined,
        mapUrl:
          body.mapUrl !== undefined ? body.mapUrl?.trim() || null : undefined,
        placeLabel:
          body.placeLabel !== undefined
            ? body.placeLabel?.trim() || null
            : undefined,
      };

      if (body.companyId === null) {
        data.companyRecord = { disconnect: true };
      } else if (typeof body.companyId === "string" && body.companyId.trim()) {
        data.companyRecord = { connect: { id: body.companyId } };
      } else if (body.company !== undefined) {
        data.companyRecord = company?.id
          ? { connect: { id: company.id } }
          : { disconnect: true };
      }

      const updated = await prisma.contact.update({
        where: { id },
        data,
        include: { companyRecord: true },
      });

      if (body.notes?.trim()) {
        await prisma.note.create({
          data: {
            contactId: updated.id,
            body: body.notes.trim(),
          },
        });
      }

      if (updated.stage === "LOST" && existing.stage !== "LOST") {
        await applyLostContactState(updated.id);
      }

      await createActivity(updated.id, "CONTACT_UPDATED", {
        changes: body,
        normalizedPhone: updated.normalizedPhone,
        placeLabel: updated.placeLabel,
        area: updated.area,
      });
      const user = request.user;
      await writeAuditLog({
        actorId: user?.sub,
        actorEmail: user?.email,
        action: "CONTACT_UPDATED",
        entityType: "contact",
        entityId: updated.id,
        before: {
          stage: existing.stage,
          fullName: existing.fullName,
          normalizedPhone: existing.normalizedPhone,
        },
        after: {
          stage: updated.stage,
          fullName: updated.fullName,
          normalizedPhone: updated.normalizedPhone,
        },
      });
      return serializeContact(updated);
    },
  );

  app.post(
    "/contacts/:id/stage",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = z.object({ id: z.string().cuid() }).parse(request.params);
      const body = z.object({ stage: stageEnum }).parse(request.body);
      const existing = await ensureContactStageChangeAllowed(
        params.id,
        body.stage,
      );
      const updated = await prisma.contact
        .update({
          where: { id: params.id },
          data: {
            stage: body.stage,
            ...(body.stage === "LOST" ? { nextFollowUpAt: null } : {}),
          },
        })
        .catch(() => null);
      if (!updated) return reply.notFound("Contact not found");
      if (body.stage === "LOST") {
        await applyLostContactState(updated.id);
      }
      await createActivity(updated.id, "STAGE_CHANGED", { stage: body.stage });
      const user = request.user;
      await writeAuditLog({
        actorId: user?.sub,
        actorEmail: user?.email,
        action: "CONTACT_STAGE_CHANGED",
        entityType: "contact",
        entityId: updated.id,
        before: { stage: existing.stage },
        after: { stage: body.stage },
      });
      return updated;
    },
  );

  app.post(
    "/contacts/bulk/stage",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = z
        .object({ ids: z.array(z.string().cuid()).min(1), stage: stageEnum })
        .parse(request.body);
      const updatedIds: string[] = [];
      const rejected: Array<{ id: string; reason: string }> = [];

      for (const id of body.ids) {
        try {
          await ensureContactStageChangeAllowed(id, body.stage);
          await prisma.contact.update({
            where: { id },
            data: {
              stage: body.stage,
              ...(body.stage === "LOST" ? { nextFollowUpAt: null } : {}),
            },
          });
          if (body.stage === "LOST") {
            await applyLostContactState(id);
          }
          await createActivity(id, "BULK_STAGE_CHANGED", { stage: body.stage });
          updatedIds.push(id);
        } catch (error) {
          rejected.push({
            id,
            reason:
              error instanceof Error ? error.message : "Stage update rejected",
          });
        }
      }

      return { updatedCount: updatedIds.length, stage: body.stage, rejected };
    },
  );

  app.post(
    "/contacts/bulk/tags",
    { preHandler: [app.authenticate] },
    async (request) => {
      const body = z
        .object({
          ids: z.array(z.string().cuid()).min(1),
          tags: z.array(z.string().min(1)).min(1),
        })
        .parse(request.body);
      const contacts = await prisma.contact.findMany({
        where: { id: { in: body.ids } },
      });
      for (const contact of contacts) {
        const merged = Array.from(
          new Set([
            ...(contact.tags
              ?.split(",")
              .map((item) => item.trim())
              .filter(Boolean) ?? []),
            ...body.tags,
          ]),
        );
        await prisma.contact.update({
          where: { id: contact.id },
          data: { tags: merged.join(",") },
        });
      }
      return { updatedCount: contacts.length, tags: body.tags };
    },
  );
}
