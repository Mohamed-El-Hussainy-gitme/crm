import { errorResponse, HttpError } from "./common/errors.js";
import { jsonResponse, methodNotAllowed, noContentResponse } from "./common/http.js";
import { handleHealth } from "./health/routes.js";
import { handleLogin, handleLogout, handleMe } from "./auth/routes.js";
import { handleAgendaRoute } from "./agenda/routes.js";
import { handleAuditRoute } from "./audit/routes.js";
import { handleAutomationsRoute } from "./automations/routes.js";
import { handleBroadcastsRoute } from "./broadcasts/routes.js";
import { handleCallsRoute } from "./calls/routes.js";
import { handleContactsRoute } from "./contacts/routes.js";
import { handleCompaniesRoute } from "./companies/routes.js";
import { handleDataToolsRoute } from "./data-tools/routes.js";
import { handleDealsRoute } from "./deals/routes.js";
import { handleFollowUpsRoute } from "./followups/routes.js";
import { handleIntelligenceRoute } from "./intelligence/routes.js";
import { handleNotificationsRoute } from "./notifications/routes.js";
import { handlePaymentsRoute } from "./payments/routes.js";
import { handleReportsRoute } from "./reports/routes.js";
import { handleSettingsRoute } from "./settings/routes.js";
import { handleStorageRoute } from "./storage/routes.js";
import { handleTasksRoute } from "./tasks/routes.js";
import { handleWhatsappRoute } from "./whatsapp/routes.js";

export type BackendEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SESSION_SECRET?: string;
  SESSION_COOKIE_NAME?: string;
  SESSION_COOKIE_DOMAIN?: string;
  SESSION_MAX_AGE_SECONDS?: string;
  APP_URL?: string;
  CORS_ORIGINS?: string;
};

export type BackendExecutionContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

type BackendHandler = (request: Request, env: BackendEnv, ctx?: BackendExecutionContext) => Response | Promise<Response>;

type RouteDefinition = {
  method: string;
  path: string;
  handler: BackendHandler;
};

const API_PREFIX = "/api";

function normalizePath(pathname: string): string {
  if (pathname === API_PREFIX) return "/";
  if (pathname.startsWith(`${API_PREFIX}/`)) {
    return pathname.slice(API_PREFIX.length) || "/";
  }
  return pathname;
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function createRouteMap(routes: RouteDefinition[]): Map<string, BackendHandler> {
  const routeMap = new Map<string, BackendHandler>();

  for (const route of routes) {
    routeMap.set(routeKey(route.method, route.path), route.handler);
  }

  return routeMap;
}

export function createBackendApp() {
  const routes = createRouteMap([
    { method: "GET", path: "/health", handler: handleHealth },
    { method: "GET", path: "/health/live", handler: handleHealth },
    { method: "GET", path: "/health/ready", handler: handleHealth },
    { method: "POST", path: "/auth/login", handler: handleLogin },
    { method: "GET", path: "/auth/me", handler: handleMe },
    { method: "POST", path: "/auth/logout", handler: handleLogout },
  ]);

  return {
    async fetch(request: Request, env: BackendEnv, ctx?: BackendExecutionContext): Promise<Response> {
      try {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
          return noContentResponse();
        }

        if (!url.pathname.startsWith(API_PREFIX)) {
          throw new HttpError("Route not found", 404, { path: url.pathname });
        }

        const path = normalizePath(url.pathname);
        const handler = routes.get(routeKey(request.method, path));

        if (handler) {
          return await handler(request, env, ctx);
        }

        const pathSegments = path.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
        const convertedHandlers = [
          handleAgendaRoute,
          handleAuditRoute,
          handleAutomationsRoute,
          handleBroadcastsRoute,
          handleWhatsappRoute,
          handleIntelligenceRoute,
          handleFollowUpsRoute,
          handlePaymentsRoute,
          handleCallsRoute,
          handleContactsRoute,
          handleCompaniesRoute,
          handleDataToolsRoute,
          handleDealsRoute,
          handleNotificationsRoute,
          handleReportsRoute,
          handleSettingsRoute,
          handleStorageRoute,
          handleTasksRoute,
        ];

        for (const convertedHandler of convertedHandlers) {
          const convertedResponse = await convertedHandler(request, env, pathSegments, ctx);
          if (convertedResponse) {
            return convertedResponse;
          }
        }

        const methodAllowedForPath = [...routes.keys()].some((key) => key.endsWith(` ${path}`));
        if (methodAllowedForPath) {
          const allowedMethods = [...routes.keys()]
            .filter((key) => key.endsWith(` ${path}`))
            .map((key) => key.split(" ")[0])
            .filter((method): method is string => Boolean(method));
          return methodNotAllowed(allowedMethods);
        }

        return jsonResponse(
          {
            message: "Route not found",
            path: url.pathname,
            phase: "phase-4-cloudflare-fullstack-complete",
          },
          { status: 404 },
        );
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
