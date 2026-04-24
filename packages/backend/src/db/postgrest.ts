import { HttpError } from "../common/errors.js";
import { resolveSupabaseConfig, type SupabaseRuntimeEnv } from "./supabase.js";

export type JsonObject = Record<string, unknown>;

export type PostgrestFilter = {
  column: string;
  op?: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "is" | "in" | "like" | "ilike" | "cs" | "contains";
  value: string | number | boolean | null | Array<string | number | boolean>;
};

export type PostgrestOrder = {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
};

export type SelectOptions = {
  select?: string;
  filters?: PostgrestFilter[];
  order?: PostgrestOrder[];
  limit?: number;
  offset?: number;
  or?: string;
  extraParams?: Record<string, string>;
};

export type WriteOptions = {
  select?: string;
  single?: boolean;
};

function formatFilterValue(filter: PostgrestFilter): string {
  const op = filter.op ?? "eq";

  if (op === "in") {
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    const formatted = values.map((value) => String(value).replace(/"/g, "\\\"")).join(",");
    return `in.(${formatted})`;
  }

  if (op === "is") {
    return `is.${filter.value === null ? "null" : String(filter.value)}`;
  }

  const actualOp = op === "contains" ? "cs" : op;
  return `${actualOp}.${String(filter.value)}`;
}

function createSearchParams(options: SelectOptions = {}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("select", options.select ?? "*");

  for (const filter of options.filters ?? []) {
    params.append(filter.column, formatFilterValue(filter));
  }

  if (options.or) {
    params.set("or", options.or);
  }

  if (options.order?.length) {
    params.set(
      "order",
      options.order
        .map((item) => {
          const direction = item.ascending === false ? "desc" : "asc";
          const nulls = item.nullsFirst === undefined ? "" : item.nullsFirst ? ".nullsfirst" : ".nullslast";
          return `${item.column}.${direction}${nulls}`;
        })
        .join(","),
    );
  }

  if (typeof options.limit === "number") {
    params.set("limit", String(options.limit));
  }

  if (typeof options.offset === "number") {
    params.set("offset", String(options.offset));
  }

  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    params.set(key, value);
  }

  return params;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError("Supabase returned invalid JSON", 502);
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const value = payload as { message?: unknown; msg?: unknown; error?: unknown; error_description?: unknown; details?: unknown };
  return String(value.message || value.msg || value.error_description || value.error || value.details || fallback);
}

function headers(apiKey: string, prefer?: string): HeadersInit {
  const result: Record<string, string> = {
    apikey: apiKey,
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept: "application/json",
  };

  if (prefer) {
    result.prefer = prefer;
  }

  return result;
}

async function assertOk<T>(response: Response, fallback: string): Promise<T> {
  const payload = await parseJson<T | unknown>(response);

  if (!response.ok) {
    const status = response.status >= 500 ? 502 : response.status;
    throw new HttpError(errorMessage(payload, fallback), status, payload);
  }

  return payload as T;
}

export class PostgrestClient {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;

  constructor(env: SupabaseRuntimeEnv) {
    const config = resolveSupabaseConfig(env);
    this.baseUrl = `${stripTrailingSlash(config.url)}/rest/v1`;
    this.serviceRoleKey = config.serviceRoleKey;
  }

  async select<T>(table: string, options: SelectOptions = {}): Promise<T[]> {
    const params = createSearchParams(options);
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(table)}?${params.toString()}`, {
      method: "GET",
      headers: headers(this.serviceRoleKey),
    });

    return assertOk<T[]>(response, `Unable to read ${table}`);
  }

  async maybeSingle<T>(table: string, options: SelectOptions = {}): Promise<T | null> {
    const rows = await this.select<T>(table, { ...options, limit: 1 });
    return rows[0] ?? null;
  }

  async insert<T>(table: string, value: JsonObject, options: WriteOptions = {}): Promise<T> {
    const params = createSearchParams({ select: options.select ?? "*" });
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(table)}?${params.toString()}`, {
      method: "POST",
      headers: headers(this.serviceRoleKey, "return=representation"),
      body: JSON.stringify(value),
    });

    const payload = await assertOk<T[]>(response, `Unable to create ${table}`);
    const row = payload[0];
    if (!row) throw new HttpError(`Supabase did not return created ${table}`, 502);
    return row;
  }

  async update<T>(table: string, filters: PostgrestFilter[], value: JsonObject, options: WriteOptions = {}): Promise<T[]> {
    const params = createSearchParams({ select: options.select ?? "*", filters });
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(table)}?${params.toString()}`, {
      method: "PATCH",
      headers: headers(this.serviceRoleKey, "return=representation"),
      body: JSON.stringify(value),
    });

    return assertOk<T[]>(response, `Unable to update ${table}`);
  }

  async updateSingle<T>(table: string, filters: PostgrestFilter[], value: JsonObject, options: WriteOptions = {}): Promise<T | null> {
    const rows = await this.update<T>(table, filters, value, options);
    return rows[0] ?? null;
  }

  async delete(table: string, filters: PostgrestFilter[]): Promise<void> {
    const params = createSearchParams({ filters });
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(table)}?${params.toString()}`, {
      method: "DELETE",
      headers: headers(this.serviceRoleKey),
    });

    await assertOk<unknown>(response, `Unable to delete ${table}`);
  }
}

export function createPostgrestClient(env: SupabaseRuntimeEnv): PostgrestClient {
  return new PostgrestClient(env);
}
