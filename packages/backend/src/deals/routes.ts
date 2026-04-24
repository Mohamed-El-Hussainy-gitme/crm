import { createDealSchema, dealStageSchema } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { jsonResponse, noContentResponse } from "../common/http.js";
import { readJsonBody } from "../common/validation.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { createActivity, promoteContactToClient, serializeDeal, writeAudit } from "../core/business.js";
import { createId, nowIso, parseDate, requireMinimumRole } from "../core/utils.js";

function matchesDealSearch(title: string | null | undefined, notes: string | null | undefined, contactName: string | null | undefined, search: string): boolean {
  const needle = search.toLowerCase();
  return [title, notes, contactName].filter(Boolean).join(" ").toLowerCase().includes(needle);
}

async function assertDealWorkflow(repo: CoreRepository, params: { contactId?: string; dealId?: string; stage: string; amount: number }): Promise<void> {
  const contactId = params.contactId ?? (params.dealId ? (await repo.dealById(params.dealId))?.contactId : undefined);
  if (!contactId) throw new HttpError("Contact not found", 404);
  const contact = await repo.contactById(contactId);
  if (!contact) throw new HttpError("Contact not found", 404);
  if (params.stage === "WON" && Number(params.amount) <= 0) {
    throw new HttpError("A won deal must have a positive amount.", 409);
  }
  if (["PROPOSAL", "NEGOTIATION", "WON"].includes(params.stage) && contact.stage === "LOST") {
    throw new HttpError("Cannot advance a deal for a lost contact.", 409);
  }
}

export async function handleDealsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "deals") return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);

  const user = await requireUser(request, env);
  const repo = new CoreRepository(env);
  const method = request.method.toUpperCase();

  if (pathSegments.length === 1 && method === "GET") {
    const url = new URL(request.url);
    const stage = url.searchParams.get("stage");
    const contactId = url.searchParams.get("contactId");
    const companyId = url.searchParams.get("companyId");
    const search = url.searchParams.get("search")?.trim();
    const deals = await repo.deals();
    const contacts = await repo.contacts();
    const companies = await repo.companies();
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    const companiesById = new Map(companies.map((company) => [company.id, company]));

    return jsonResponse(
      deals
        .filter((deal) => !stage || deal.stage === stage)
        .filter((deal) => !contactId || deal.contactId === contactId)
        .filter((deal) => !companyId || deal.companyId === companyId)
        .filter((deal) => !search || matchesDealSearch(deal.title, deal.notes, contactsById.get(deal.contactId)?.fullName, search))
        .map((deal) => serializeDeal(deal, contactsById.get(deal.contactId) ?? null, deal.companyId ? companiesById.get(deal.companyId) ?? null : null)),
    );
  }

  if (pathSegments.length === 1 && method === "POST") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const raw = await readJsonBody(request);
    const parsed = createDealSchema.extend({ contactId: createDealSchema.shape.title.min(1) }).safeParse(raw);
    if (!parsed.success) throw new HttpError("Invalid deal payload", 400, parsed.error.flatten());
    const contactId = String((raw as { contactId?: unknown }).contactId ?? "");
    if (!contactId) throw new HttpError("Contact id is required", 400);
    const contact = await repo.contactById(contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    await assertDealWorkflow(repo, { contactId, stage: parsed.data.stage, amount: parsed.data.amount });
    const timestamp = nowIso();
    const created = await repo.createDeal({
      id: createId(),
      contactId,
      companyId: contact.companyId,
      ownerId: user.id,
      title: parsed.data.title,
      amount: parsed.data.amount,
      probability: Math.round(parsed.data.probability),
      stage: parsed.data.stage,
      expectedCloseAt: parsed.data.expectedCloseAt ? parseDate(parsed.data.expectedCloseAt, "expectedCloseAt") : null,
      notes: parsed.data.notes ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (created.stage === "WON") await promoteContactToClient(repo, created.contactId);
    else if (["PROPOSAL", "NEGOTIATION"].includes(created.stage) && ["LEAD", "INTERESTED"].includes(contact.stage)) {
      await repo.updateContact(created.contactId, { stage: "POTENTIAL", updatedAt: nowIso() }).catch(() => null);
    }
    await createActivity(repo, contactId, "DEAL_CREATED", { dealId: created.id, title: created.title, amount: created.amount, stage: created.stage });
    await writeAudit(repo, user, { action: "DEAL_CREATED", entityType: "deal", entityId: created.id, after: { title: created.title, stage: created.stage, amount: created.amount } });
    return jsonResponse(serializeDeal(created, contact, contact.companyId ? await repo.companyById(contact.companyId) : null), { status: 201 });
  }

  const id = pathSegments[1];
  if (!id) throw new HttpError("Deal id is required", 400);

  if (pathSegments.length === 2 && method === "GET") {
    const deal = await repo.dealById(id);
    if (!deal) throw new HttpError("Deal not found", 404);
    const contact = await repo.contactById(deal.contactId);
    return jsonResponse(serializeDeal(deal, contact, deal.companyId ? await repo.companyById(deal.companyId) : null));
  }

  if (pathSegments.length === 2 && method === "PATCH") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const existing = await repo.dealById(id);
    if (!existing) throw new HttpError("Deal not found", 404);
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const nextStage = typeof body.stage === "string" ? body.stage : existing.stage;
    const parsedStage = dealStageSchema.safeParse(nextStage);
    if (!parsedStage.success) throw new HttpError("Invalid deal stage", 400);
    const nextAmount = typeof body.amount === "number" ? body.amount : existing.amount;
    await assertDealWorkflow(repo, { dealId: id, stage: parsedStage.data, amount: nextAmount });
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (typeof body.title === "string") update.title = body.title.trim();
    if (typeof body.amount === "number") update.amount = body.amount;
    if (typeof body.probability === "number") update.probability = Math.round(Math.max(0, Math.min(100, body.probability)));
    if (typeof body.stage === "string") update.stage = parsedStage.data;
    if (Object.prototype.hasOwnProperty.call(body, "expectedCloseAt")) update.expectedCloseAt = typeof body.expectedCloseAt === "string" && body.expectedCloseAt ? parseDate(body.expectedCloseAt, "expectedCloseAt") : null;
    if (Object.prototype.hasOwnProperty.call(body, "notes")) update.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
    const updated = await repo.updateDeal(id, update);
    if (!updated) throw new HttpError("Deal not found", 404);
    if (updated.stage === "WON") await promoteContactToClient(repo, updated.contactId);
    await createActivity(repo, updated.contactId, "DEAL_UPDATED", { dealId: updated.id, stage: updated.stage, amount: updated.amount });
    await writeAudit(repo, user, { action: "DEAL_UPDATED", entityType: "deal", entityId: updated.id, before: { stage: existing.stage, amount: existing.amount }, after: { stage: updated.stage, amount: updated.amount } });
    return jsonResponse(serializeDeal(updated, await repo.contactById(updated.contactId), updated.companyId ? await repo.companyById(updated.companyId) : null));
  }

  if (pathSegments.length === 3 && pathSegments[2] === "stage" && method === "PATCH") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const existing = await repo.dealById(id);
    if (!existing) throw new HttpError("Deal not found", 404);
    const body = (await readJsonBody(request)) as { stage?: unknown };
    const parsedStage = dealStageSchema.safeParse(body.stage);
    if (!parsedStage.success) throw new HttpError("Invalid deal stage", 400, parsedStage.error.flatten());
    await assertDealWorkflow(repo, { dealId: id, stage: parsedStage.data, amount: existing.amount });
    const updated = await repo.updateDeal(id, { stage: parsedStage.data, updatedAt: nowIso() });
    if (!updated) throw new HttpError("Deal not found", 404);
    if (updated.stage === "WON") await promoteContactToClient(repo, updated.contactId);
    await createActivity(repo, updated.contactId, "DEAL_STAGE_CHANGED", { dealId: updated.id, stage: updated.stage });
    await writeAudit(repo, user, { action: "DEAL_STAGE_CHANGED", entityType: "deal", entityId: updated.id, before: { stage: existing.stage }, after: { stage: updated.stage } });
    return jsonResponse(serializeDeal(updated, await repo.contactById(updated.contactId), updated.companyId ? await repo.companyById(updated.companyId) : null));
  }

  if (pathSegments.length === 2 && method === "DELETE") {
    requireMinimumRole(user, ["SALES_MANAGER", "ADMIN"]);
    await repo.deleteDeal(id);
    await writeAudit(repo, user, { action: "DEAL_DELETED", entityType: "deal", entityId: id });
    return noContentResponse();
  }

  return null;
}
