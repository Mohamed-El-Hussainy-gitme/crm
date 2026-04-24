import { HttpError } from "../common/errors.js";
import { resolveSupabaseConfig, type SupabaseRuntimeEnv } from "./supabase.js";
import { toAuthUser, type AuthUser } from "../auth/types.js";

type SupabaseAuthUser = {
  id: string;
  email?: string;
};

type SupabasePasswordTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  user?: SupabaseAuthUser;
};

type SupabaseErrorPayload = {
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
  code?: string;
  hint?: string;
  details?: string;
};

type UserProfileRow = {
  id?: unknown;
  fullName?: unknown;
  email?: unknown;
  role?: unknown;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError("Supabase returned invalid JSON", 502);
  }
}

function supabaseMessage(payload: SupabaseErrorPayload | unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const error = payload as SupabaseErrorPayload;
  return error.error_description || error.message || error.msg || error.error || fallback;
}

async function assertSupabaseOk<T>(response: Response, fallback: string, statusOverride?: number): Promise<T> {
  const payload = await parseJsonResponse<T | SupabaseErrorPayload>(response);

  if (!response.ok) {
    const status = statusOverride ?? (response.status >= 500 ? 502 : response.status);
    throw new HttpError(supabaseMessage(payload, fallback), status, payload);
  }

  return payload as T;
}

function supabaseHeaders(apiKey: string, bearerToken = apiKey): HeadersInit {
  return {
    apikey: apiKey,
    authorization: `Bearer ${bearerToken}`,
    "content-type": "application/json",
  };
}

export async function signInWithPassword(
  env: SupabaseRuntimeEnv,
  input: { email: string; password: string },
): Promise<{ authUserId: string; email: string }> {
  const config = resolveSupabaseConfig(env);
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: supabaseHeaders(config.anonKey),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });

  const payload = await assertSupabaseOk<SupabasePasswordTokenResponse>(response, "Invalid credentials", 401);
  const authUserId = payload.user?.id;
  const email = payload.user?.email || input.email;

  if (!authUserId || !email) {
    throw new HttpError("Supabase Auth response did not include a valid user", 502);
  }

  return {
    authUserId,
    email,
  };
}

export async function findUserProfileByEmail(env: SupabaseRuntimeEnv, email: string, authUserId?: string): Promise<AuthUser | null> {
  const config = resolveSupabaseConfig(env);
  const params = new URLSearchParams({
    email: `eq.${email}`,
    select: "id,fullName,email,role",
    limit: "1",
  });

  const response = await fetch(`${config.url}/rest/v1/User?${params.toString()}`, {
    method: "GET",
    headers: {
      ...supabaseHeaders(config.serviceRoleKey),
      accept: "application/json",
    },
  });

  const rows = await assertSupabaseOk<UserProfileRow[]>(response, "Unable to read user profile");
  const row = rows[0];
  if (!row) return null;

  return toAuthUser({
    ...row,
    ...(authUserId ? { authUserId } : {}),
  });
}

export async function findUserProfileById(env: SupabaseRuntimeEnv, userId: string, authUserId?: string): Promise<AuthUser | null> {
  const config = resolveSupabaseConfig(env);
  const params = new URLSearchParams({
    id: `eq.${userId}`,
    select: "id,fullName,email,role",
    limit: "1",
  });

  const response = await fetch(`${config.url}/rest/v1/User?${params.toString()}`, {
    method: "GET",
    headers: {
      ...supabaseHeaders(config.serviceRoleKey),
      accept: "application/json",
    },
  });

  const rows = await assertSupabaseOk<UserProfileRow[]>(response, "Unable to read user profile");
  const row = rows[0];
  if (!row) return null;

  return toAuthUser({
    ...row,
    ...(authUserId ? { authUserId } : {}),
  });
}
