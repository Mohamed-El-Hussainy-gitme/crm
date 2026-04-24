import { HttpError } from "../common/errors.js";
import { parseCookies, serializeCookie } from "../common/cookies.js";
import type { BackendEnv } from "../app.js";
import { toAuthUser, type AuthUser, type UserRole } from "./types.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_COOKIE_NAME = "smartcrm_session";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 12;
const MIN_SESSION_SECRET_LENGTH = 16;
const SESSION_VERSION = 1;

type SignedSessionPayload = {
  version: typeof SESSION_VERSION;
  user: AuthUser;
  issuedAt: number;
  expiresAt: number;
};

export type PublicSessionMeta = {
  cookieName: string;
  maxAgeSeconds: number;
};

export type SessionConfig = {
  cookieName: string;
  cookieDomain?: string;
  maxAgeSeconds: number;
  secret: string;
  secure: boolean;
};

const DISALLOWED_COOKIE_DOMAINS = new Set(["pages.dev", "workers.dev", "cloudflareworkers.com"]);

function normalizeCookieDomain(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  let candidate = raw;

  try {
    candidate = new URL(raw).hostname;
  } catch {
    candidate = raw;
  }

  candidate = candidate.trim().replace(/^\.+/, "").replace(/\.+$/, "").toLowerCase();

  if (!candidate || candidate === "localhost" || candidate.includes(":")) return undefined;
  if (DISALLOWED_COOKIE_DOMAINS.has(candidate)) return undefined;

  return candidate;
}

function resolveCookieDomain(env: BackendEnv, request: Request): string | undefined {
  const configuredDomain = normalizeCookieDomain(env.SESSION_COOKIE_DOMAIN);
  if (!configuredDomain) return undefined;

  const hostname = new URL(request.url).hostname.toLowerCase();

  if (hostname === configuredDomain) {
    return undefined;
  }

  if (!hostname.endsWith(`.${configuredDomain}`)) {
    return undefined;
  }

  return configuredDomain;
}

function textEncoder() {
  return new TextEncoder();
}

function textDecoder() {
  return new TextDecoder();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(textEncoder().encode(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(textDecoder().decode(base64UrlToBytes(value))) as T;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = base64UrlToBytes(left);
  const rightBytes = base64UrlToBytes(right);

  if (leftBytes.length !== rightBytes.length) return false;

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isHttpsRequest(request: Request, env: BackendEnv): boolean {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto?.toLowerCase() === "https") return true;

  return Boolean(env.APP_URL?.startsWith("https://"));
}

export function resolveSessionConfig(env: BackendEnv, request: Request): SessionConfig {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new HttpError(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`, 500);
  }

  const config: SessionConfig = {
    cookieName: env.SESSION_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME,
    maxAgeSeconds: parsePositiveInteger(env.SESSION_MAX_AGE_SECONDS, DEFAULT_MAX_AGE_SECONDS),
    secret,
    secure: isHttpsRequest(request, env),
  };

  const cookieDomain = resolveCookieDomain(env, request);
  if (cookieDomain) {
    config.cookieDomain = cookieDomain;
  }

  return config;
}

export function publicSessionMeta(env: BackendEnv): PublicSessionMeta {
  return {
    cookieName: env.SESSION_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME,
    maxAgeSeconds: parsePositiveInteger(env.SESSION_MAX_AGE_SECONDS, DEFAULT_MAX_AGE_SECONDS),
  };
}

export async function encodeSessionCookieValue(config: SessionConfig, user: AuthUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SignedSessionPayload = {
    version: SESSION_VERSION,
    user,
    issuedAt: now,
    expiresAt: now + config.maxAgeSeconds,
  };

  const encodedPayload = encodeJson(payload);
  const signature = await signPayload(encodedPayload, config.secret);
  return `${encodedPayload}.${signature}`;
}

export async function decodeSessionCookieValue(config: SessionConfig, value: string): Promise<SignedSessionPayload> {
  const [encodedPayload, signature, extra] = value.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    throw new HttpError("Invalid session", 401);
  }

  const expectedSignature = await signPayload(encodedPayload, config.secret);
  let signatureValid = false;
  try {
    signatureValid = timingSafeEqual(signature, expectedSignature);
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    throw new HttpError("Invalid session", 401);
  }

  let payload: SignedSessionPayload;
  try {
    payload = decodeJson<SignedSessionPayload>(encodedPayload);
  } catch {
    throw new HttpError("Invalid session", 401);
  }

  if (payload.version !== SESSION_VERSION) {
    throw new HttpError("Invalid session version", 401);
  }

  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new HttpError("Session expired", 401);
  }

  const normalizedUser = toAuthUser(payload.user);
  if (!normalizedUser) {
    throw new HttpError("Invalid session user", 401);
  }

  return {
    ...payload,
    user: normalizedUser,
  };
}

export async function readSession(request: Request, env: BackendEnv): Promise<SignedSessionPayload | null> {
  const config = resolveSessionConfig(env, request);
  const cookies = parseCookies(request.headers.get("cookie"));
  const rawCookie = cookies.get(config.cookieName);

  if (!rawCookie) return null;

  return decodeSessionCookieValue(config, rawCookie);
}

export async function requireUser(request: Request, env: BackendEnv): Promise<AuthUser> {
  const session = await readSession(request, env);
  if (!session) {
    throw new HttpError("Unauthorized", 401);
  }

  return session.user;
}

export function buildSetSessionCookieHeader(config: SessionConfig, value: string): string {
  const options = {
    httpOnly: true,
    secure: config.secure,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: config.maxAgeSeconds,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };

  return serializeCookie(config.cookieName, value, options);
}

export function buildClearSessionCookieHeader(env: BackendEnv, request: Request): string {
  const config = resolveSessionConfig(env, request);
  const options = {
    httpOnly: true,
    secure: config.secure,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };

  return serializeCookie(config.cookieName, "", options);
}

function normalizedOrigin(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

function allowedOrigins(request: Request, env: BackendEnv): Set<string> {
  const requestUrl = new URL(request.url);
  const values = [requestUrl.origin, env.APP_URL, ...(env.CORS_ORIGINS ?? "").split(",")];
  return new Set(values.map((value) => normalizedOrigin(value?.trim())).filter((value): value is string => Boolean(value)));
}

export function assertTrustedOrigin(request: Request, env: BackendEnv): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const origin = normalizedOrigin(request.headers.get("origin")) ?? normalizedOrigin(request.headers.get("referer"));
  if (!origin) {
    throw new HttpError("Origin header is required", 403);
  }

  if (!allowedOrigins(request, env).has(origin)) {
    throw new HttpError("Untrusted request origin", 403);
  }
}

export function can(user: AuthUser, minimum: UserRole): boolean {
  const ranks: Record<UserRole, number> = {
    VIEWER: 10,
    SALES_REP: 20,
    SALES_MANAGER: 30,
    ADMIN: 40,
  };

  return ranks[user.role] >= ranks[minimum];
}
