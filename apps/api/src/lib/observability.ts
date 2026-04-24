import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";

const REQUEST_ID_HEADERS = ["x-request-id", "x-correlation-id", "cf-ray"] as const;
const requestStartTimes = new WeakMap<FastifyRequest, bigint>();

export const RESPONSE_REQUEST_ID_HEADER = "x-request-id";
export const RESPONSE_TIME_HEADER = "x-response-time";

function normalizedHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() || "";
  return typeof value === "string" ? value.trim() : "";
}

export function resolveRequestId(headers: Record<string, string | string[] | undefined>) {
  for (const header of REQUEST_ID_HEADERS) {
    const candidate = normalizedHeader(headers[header]);
    if (candidate) return candidate.slice(0, 128);
  }

  return randomUUID();
}

export function markRequestStart(request: FastifyRequest) {
  requestStartTimes.set(request, process.hrtime.bigint());
}

export function getResponseTimeMs(request: FastifyRequest) {
  const startedAt = requestStartTimes.get(request);
  if (!startedAt) return null;
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

export function formatResponseTimeMs(value: number | null) {
  if (value == null || Number.isNaN(value)) return undefined;
  return `${value.toFixed(1)}ms`;
}

export function logLevelForStatus(statusCode: number): "info" | "warn" | "error" {
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "warn";
  return "info";
}

export function publicErrorMessage(statusCode: number, error: Error) {
  if (statusCode >= 500) return "Internal server error";
  return error.message || "Request failed";
}

export function serializeError(error: Error, includeStack = false) {
  return {
    name: error.name,
    message: error.message,
    ...(includeStack && error.stack ? { stack: error.stack } : {}),
  };
}

export function buildRequestLogPayload(request: FastifyRequest, statusCode: number) {
  const responseTimeMs = getResponseTimeMs(request);
  const cfRay = normalizedHeader(request.headers["cf-ray"]);
  const userAgent = normalizedHeader(request.headers["user-agent"]);
  const forwardedFor = normalizedHeader(request.headers["x-forwarded-for"]);

  return {
    requestId: request.id,
    method: request.method,
    url: request.url,
    route: request.routeOptions.url,
    statusCode,
    ip: request.ip,
    forwardedFor: forwardedFor || undefined,
    cfRay: cfRay || undefined,
    userAgent: userAgent || undefined,
    responseTimeMs: responseTimeMs == null ? undefined : Number(responseTimeMs.toFixed(1)),
  };
}
