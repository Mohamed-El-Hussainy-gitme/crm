import { jsonResponse } from "../common/http.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import { HttpError } from "../common/errors.js";
import { TasksService } from "./service.js";

export async function handleTasksRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "tasks") return null;

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);
  const user = await requireUser(request, env);
  const service = new TasksService(env, user);
  const method = request.method.toUpperCase();

  if (pathSegments.length === 1 && method === "GET") return jsonResponse(await service.list(request));
  if (pathSegments.length === 1 && method === "POST") return jsonResponse(await service.create(request), { status: 201 });

  const id = pathSegments[1];
  if (!id) throw new HttpError("Task id is required", 400);

  if (pathSegments.length === 3 && pathSegments[2] === "complete" && method === "PATCH") return jsonResponse(await service.complete(request, id));
  if (pathSegments.length === 3 && pathSegments[2] === "reschedule" && method === "PATCH") return jsonResponse(await service.reschedule(request, id));
  if (pathSegments.length === 3 && pathSegments[2] === "status" && method === "PATCH") return jsonResponse(await service.updateStatus(request, id));

  return null;
}
