import { clearStoredSession } from "@/lib/session";

export function resolveApiUrl(value = process.env.NEXT_PUBLIC_API_URL): string {
  const raw = (value || "http://localhost:4000/api").trim().replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function handleUnauthorized() {
  if (typeof window === "undefined") return;
  clearStoredSession();
}

async function parseResponse(response: Response) {
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  return raw ? (isJson ? JSON.parse(raw) : raw) : undefined;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
    credentials: options.credentials ?? "include",
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data && typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : typeof data === "string" && data.trim()
          ? data
          : "Request failed";

    if (response.status === 401) {
      handleUnauthorized();
    }

    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export function apiGet<T>(path: string) {
  return apiFetch<T>(path);
}

export function apiPost<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
}

export async function apiDelete(path: string): Promise<void> {
  await apiFetch(path, { method: "DELETE" });
}
