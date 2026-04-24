import { loginSchema } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { readJsonBody } from "../common/validation.js";
import type { BackendEnv } from "../app.js";
import { findUserProfileByEmail, findUserProfileById, signInWithPassword } from "../db/supabase-rest.js";
import type { AuthUser } from "./types.js";

export type LoginResult = {
  user: AuthUser;
};

export async function loginWithPassword(request: Request, env: BackendEnv): Promise<LoginResult> {
  const rawBody = await readJsonBody(request);
  const parsed = loginSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HttpError("Invalid login payload", 400, parsed.error.flatten());
  }

  const authUser = await signInWithPassword(env, parsed.data);
  const profile = await findUserProfileByEmail(env, authUser.email, authUser.authUserId);

  if (!profile) {
    throw new HttpError("User profile not found", 403);
  }

  return {
    user: profile,
  };
}

export async function refreshUserProfile(env: BackendEnv, sessionUser: AuthUser): Promise<AuthUser> {
  const profile = await findUserProfileById(env, sessionUser.id, sessionUser.authUserId);

  if (!profile) {
    throw new HttpError("Session user not found", 401);
  }

  return profile;
}
