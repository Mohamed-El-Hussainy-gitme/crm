import { jsonResponse } from "../common/http.js";
import { requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { parsePositiveInt, requireMinimumRole } from "../core/utils.js";

export async function handleAuditRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "audit") return null;
  const user = await requireUser(request, env);
  requireMinimumRole(user, ["SALES_MANAGER", "ADMIN"]);
  const limit = parsePositiveInt(new URL(request.url).searchParams.get("limit"), 100, 500);
  return jsonResponse(await new CoreRepository(env).auditLogs(limit));
}
