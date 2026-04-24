import { jsonResponse } from "../common/http.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { assertTrustedOrigin, buildClearSessionCookieHeader, buildSetSessionCookieHeader, encodeSessionCookieValue, publicSessionMeta, requireUser, resolveSessionConfig } from "./session.js";
import { loginWithPassword, refreshUserProfile } from "./service.js";

type HandlerContext = BackendExecutionContext | undefined;

export async function handleLogin(request: Request, env: BackendEnv, _ctx?: HandlerContext): Promise<Response> {
  const result = await loginWithPassword(request, env);
  const config = resolveSessionConfig(env, request);
  const cookieValue = await encodeSessionCookieValue(config, result.user);

  return jsonResponse(
    {
      user: result.user,
      session: publicSessionMeta(env),
    },
    {
      headers: {
        "set-cookie": buildSetSessionCookieHeader(config, cookieValue),
      },
    },
  );
}

export async function handleMe(request: Request, env: BackendEnv, _ctx?: HandlerContext): Promise<Response> {
  const sessionUser = await requireUser(request, env);
  const user = await refreshUserProfile(env, sessionUser);

  return jsonResponse({
    user,
    session: publicSessionMeta(env),
  });
}

export async function handleLogout(request: Request, env: BackendEnv, _ctx?: HandlerContext): Promise<Response> {
  assertTrustedOrigin(request, env);

  return jsonResponse(
    { ok: true },
    {
      headers: {
        "set-cookie": buildClearSessionCookieHeader(env, request),
      },
    },
  );
}
