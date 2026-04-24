import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import authPlugin from "./plugins/auth.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import {
  buildRequestLogPayload,
  formatResponseTimeMs,
  logLevelForStatus,
  markRequestStart,
  publicErrorMessage,
  resolveRequestId,
  RESPONSE_REQUEST_ID_HEADER,
  RESPONSE_TIME_HEADER,
  serializeError,
} from "./lib/observability.js";
import { authRoutes } from "./modules/auth/routes.js";
import { contactRoutes } from "./modules/contacts/routes.js";
import { taskRoutes } from "./modules/tasks/routes.js";
import { noteRoutes } from "./modules/notes/routes.js";
import { callRoutes } from "./modules/calls/routes.js";
import { paymentRoutes } from "./modules/payments/routes.js";
import { broadcastRoutes } from "./modules/broadcasts/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { whatsappRoutes } from "./modules/whatsapp/routes.js";
import { storageRoutes } from "./modules/storage/routes.js";
import { followUpRoutes } from "./modules/followups/routes.js";
import { dealRoutes } from "./modules/deals/routes.js";
import { notificationRoutes } from "./modules/notifications/routes.js";
import { reportRoutes } from "./modules/reports/routes.js";
import { companyRoutes } from "./modules/companies/routes.js";
import { dataToolRoutes } from "./modules/data-tools/routes.js";
import { intelligenceRoutes } from "./modules/intelligence/routes.js";
import { settingsRoutes } from "./modules/settings/routes.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { automationRoutes } from "./modules/automations/routes.js";
import { agendaRoutes } from "./modules/agenda/routes.js";

async function readinessPayload() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return {
      ok: true,
      status: "ready",
      database: {
        provider: env.DATABASE_PROVIDER,
        reachable: true,
      },
      proxyAware: env.TRUST_PROXY,
    };
  } catch (error) {
    return {
      ok: false,
      status: "degraded",
      database: {
        provider: env.DATABASE_PROVIDER,
        reachable: false,
      },
      proxyAware: env.TRUST_PROXY,
      error: error instanceof Error ? error.message : "Database not reachable",
    };
  }
}

export function buildApp() {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY,
    disableRequestLogging: true,
    requestIdHeader: false,
    genReqId: (request) => resolveRequestId(request.headers),
    logger: {
      level: env.LOG_LEVEL,
      base: { service: "smartcrm-api" },
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "headers.authorization",
          "headers.cookie",
          "set-cookie",
        ],
        censor: "[redacted]",
      },
    },
  });

  app.register(cors, { origin: env.CORS_ORIGINS_LIST, credentials: true });
  app.register(sensible);
  app.register(swagger, { openapi: { info: { title: "Smart CRM API", version: "1.0.0" } } });
  app.register(authPlugin);

  app.addHook("onRequest", async (request, reply) => {
    markRequestStart(request);
    reply.header(RESPONSE_REQUEST_ID_HEADER, request.id);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header(RESPONSE_REQUEST_ID_HEADER, request.id);
    const responseTime = formatResponseTimeMs(buildRequestLogPayload(request, reply.statusCode).responseTimeMs ?? null);
    if (responseTime) reply.header(RESPONSE_TIME_HEADER, responseTime);
    return payload;
  });

  app.addHook("onResponse", async (request, reply) => {
    const payload = buildRequestLogPayload(request, reply.statusCode);
    const level = logLevelForStatus(reply.statusCode);
    request.log[level](payload, "request completed");
  });

  app.get("/health/live", async () => ({
    ok: true,
    status: "live",
    service: "smartcrm-api",
    database: env.DATABASE_PROVIDER,
    proxyAware: env.TRUST_PROXY,
  }));

  app.get("/health/ready", async (request, reply) => {
    const payload = await readinessPayload();
    if (!payload.ok) return reply.code(503).send(payload);
    return payload;
  });

  app.get("/health", async (request, reply) => {
    const payload = await readinessPayload();
    if (!payload.ok) return reply.code(503).send(payload);
    return payload;
  });

  app.register(authRoutes, { prefix: "/api" });
  app.register(contactRoutes, { prefix: "/api" });
  app.register(companyRoutes, { prefix: "/api" });
  app.register(taskRoutes, { prefix: "/api" });
  app.register(noteRoutes, { prefix: "/api" });
  app.register(callRoutes, { prefix: "/api" });
  app.register(paymentRoutes, { prefix: "/api" });
  app.register(broadcastRoutes, { prefix: "/api" });
  app.register(dashboardRoutes, { prefix: "/api" });
  app.register(whatsappRoutes, { prefix: "/api" });
  app.register(storageRoutes, { prefix: "/api" });
  app.register(followUpRoutes, { prefix: "/api" });
  app.register(dealRoutes, { prefix: "/api" });
  app.register(notificationRoutes, { prefix: "/api" });
  app.register(reportRoutes, { prefix: "/api" });
  app.register(dataToolRoutes, { prefix: "/api" });
  app.register(intelligenceRoutes, { prefix: "/api" });
  app.register(settingsRoutes, { prefix: "/api" });
  app.register(auditRoutes, { prefix: "/api" });
  app.register(automationRoutes, { prefix: "/api" });
  app.register(agendaRoutes, { prefix: "/api" });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      message: "Route not found",
      code: "NOT_FOUND",
      requestId: request.id,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error instanceof Error ? error : new Error("Unknown error");
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === "number"
      ? ((error as { statusCode: number }).statusCode)
      : 500;

    request.log.error(
      {
        ...buildRequestLogPayload(request, statusCode),
        error: serializeError(err, env.NODE_ENV !== "production"),
      },
      "request failed",
    );

    reply.status(statusCode).send({
      message: publicErrorMessage(statusCode, err),
      code: err.name,
      requestId: request.id,
    });
  });

  return app;
}
