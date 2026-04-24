import { jsonResponse } from "../common/http.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { HttpError } from "../common/errors.js";
import { FollowUpsService } from "./service.js";

export async function handleFollowUpsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  const method = request.method.toUpperCase();

  if (pathSegments[0] === "follow-ups" && pathSegments[1] === "overview" && pathSegments.length === 2 && method === "GET") {
    const user = await requireUser(request, env);
    return jsonResponse(await new FollowUpsService(env, user).overview(request));
  }

  if (pathSegments[0] !== "contacts") return null;

  const contactId = pathSegments[1];
  if (!contactId) throw new HttpError("Contact id is required", 400);

  const isFollowUpMutation =
    (pathSegments.length === 3 && pathSegments[2] === "follow-ups" && method === "POST") ||
    (pathSegments.length === 3 && pathSegments[2] === "next-follow-up" && method === "PATCH") ||
    (pathSegments.length === 4 && pathSegments[2] === "next-follow-up" && pathSegments[3] === "complete" && method === "POST");

  if (!isFollowUpMutation) return null;
  assertTrustedOrigin(request, env);
  const user = await requireUser(request, env);
  const service = new FollowUpsService(env, user);

  if (pathSegments.length === 3 && pathSegments[2] === "follow-ups" && method === "POST") {
    return jsonResponse(await service.createContactFollowUp(request, contactId), { status: 201 });
  }

  if (pathSegments.length === 3 && pathSegments[2] === "next-follow-up" && method === "PATCH") {
    return jsonResponse(await service.updateContactNextFollowUp(request, contactId));
  }

  if (pathSegments.length === 4 && pathSegments[2] === "next-follow-up" && pathSegments[3] === "complete" && method === "POST") {
    return jsonResponse(await service.completeContactNextFollowUp(request, contactId));
  }

  return null;
}
