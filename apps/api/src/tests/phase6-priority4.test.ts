import test from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { logLevelForStatus, publicErrorMessage, resolveRequestId } from "../lib/observability.js";

type PrismaMock = {
  $queryRawUnsafe: (query: string) => Promise<unknown>;
  user: {
    findUnique: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
  };
};

const prismaMock: PrismaMock = {
  $queryRawUnsafe: async () => [{ ok: 1 }],
  user: {
    findUnique: async () => null,
    create: async () => ({ id: "u_1", email: "new@example.com", fullName: "New User" }),
  },
};

globalThis.__smartcrm_prisma__ = prismaMock as never;

async function createTestApp() {
  const { buildApp } = await import("../app.js");
  const app = buildApp();
  await app.ready();
  return app;
}

async function closeApp(app: FastifyInstance) {
  await app.close();
}

test("resolveRequestId prefers explicit request headers before generating a random id", () => {
  assert.equal(resolveRequestId({ "x-request-id": "req-123", "cf-ray": "cf-1" }), "req-123");
  assert.equal(resolveRequestId({ "cf-ray": "cf-1" }), "cf-1");
  assert.match(resolveRequestId({}), /^[a-f0-9-]{36}$/i);
});

test("observability helpers classify status codes safely", () => {
  assert.equal(logLevelForStatus(200), "info");
  assert.equal(logLevelForStatus(404), "warn");
  assert.equal(logLevelForStatus(503), "error");
  assert.equal(publicErrorMessage(500, new Error("db exploded")), "Internal server error");
  assert.equal(publicErrorMessage(400, new Error("Bad input")), "Bad input");
});

test("health endpoints expose request ids and readiness status", async () => {
  prismaMock.$queryRawUnsafe = async () => [{ ok: 1 }];
  const app = await createTestApp();

  const liveResponse = await app.inject({
    method: "GET",
    url: "/health/live",
    headers: {
      "x-request-id": "req-live-1",
      "cf-ray": "cf-live-1",
    },
  });

  assert.equal(liveResponse.statusCode, 200);
  assert.equal(liveResponse.headers["x-request-id"], "req-live-1");
  assert.match(String(liveResponse.headers["x-response-time"]), /ms$/);
  assert.equal(liveResponse.json().status, "live");

  const readyResponse = await app.inject({ method: "GET", url: "/health/ready" });
  assert.equal(readyResponse.statusCode, 200);
  assert.equal(readyResponse.json().status, "ready");
  assert.equal(readyResponse.json().database.reachable, true);

  await closeApp(app);
});

test("readiness failures surface 503 responses with request ids", async () => {
  prismaMock.$queryRawUnsafe = async () => {
    throw new Error("database down");
  };
  const app = await createTestApp();

  const response = await app.inject({
    method: "GET",
    url: "/health/ready",
    headers: { "cf-ray": "cf-ready-2" },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["x-request-id"], "cf-ready-2");
  assert.equal(response.json().ok, false);
  assert.equal(response.json().database.reachable, false);

  await closeApp(app);
});

test("not found responses include stable request ids for tracing", async () => {
  prismaMock.$queryRawUnsafe = async () => [{ ok: 1 }];
  const app = await createTestApp();

  const response = await app.inject({
    method: "GET",
    url: "/missing-route",
    headers: { "x-request-id": "req-missing-1" },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().requestId, "req-missing-1");
  assert.equal(response.json().code, "NOT_FOUND");

  await closeApp(app);
});
