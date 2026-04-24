import { buildWhatsappUrl, digitsOnly, normalizeWhatsappPhone } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { readJsonBody } from "../common/validation.js";
import type { AuthUser } from "../auth/types.js";
import type { ContactRow, CompanyRow, TaskRow, UserProfileRow } from "./types.js";

export const CONTACT_TOUCH_TASK_TYPES = ["FOLLOW_UP", "CALL", "WHATSAPP", "MEETING", "GENERAL"] as const;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix = "c"): string {
  const random = new Uint8Array(12);
  crypto.getRandomValues(random);
  const randomPart = Array.from(random, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 18);
  return `${prefix}${Date.now().toString(36)}${randomPart}`.slice(0, 30);
}

export function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function normalizePhone(value?: string | null): string | null {
  return normalizeWhatsappPhone(value) ?? digitsOnly(value);
}

export function splitTags(tags?: string | null): string[] {
  return (tags ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function uniqueTags(tags: string[] = []): string {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).join(",");
}

export function serializeContact(contact: ContactRow, company?: CompanyRow | null) {
  return {
    ...contact,
    expectedDealValue: Number(contact.expectedDealValue ?? 0),
    companyName: company?.name ?? contact.company ?? null,
    companyRecord: company ?? null,
    tags: splitTags(contact.tags),
    whatsappUrl: buildWhatsappUrl(contact.normalizedPhone || contact.phone, `Hello ${contact.fullName}`),
  };
}

export function serializeTask(task: TaskRow, contact?: Pick<ContactRow, "id" | "fullName" | "company" | "stage"> | null, owner?: Pick<UserProfileRow, "fullName"> | null) {
  return {
    ...task,
    contact: contact ?? null,
    owner: owner ? { fullName: owner.fullName } : null,
  };
}

export function serializeCompany(company: CompanyRow, contactCount = 0, dealCount = 0, openPipelineValue = 0) {
  return {
    ...company,
    contactCount,
    dealCount,
    openPipelineValue,
    _count: {
      contacts: contactCount,
      deals: dealCount,
    },
  };
}

export function requiresContactTouch(type?: string | null): boolean {
  return Boolean(type && CONTACT_TOUCH_TASK_TYPES.includes(type as (typeof CONTACT_TOUCH_TASK_TYPES)[number]));
}

export function dateAtStartOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function dateAtEndOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function endOfWeek(date: Date): Date {
  const start = dateAtStartOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff + 6);
  return dateAtEndOfDay(start);
}

export async function readOptionalJsonBody<T = unknown>(request: Request): Promise<T> {
  if (!request.headers.get("content-type") && request.headers.get("content-length") === "0") {
    return {} as T;
  }

  if (!request.headers.get("content-type")) {
    const clone = request.clone();
    const text = await clone.text();
    if (!text.trim()) return {} as T;
  }

  return readJsonBody<T>(request);
}

export function requireMinimumRole(user: AuthUser, allowed: AuthUser["role"][]): void {
  if (!allowed.includes(user.role)) {
    throw new HttpError("Insufficient permissions", 403);
  }
}

export function parsePathId(segments: string[], index: number): string {
  const id = segments[index];
  if (!id) throw new HttpError("Missing route id", 400);
  return id;
}

export function parsePositiveInt(value: string | null, fallback: number, max = 500): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function parseDate(value: string, field: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(`Invalid ${field}`, 400);
  }
  return date.toISOString();
}

export function withinRange(value: string | null | undefined, from: Date, to: Date): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= from.getTime() && timestamp <= to.getTime();
}

export type GroupedCount = Record<string, unknown> & { _count: Record<string, number> };
export type GroupedCountSum = Record<string, unknown> & { _count: Record<string, number>; _sum: Record<string, number> };

export function groupCount<T extends object>(rows: T[], field: keyof T): GroupedCount[] {
  const counts = new Map<string | null, number>();
  for (const row of rows) {
    const raw = (row as Record<string, unknown>)[String(field)];
    const key = raw == null ? null : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([value, count]) => ({ [String(field)]: value, _count: { [String(field)]: count } }));
}

export function groupCountSum<T extends object>(rows: T[], groupField: keyof T, sumField: keyof T): GroupedCountSum[] {
  const grouped = new Map<string | null, { count: number; sum: number }>();
  for (const row of rows) {
    const raw = row[groupField];
    const key = raw == null ? null : String(raw);
    const current = grouped.get(key) ?? { count: 0, sum: 0 };
    current.count += 1;
    current.sum += Number((row as Record<string, unknown>)[String(sumField)] ?? 0);
    grouped.set(key, current);
  }
  return Array.from(grouped.entries()).map(([value, stats]) => ({ [String(groupField)]: value, _count: { [String(groupField)]: stats.count }, _sum: { [String(sumField)]: stats.sum } }));
}
export function buildCsv(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
