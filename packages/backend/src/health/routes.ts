import { jsonResponse } from "../common/http.js";
import type { BackendEnv } from "../app.js";

export function handleHealth(request: Request, env: BackendEnv): Response {
  const url = new URL(request.url);
  const convertedModules = [
    "auth",
    "contacts",
    "companies",
    "tasks",
    "follow-ups",
    "calls",
    "payments",
    "deals",
    "reports",
    "agenda",
    "notifications",
    "intelligence",
    "whatsapp",
    "broadcasts",
    "settings",
    "audit",
    "data-tools",
    "automations",
    "storage-status",
  ];

  return jsonResponse({
    ok: true,
    service: "smartcrm-backend",
    path: url.pathname,
    runtime: "cloudflare-pages-functions",
    phase: "phase-4-cloudflare-fullstack-complete",
    checks: {
      api: true,
      supabaseUrlConfigured: Boolean(env.SUPABASE_URL),
      supabaseAnonKeyConfigured: Boolean(env.SUPABASE_ANON_KEY),
      supabaseServiceRoleKeyConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      sessionSecretConfigured: Boolean(env.SESSION_SECRET),
      sessionCookieName: env.SESSION_COOKIE_NAME || "smartcrm_session",
      legacyProxyRemoved: true,
      convertedModules,
    },
    timestamp: new Date().toISOString(),
  });
}
