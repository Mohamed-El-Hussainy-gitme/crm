import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClearSessionCookieHeader,
  buildSetSessionCookieHeader,
  decodeSessionCookieValue,
  encodeSessionCookieValue,
  publicSessionMeta,
  resolveSessionConfig,
} from "../dist/auth/session.js";

const env = {
  SESSION_SECRET: "test-session-secret-with-enough-entropy",
  SESSION_COOKIE_NAME: "crm_test_session",
  SESSION_MAX_AGE_SECONDS: "3600",
  APP_URL: "https://crm.example.com",
};

function request(url = "https://crm.example.com/api/auth/login") {
  return new Request(url);
}

test("session cookies are signed and decodable", async () => {
  const config = resolveSessionConfig(env, request());
  const value = await encodeSessionCookieValue(config, {
    id: "user_1",
    authUserId: "auth_1",
    email: "admin@example.com",
    fullName: "Admin User",
    role: "ADMIN",
  });

  const decoded = await decodeSessionCookieValue(config, value);

  assert.equal(decoded.user.id, "user_1");
  assert.equal(decoded.user.email, "admin@example.com");
  assert.equal(decoded.user.role, "ADMIN");
  assert.ok(decoded.expiresAt > decoded.issuedAt);
});

test("tampered session cookies are rejected", async () => {
  const config = resolveSessionConfig(env, request());
  const value = await encodeSessionCookieValue(config, {
    id: "user_1",
    email: "admin@example.com",
    fullName: "Admin User",
    role: "ADMIN",
  });

  await assert.rejects(() => decodeSessionCookieValue(config, `${value}tampered`), /Invalid session/);
});

test("set and clear cookie headers use hardened defaults", async () => {
  const config = resolveSessionConfig(env, request());
  const cookie = buildSetSessionCookieHeader(config, "signed-value");
  const clearCookie = buildClearSessionCookieHeader(env, request());

  assert.match(cookie, /crm_test_session=signed-value/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(clearCookie, /Max-Age=0/);
  assert.deepEqual(publicSessionMeta(env), {
    cookieName: "crm_test_session",
    maxAgeSeconds: 3600,
  });
});
