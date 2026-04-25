import { normalizePhone } from "../core/utils.js";

export type ExtractedPhone = {
  value: string;
  normalized: string;
  kind: "mobile" | "landline" | "unknown";
  source: "tel" | "structured" | "text";
  score: number;
};

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);
}

function decodeLoose(value: string): string {
  let current = value
    .replace(/\\u002b/gi, "+")
    .replace(/\\u003a/gi, ":")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }

  return normalizeDigits(current);
}

function uniqueCorpus(input: string): string[] {
  const decoded = decodeLoose(input);
  return Array.from(new Set([input, decoded, decoded.replace(/[._-]/g, " "), decoded.replace(/\\+/g, " ")]));
}

function toLocalEgyptianPhone(rawValue: string): { value: string; normalized: string; kind: ExtractedPhone["kind"] } | null {
  const raw = normalizeDigits(rawValue);
  let digits = raw.replace(/[^0-9+]/g, "");

  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (digits.startsWith("20")) digits = `0${digits.slice(2)}`;
  if (/^1[0125]\d{8}$/.test(digits)) digits = `0${digits}`;
  if (/^2\d{8}$/.test(digits)) digits = `0${digits}`;
  if (/^3\d{7}$/.test(digits)) digits = `0${digits}`;

  let kind: ExtractedPhone["kind"] = "unknown";
  if (/^01[0125]\d{8}$/.test(digits)) kind = "mobile";
  else if (/^0(?:2\d{8}|3\d{7}|4\d{7,8}|5\d{7,8}|6\d{7,8}|8\d{7,8}|9\d{7,8})$/.test(digits)) kind = "landline";
  else return null;

  const normalized = normalizePhone(digits) ?? digits;
  if (!normalized || normalized.length < 9 || normalized.length > 14) return null;

  return { value: digits, normalized, kind };
}

function addCandidate(candidates: Map<string, ExtractedPhone>, rawValue: string, source: ExtractedPhone["source"], sourceBoost = 0): void {
  if (source === "text" && /\d{1,3}\.\d{4,}/.test(rawValue)) return;
  const parsed = toLocalEgyptianPhone(rawValue);
  if (!parsed) return;

  const existing = candidates.get(parsed.normalized);
  const score = (parsed.kind === "mobile" ? 80 : parsed.kind === "landline" ? 62 : 40) + sourceBoost;
  const next: ExtractedPhone = { ...parsed, source, score };

  if (!existing || next.score > existing.score) {
    candidates.set(parsed.normalized, next);
  }
}

export function extractPhones(input?: string | null): ExtractedPhone[] {
  if (!input) return [];
  const candidates = new Map<string, ExtractedPhone>();

  for (const text of uniqueCorpus(input)) {
    const telPatterns = [
      /(?:tel:|phone:tel:|data-item-id=["']phone:tel:)(\+?\d[\d\s().-]{7,20})/gi,
      /(?:الهاتف|تليفون|موبايل|اتصال|phone|telephone|call)\s*[:：]?\s*(\+?\d[\d\s().-]{7,20})/gi,
    ];

    for (const pattern of telPatterns) {
      for (const match of text.matchAll(pattern)) {
        if (match[1]) addCandidate(candidates, match[1], "tel", 28);
      }
    }

    const egyptMobilePattern = /(?:\+?20|0020)?\s*0?1[0125](?:[\s().-]*\d){8}\b/g;
    for (const match of text.matchAll(egyptMobilePattern)) {
      addCandidate(candidates, match[0], "text", 10);
    }

  }

  return [...candidates.values()].sort((left, right) => right.score - left.score || left.value.localeCompare(right.value));
}

export function extractPrimaryPhone(input?: string | null): string | null {
  return extractPhones(input)[0]?.value ?? null;
}

export function mergePhoneCandidates(...groups: Array<Array<string | null | undefined> | undefined>): string[] {
  const candidates = new Map<string, string>();
  for (const group of groups) {
    for (const phone of group ?? []) {
      const parsed = toLocalEgyptianPhone(String(phone ?? ""));
      if (parsed && !candidates.has(parsed.normalized)) candidates.set(parsed.normalized, parsed.value);
    }
  }
  return [...candidates.values()];
}
