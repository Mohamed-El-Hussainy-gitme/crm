import { createCallSchema } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { readJsonBody } from "../common/validation.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { createActivity, serializeCall } from "../core/business.js";
import { createId, nowIso, requireMinimumRole } from "../core/utils.js";

export async function handleCallsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (!(pathSegments[0] === "contacts" && pathSegments[2] === "calls")) return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);
  const user = await requireUser(request, env);
  const repo = new CoreRepository(env);
  const method = request.method.toUpperCase();
  const contactId = pathSegments[1];
  if (!contactId) throw new HttpError("Contact id is required", 400);

  if (pathSegments.length === 3 && method === "POST") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const contact = await repo.contactById(contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    const parsed = createCallSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid call payload", 400, parsed.error.flatten());
    const call = await repo.createCall({ id: createId(), contactId, outcome: parsed.data.outcome, durationMins: parsed.data.durationMins, summary: parsed.data.summary, createdAt: nowIso() });
    await repo.updateContact(contactId, { lastContactedAt: nowIso(), updatedAt: nowIso() }).catch(() => null);
    await createActivity(repo, contactId, "CALL_LOGGED", { callId: call.id, outcome: call.outcome });
    return jsonResponse(serializeCall(call), { status: 201 });
  }

  return null;
}
