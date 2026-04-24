import { jsonResponse } from "../common/http.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { HttpError } from "../common/errors.js";
import { readJsonBody } from "../common/validation.js";
import { ContactsService } from "./service.js";

export async function handleContactsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "contacts") return null;

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    assertTrustedOrigin(request, env);
  }

  const user = await requireUser(request, env);
  const service = new ContactsService(env, user);
  const method = request.method.toUpperCase();

  if (pathSegments.length === 1 && method === "GET") {
    return jsonResponse(await service.list(request));
  }

  if (pathSegments.length === 1 && method === "POST") {
    return jsonResponse(await service.create(request), { status: 201 });
  }

  if (pathSegments.length === 3 && pathSegments[1] === "intake" && pathSegments[2] === "parse-location" && method === "POST") {
    return jsonResponse(await service.parseLocation(request));
  }

  if (pathSegments.length === 3 && pathSegments[1] === "bulk" && pathSegments[2] === "stage" && method === "POST") {
    return jsonResponse(await service.bulkStage(request));
  }

  if (pathSegments.length === 3 && pathSegments[1] === "bulk" && pathSegments[2] === "tags" && method === "POST") {
    return jsonResponse(await service.bulkTags(request));
  }

  const id = pathSegments[1];
  if (!id) throw new HttpError("Contact id is required", 400);

  if (pathSegments.length === 2 && method === "GET") {
    return jsonResponse(await service.details(id));
  }

  if (pathSegments.length === 2 && method === "PATCH") {
    return jsonResponse(await service.update(request, id));
  }

  if (pathSegments.length === 3 && pathSegments[2] === "stage" && method === "POST") {
    const body = (await readJsonBody(request)) as { stage?: unknown };
    if (typeof body.stage !== "string") throw new HttpError("Stage is required", 400);
    return jsonResponse(await service.updateStage(id, body.stage));
  }

  if (pathSegments.length === 3 && pathSegments[2] === "notes" && method === "POST") {
    return jsonResponse(await service.createNote(request, id), { status: 201 });
  }

  return null;
}
