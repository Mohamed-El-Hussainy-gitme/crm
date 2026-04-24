import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizedOrigin(input: string | undefined) {
  if (!input) return null;
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

function resolvedCookieSecure(request?: FastifyRequest) {
  if (env.SESSION_COOKIE_SECURE) return true;
  return request?.protocol === "https";
}

export function getSessionCookieName() {
  return env.SESSION_COOKIE_NAME;
}

export function buildSessionCookieOptions(request?: FastifyRequest) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: resolvedCookieSecure(request),
    domain: env.SESSION_COOKIE_DOMAIN,
    maxAge: env.SESSION_MAX_AGE_SECONDS,
  };
}

export function setSessionCookie(reply: FastifyReply, request: FastifyRequest, token: string) {
  reply.setCookie(getSessionCookieName(), token, buildSessionCookieOptions(request));
}

export function clearSessionCookie(reply: FastifyReply, request?: FastifyRequest) {
  reply.clearCookie(getSessionCookieName(), {
    path: "/",
    domain: env.SESSION_COOKIE_DOMAIN,
    sameSite: "lax",
    secure: resolvedCookieSecure(request),
    httpOnly: true,
  });
}

export function readBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export function readSessionToken(request: FastifyRequest) {
  return readBearerToken(request) ?? request.cookies[getSessionCookieName()] ?? null;
}

export function usesCookieSession(request: FastifyRequest) {
  return !readBearerToken(request) && Boolean(request.cookies[getSessionCookieName()]);
}

export function assertTrustedOrigin(request: FastifyRequest) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  if (!usesCookieSession(request)) return;

  const requestOrigin = normalizedOrigin(request.headers.origin) ?? normalizedOrigin(request.headers.referer);
  if (!requestOrigin) {
    if (env.NODE_ENV !== "production") return;
    throw request.server.httpErrors.forbidden("Origin header is required for cookie-authenticated mutations");
  }

  if (!env.CORS_ORIGINS_LIST.includes(requestOrigin)) {
    throw request.server.httpErrors.forbidden("Untrusted request origin");
  }
}
