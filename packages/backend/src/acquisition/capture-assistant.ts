import type { ContactRow } from "../core/types.js";
import { normalizePhone, splitTags } from "../core/utils.js";
import { coordinatesLabel, normalizeLocationInput } from "./location-normalizer.js";
import { extractPhones, extractPrimaryPhone, mergePhoneCandidates } from "./phone-extractor.js";

type CaptureConfidence = "HIGH" | "MEDIUM" | "LOW";

export type DuplicateCandidate = {
  id: string;
  fullName: string;
  phone: string;
  area: string | null;
  mapUrl: string | null;
  stage: string;
  reason: string;
  score: number;
};

export type CaptureLead = {
  id: string;
  name: string;
  phone: string | null;
  phoneCandidates: string[];
  normalizedPhone: string | null;
  area: string | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinates: string | null;
  plusCode: string | null;
  mapUrl: string | null;
  website: string | null;
  category: string | null;
  rating: string | null;
  reviewCount: string | null;
  source: string;
  notes: string | null;
  score: number;
  confidence: CaptureConfidence;
  tags: string[];
  warnings: string[];
};

const CAFE_TAGS = ["ahwa", "cafe", "prospecting", "maps", "maps-capture"];
const REAL_PHONE_MIN_DIGITS = 8;

const EGYPT_AREAS: Array<[RegExp, string]> = [
  [/مدينة\s*نصر|nasr\s*city/i, "مدينة نصر"],
  [/مصر\s*الجديدة|heliopolis/i, "مصر الجديدة"],
  [/التجمع|القاهرة\s*الجديدة|new\s*cairo|fifth\s*settlement|5th\s*settlement/i, "القاهرة الجديدة"],
  [/المعادي|maadi/i, "المعادي"],
  [/الدقي|dokki/i, "الدقي"],
  [/الزمالك|zamalek/i, "الزمالك"],
  [/المهندسين|mohandessin/i, "المهندسين"],
  [/الشيخ\s*زايد|sheikh\s*zayed/i, "الشيخ زايد"],
  [/السادس\s*من\s*أكتوبر|6th\s*of\s*october|october/i, "6 أكتوبر"],
  [/المقطم|mokattam/i, "المقطم"],
  [/حدائق\s*القبة|hadayek/i, "حدائق القبة"],
  [/وسط\s*البلد|downtown/i, "وسط البلد"],
  [/شبرا|shubra/i, "شبرا"],
  [/الهرم|haram/i, "الهرم"],
  [/فيصل|faisal/i, "فيصل"],
  [/جسر\s*السويس|gesr\s*el\s*suez/i, "جسر السويس"],
  [/العبور|obour/i, "العبور"],
  [/الشروق|shorouk/i, "الشروق"],
  [/مدينتي|madinaty/i, "مدينتي"],
  [/الرحاب|rehab/i, "الرحاب"],
];

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function compactWhitespace(value?: string | null): string | null {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function stringField(input: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    const value = input[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractPhone(text: string): string | null {
  return extractPrimaryPhone(text);
}

function isRealPhone(value?: string | null): boolean {
  const normalized = normalizePhone(value) ?? "";
  return normalized.replace(/\D/g, "").length >= REAL_PHONE_MIN_DIGITS && !String(value ?? "").startsWith("NO-PHONE-");
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  return match[0].replace(/[),.]+$/g, "");
}

function cleanGoogleMapsTitle(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\s*[-–|]\s*Google\s*Maps.*$/i, "")
    .replace(/^Google\s*Maps\s*[-–|]\s*/i, "")
    .replace(/\s*·\s*Google\s*Maps.*$/i, "")
    .trim();
  if (!cleaned || /^Google Maps$/i.test(cleaned)) return null;
  return cleaned;
}

function decodeMapsNameFromUrl(urlValue?: string | null): string | null {
  if (!urlValue) return null;
  try {
    const url = new URL(urlValue);
    if (url.pathname.includes("/place/")) {
      const place = url.pathname.split("/place/")[1]?.split("/")[0];
      if (place) return decodeURIComponent(place.replace(/\+/g, " ")).trim();
    }
    const query = url.searchParams.get("q") ?? url.searchParams.get("query") ?? url.searchParams.get("destination");
    if (query) return decodeURIComponent(query.replace(/\+/g, " ")).split(/[،,|]/)[0]?.trim() ?? null;
  } catch {
    return null;
  }
  return null;
}

function looksLikeNoise(line: string): boolean {
  const value = line.trim();
  if (!value) return true;
  if (/^https?:\/\//i.test(value)) return true;
  if (/^(directions|save|nearby|send to phone|share|call|website|menu|reviews?|photos?|overview|about|updates|owner|suggest an edit)$/i.test(value)) return true;
  if (/^(الاتجاهات|حفظ|مشاركة|اتصال|موقع|القائمة|صور|مراجعات|نظرة عامة|تعديل)$/i.test(value)) return true;
  if (/^\d+(\.\d+)?\s*\(?[\d,\.]*\)?$/.test(value)) return true;
  if (/^[★⭐]/.test(value)) return true;
  return false;
}

function isAddressLike(value?: string | null): boolean {
  if (!value) return false;
  return /(street|st\.?|road|rd\.?|avenue|ave|cairo|giza|alexandria|nasr|maadi|dokki|zamalek|new cairo|heliopolis|شارع|طريق|ميدان|القاهرة|الجيزة|الإسكندرية|مدينة|منطقة|محافظة|مول|سنتر)/i.test(value) || value.includes(",") || value.includes("،");
}

function inferArea(address?: string | null, rawText?: string | null, defaultArea?: string | null): string | null {
  if (defaultArea?.trim()) return defaultArea.trim();
  const haystack = [address, rawText].filter(Boolean).join("\n");
  for (const [pattern, area] of EGYPT_AREAS) {
    if (pattern.test(haystack)) return area;
  }

  if (!address) return null;
  const parts = address
    .split(/[،,|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(egypt|مصر)$/i.test(part));

  if (parts.length >= 4) return parts[parts.length - 3] ?? null;
  if (parts.length >= 3) return parts[parts.length - 2] ?? null;
  if (parts.length >= 2) return parts[parts.length - 1] ?? null;
  return null;
}

function extractAddress(rawText: string, explicitAddress: string | null, name: string | null): string | null {
  if (explicitAddress && isAddressLike(explicitAddress)) return explicitAddress;
  const normalizedName = name?.toLowerCase();
  const lines = rawText.split(/[\n\r]+/).map((line) => compactWhitespace(line)).filter((line): line is string => Boolean(line));
  for (const line of lines) {
    if (normalizedName && line.toLowerCase() === normalizedName) continue;
    if (extractPhone(line)) continue;
    if (looksLikeNoise(line)) continue;
    if (isAddressLike(line)) return line;
  }
  return explicitAddress;
}

function extractName(rawText: string, fields: Record<string, unknown>, mapUrl: string | null): string | null {
  const explicit = cleanGoogleMapsTitle(firstString(
    stringField(fields, ["name", "placeName", "placeLabel", "title", "businessName"]),
    decodeMapsNameFromUrl(mapUrl),
  ));
  if (explicit) return explicit;

  const lines = rawText.split(/[\n\r]+/).map((line) => compactWhitespace(line)).filter((line): line is string => Boolean(line));
  for (const line of lines) {
    if (looksLikeNoise(line)) continue;
    if (extractPhone(line)) continue;
    if (isAddressLike(line)) continue;
    if (line.length >= 2 && line.length <= 120) return line;
  }

  return null;
}

function scoreLead(input: { name: string | null; phone: string | null; area: string | null; mapUrl: string | null; address: string | null; website: string | null; rating: string | null }): number {
  let score = 10;
  if (input.name) score += 20;
  if (isRealPhone(input.phone)) score += 35;
  if (input.area) score += 15;
  if (input.mapUrl) score += 15;
  if (input.address) score += 10;
  if (input.website) score += 3;
  if (input.rating) score += 2;
  return Math.min(100, score);
}

export function parseCapturedPlace(payload: unknown, options: { defaultArea?: string | null } = {}): CaptureLead {
  const input = payload && typeof payload === "object" ? payload as Record<string, unknown> : { rawText: String(payload ?? "") };
  const rawText = firstString(
    stringField(input, ["rawText", "text", "bodyText", "clipboardText"]),
    JSON.stringify(input),
  ) ?? "";
  const pageUrl = stringField(input, ["pageUrl", "url", "mapUrl", "mapsUrl"]);
  const initialMapUrl = pageUrl || extractUrl(rawText);
  const explicitPhone = stringField(input, ["phone", "telephone", "tel"]);
  const structuredCandidates = Array.isArray(input.phoneCandidates)
    ? input.phoneCandidates.filter((item): item is string => typeof item === "string")
    : [];
  const phoneCandidates = mergePhoneCandidates(
    explicitPhone ? [explicitPhone] : [],
    structuredCandidates,
    extractPhones(rawText).map((item) => item.value),
    extractPhones(pageUrl || "").map((item) => item.value),
  );
  const phone = compactWhitespace(phoneCandidates[0] || explicitPhone || extractPhone(rawText));
  const explicitAddress = stringField(input, ["address", "locationText", "formattedAddress"]);
  const name = extractName(rawText, input, initialMapUrl);
  const normalizedLocation = normalizeLocationInput({
    rawText,
    explicitAddress,
    defaultArea: stringField(input, ["area", "district", "neighborhood"]) || options.defaultArea,
    mapUrl: initialMapUrl,
  });
  const address = normalizedLocation.address;
  const area = normalizedLocation.area;
  const city = normalizedLocation.city;
  const mapUrl = normalizedLocation.mapUrl || initialMapUrl;
  const website = compactWhitespace(stringField(input, ["website", "site", "websiteUrl"]));
  const category = compactWhitespace(stringField(input, ["category", "type", "placeType"]));
  const rating = compactWhitespace(stringField(input, ["rating", "stars"]));
  const reviewCount = compactWhitespace(stringField(input, ["reviewCount", "reviews", "reviewText"]));
  const score = scoreLead({ name, phone, area, mapUrl, address, website, rating });
  const warnings: string[] = [...normalizedLocation.warnings];

  if (!name) warnings.push("Place name was not detected. Edit the lead before importing.");
  if (!isRealPhone(phone)) warnings.push("Phone missing or not usable. The lead will need enrichment before calling.");
  if (!mapUrl) warnings.push("Google Maps URL was not captured. Duplicate detection will be weaker.");

  const displayName = name || `Google Maps lead ${hashText(rawText).slice(0, 6).toUpperCase()}`;
  const notes = [
    category ? `Category: ${category}` : null,
    rating ? `Rating: ${rating}` : null,
    reviewCount ? `Reviews: ${reviewCount}` : null,
    city ? `City: ${city}` : null,
    coordinatesLabel(normalizedLocation.latitude, normalizedLocation.longitude) ? `Coordinates: ${coordinatesLabel(normalizedLocation.latitude, normalizedLocation.longitude)}` : null,
    normalizedLocation.plusCode ? `Plus code: ${normalizedLocation.plusCode}` : null,
    website ? `Website: ${website}` : null,
    mapUrl ? `Maps: ${mapUrl}` : null,
  ].filter(Boolean).join("\n") || null;

  return {
    id: `capture_${hashText(`${displayName}|${phone ?? ""}|${mapUrl ?? ""}|${address ?? ""}`)}`,
    name: displayName,
    phone,
    phoneCandidates,
    normalizedPhone: normalizePhone(phone),
    area,
    city,
    address,
    latitude: normalizedLocation.latitude,
    longitude: normalizedLocation.longitude,
    coordinates: coordinatesLabel(normalizedLocation.latitude, normalizedLocation.longitude),
    plusCode: normalizedLocation.plusCode,
    mapUrl,
    website,
    category,
    rating,
    reviewCount,
    source: "Google Maps Capture",
    notes: notes || (rawText.length > 1000 ? rawText.slice(0, 1000) : rawText),
    score,
    confidence: score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
    tags: [...CAFE_TAGS, isRealPhone(phone) ? "ready-to-call" : "needs-phone"],
    warnings,
  };
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2),
  );
}

function nameSimilarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return Math.round((intersection / Math.max(a.size, b.size)) * 100);
}

export function duplicateCandidatesForLead(lead: CaptureLead | { name: string; phone?: string | null; phoneCandidates?: string[]; normalizedPhone?: string | null; area?: string | null; mapUrl?: string | null }, contacts: ContactRow[]): DuplicateCandidate[] {
  const leadPhones = mergePhoneCandidates(lead.phoneCandidates, [lead.normalizedPhone, lead.phone]);
  const normalized = leadPhones[0] ? normalizePhone(leadPhones[0]) : normalizePhone(lead.normalizedPhone || lead.phone);
  const leadArea = (lead.area ?? "").trim().toLowerCase();
  const mapUrl = (lead.mapUrl ?? "").trim();
  const candidates: DuplicateCandidate[] = [];

  for (const contact of contacts) {
    const reasons: string[] = [];
    let score = 0;
    const contactPhone = normalizePhone(contact.normalizedPhone || contact.phone);
    const contactArea = (contact.area ?? "").trim().toLowerCase();

    if (contactPhone && leadPhones.some((phone) => normalizePhone(phone) === contactPhone)) {
      score += 100;
      reasons.push("same phone");
    }
    if (mapUrl && contact.mapUrl && contact.mapUrl === mapUrl) {
      score += 95;
      reasons.push("same Google Maps URL");
    }

    const similarity = nameSimilarity(lead.name, contact.fullName || contact.company || "");
    if (similarity >= 75 && leadArea && contactArea && leadArea === contactArea) {
      score += similarity;
      reasons.push(`${similarity}% name match in same area`);
    } else if (similarity >= 88) {
      score += similarity - 15;
      reasons.push(`${similarity}% name match`);
    }

    if (!reasons.length) continue;
    candidates.push({
      id: contact.id,
      fullName: contact.fullName,
      phone: contact.phone,
      area: contact.area,
      mapUrl: contact.mapUrl,
      stage: contact.stage,
      reason: reasons.join(" + "),
      score: Math.min(100, score),
    });
  }

  return candidates.sort((left, right) => right.score - left.score).slice(0, 5);
}

export function leadToImportCandidate(lead: CaptureLead) {
  return {
    name: lead.name,
    phone: lead.phone || undefined,
    area: lead.area || undefined,
    address: lead.address || undefined,
    mapUrl: lead.mapUrl || undefined,
    source: lead.source,
    notes: lead.notes || undefined,
    score: lead.score,
    tags: Array.from(new Set([...lead.tags, ...CAFE_TAGS])),
  };
}
