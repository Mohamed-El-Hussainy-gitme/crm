import { HttpError } from "../common/errors.js";

export type SupabaseRuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type SupabaseRuntimeConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

export function resolveSupabaseConfig(env: SupabaseRuntimeEnv): SupabaseRuntimeConfig {
  const missing = [
    ["SUPABASE_URL", env.SUPABASE_URL],
    ["SUPABASE_ANON_KEY", env.SUPABASE_ANON_KEY],
    ["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new HttpError(`Missing Supabase environment variables: ${missing.join(", ")}`, 500);
  }

  return {
    url: env.SUPABASE_URL as string,
    anonKey: env.SUPABASE_ANON_KEY as string,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}
