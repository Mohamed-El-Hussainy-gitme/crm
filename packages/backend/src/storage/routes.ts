import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { requireMinimumRole } from "../core/utils.js";

export async function handleStorageRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "storage") return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);
  const user = await requireUser(request, env);
  requireMinimumRole(user, ["ADMIN"]);

  if (pathSegments.length === 1 && request.method === "GET") {
    return jsonResponse({
      driver: "supabase-postgres-cloudflare",
      databasePath: "Supabase PostgreSQL",
      databaseSizeBytes: 0,
      dbExists: true,
      databaseMissingReason: null,
      backupDirectory: "Managed by Supabase project backups / PITR settings",
      backups: [],
      note: "Local SQLite backup/restore controls are disabled in the Cloudflare + Supabase architecture.",
    });
  }

  if (pathSegments[1] === "backups" && request.method === "POST") {
    throw new HttpError("Local backups are disabled. Use Supabase managed backups or point-in-time recovery.", 409);
  }

  if (pathSegments[1] === "restore" && request.method === "POST") {
    throw new HttpError("Local restore is disabled. Restore through Supabase database backups.", 409);
  }

  return null;
}
