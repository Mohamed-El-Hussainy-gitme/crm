export type NormalizedCoordinates = {
  latitude: number;
  longitude: number;
};

export type NormalizedLocation = {
  address: string | null;
  area: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  plusCode: string | null;
  mapUrl: string | null;
  warnings: string[];
};

export type LocationInput = {
  rawText?: string | null | undefined;
  explicitAddress?: string | null | undefined;
  defaultArea?: string | null | undefined;
  mapUrl?: string | null | undefined;
};

const AREA_ALIASES: Array<{ patterns: RegExp[]; area: string; city?: string }> = [
  { area: "الدقي", city: "الجيزة", patterns: [/\b(dokki|el dokki)\b/i, /الدقي/] },
  { area: "المهندسين", city: "الجيزة", patterns: [/mohandess?in/i, /المهندسين/] },
  { area: "الزمالك", city: "القاهرة", patterns: [/zamalek/i, /الزمالك/] },
  { area: "مدينة نصر", city: "القاهرة", patterns: [/nasr\s*city/i, /مدينة\s*نصر/] },
  { area: "مصر الجديدة", city: "القاهرة", patterns: [/heliopolis/i, /مصر\s*الجديدة/] },
  { area: "القاهرة الجديدة", city: "القاهرة", patterns: [/new\s*cairo|tagamoa|fifth\s*settlement|5th\s*settlement/i, /القاهرة\s*الجديدة|التجمع|التجمع\s*الخامس/] },
  { area: "المعادي", city: "القاهرة", patterns: [/maadi/i, /المعادي/] },
  { area: "المقطم", city: "القاهرة", patterns: [/mokattam/i, /المقطم/] },
  { area: "وسط البلد", city: "القاهرة", patterns: [/downtown|tahrir/i, /وسط\s*البلد|التحرير/] },
  { area: "شبرا", city: "القاهرة", patterns: [/shubra/i, /شبرا/] },
  { area: "العباسية", city: "القاهرة", patterns: [/abbass?ia/i, /العباسية/] },
  { area: "المنيل", city: "القاهرة", patterns: [/manial/i, /المنيل/] },
  { area: "حدائق القبة", city: "القاهرة", patterns: [/hadayek\s*el\s*kobba/i, /حدائق\s*القبة/] },
  { area: "جسر السويس", city: "القاهرة", patterns: [/gesr\s*el\s*suez/i, /جسر\s*السويس/] },
  { area: "الهرم", city: "الجيزة", patterns: [/haram/i, /الهرم/] },
  { area: "فيصل", city: "الجيزة", patterns: [/faisal/i, /فيصل/] },
  { area: "الشيخ زايد", city: "الجيزة", patterns: [/sheikh\s*zayed/i, /الشيخ\s*زايد/] },
  { area: "6 أكتوبر", city: "الجيزة", patterns: [/6th\s*of\s*october|6\s*october|october/i, /السادس\s*من\s*أكتوبر|٦\s*أكتوبر|6\s*أكتوبر/] },
  { area: "العبور", city: "القاهرة", patterns: [/obour/i, /العبور/] },
  { area: "الشروق", city: "القاهرة", patterns: [/shorouk/i, /الشروق/] },
  { area: "مدينتي", city: "القاهرة", patterns: [/madinaty/i, /مدينتي/] },
  { area: "الرحاب", city: "القاهرة", patterns: [/rehab/i, /الرحاب/] },
];

const CITY_ALIASES: Array<{ patterns: RegExp[]; city: string }> = [
  { city: "القاهرة", patterns: [/\b(cairo)\b/i, /القاهرة/] },
  { city: "الجيزة", patterns: [/\b(giza)\b/i, /الجيزة/] },
  { city: "الإسكندرية", patterns: [/alexandria/i, /الإسكندرية|اسكندرية/] },
  { city: "القليوبية", patterns: [/qalyubia/i, /القليوبية/] },
];

const ADDRESS_KEYWORDS = /(شارع|طريق|ميدان|محور|كوبري|عمارة|برج|مول|سنتر|بجوار|خلف|أمام|داخل|الدور|st\.?|street|road|rd\.?|avenue|ave\.?|square|mall|center|plaza|building|tower)/i;
const GOOGLE_URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const PHONE_LIKE_PATTERN = /(?:\+?20|0020|0)?1[0125][\s\d]{8,14}|\+?\d[\d\s().-]{7,18}/i;
const PLUS_CODE_PATTERN = /\b[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}(?:\s+[^\n,،]+)?\b/i;

const SCRIPT_NOISE_PATTERN = /(window\.|document\.|function\s*\(|=>|\bconst\s+|\blet\s+|\bvar\s+|gtbExternal|tactiless|pageT\(|\.call\(this\)|querySelector|addEventListener|webpack|__NEXT_DATA__|<script|<style|javascript:|JSON\.stringify|localStorage|sessionStorage)/i;
const HTML_TAG_PATTERN = /<[^>]+>/g;

function stripScriptArtifacts(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\(function[\s\S]{0,800}?\)\(\);?/gi, " ")
    .replace(/\(\(\)\s*=>\s*\{[\s\S]{0,1000}?\}\)\(\);?/gi, " ")
    .replace(/\{?\(?[a-z]\s*=\s*window\.[^\n]{0,500}/gi, " ")
    .replace(HTML_TAG_PATTERN, " ");
}

function looksLikeScriptNoise(value?: string | null): boolean {
  const text = String(value ?? "").trim();
  if (!text) return true;
  if (SCRIPT_NOISE_PATTERN.test(text)) return true;
  const punctuation = (text.match(/[{}()[\];=><]/g) ?? []).length;
  const letters = (text.match(/[A-Za-z\u0600-\u06FF]/g) ?? []).length || 1;
  return text.length > 80 && punctuation / letters > 0.22;
}

export function compactLocationText(value?: string | null): string | null {
  const cleaned = stripScriptArtifacts(String(value ?? ""))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u0026/g, "&")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

export function extractMapUrl(value?: string | null): string | null {
  const match = value?.match(GOOGLE_URL_PATTERN)?.[0];
  return match?.replace(/[),.،؛]+$/g, "") ?? null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/\+/g, " ");
  }
}

function validCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function extractCoordinates(value?: string | null): NormalizedCoordinates | null {
  if (!value) return null;
  const candidates: Array<RegExpMatchArray | null> = [
    value.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/),
    value.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/),
    value.match(/(?:^|[?&](?:q|query|ll|center|destination|daddr)=)(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/i),
    value.match(/\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/),
  ];

  for (const match of candidates) {
    const latitude = Number(match?.[1]);
    const longitude = Number(match?.[2]);
    if (validCoordinate(latitude, longitude)) return { latitude, longitude };
  }

  return null;
}

export function extractPlusCode(value?: string | null): string | null {
  const match = value?.match(PLUS_CODE_PATTERN)?.[0];
  return compactLocationText(match) ?? null;
}

function stripUrls(value: string): string {
  return value.replace(GOOGLE_URL_PATTERN, " ");
}

function stripCoordinates(value: string): string {
  return value
    .replace(/@-?\d{1,2}\.\d+,\s*-?\d{1,3}\.\d+(?:,\d+\w?)?/g, " ")
    .replace(/!3d-?\d{1,2}\.\d+!4d-?\d{1,3}\.\d+/g, " ")
    .replace(/\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g, " ");
}

function stripPlusCodes(value: string): string {
  return value.replace(PLUS_CODE_PATTERN, " ");
}

function isOnlyCoordinateOrCode(line: string): boolean {
  const cleaned = compactLocationText(stripPlusCodes(stripCoordinates(stripUrls(line)))) ?? "";
  return !cleaned || /^[@!\d.,\s+-]+$/.test(cleaned);
}

function isNoiseLine(line: string): boolean {
  const value = line.trim();
  if (!value) return true;
  if (looksLikeScriptNoise(value)) return true;
  if (/^https?:\/\//i.test(value)) return true;
  if (isOnlyCoordinateOrCode(value)) return true;
  if (/^(directions|save|nearby|send to phone|share|call|website|menu|reviews?|photos?|overview|about|updates|owner|suggest an edit|open|closed|opens|closes)$/i.test(value)) return true;
  if (/^(الاتجاهات|حفظ|مشاركة|اتصال|موقع|القائمة|صور|مراجعات|نظرة عامة|تعديل|مغلق|مفتوح)$/i.test(value)) return true;
  if (/^(coffee shop|cafe|restaurant|cafeteria|place of worship|business)$/i.test(value)) return true;
  if (/^[★⭐]/.test(value)) return true;
  if (/^\d+(\.\d+)?\s*\(?[\d,\.]*\)?$/.test(value)) return true;
  if (PHONE_LIKE_PATTERN.test(value) && !ADDRESS_KEYWORDS.test(value) && !/[،,]/.test(value)) return true;
  return false;
}

function cleanAddressCandidate(value?: string | null): string | null {
  if (!value) return null;
  if (looksLikeScriptNoise(value)) return null;
  const cleaned = compactLocationText(stripPlusCodes(stripCoordinates(stripUrls(value)))) ?? "";
  if (!cleaned || isNoiseLine(cleaned) || looksLikeScriptNoise(cleaned)) return null;
  return cleaned.replace(/^[,،\s-]+|[,،\s-]+$/g, "").trim() || null;
}

function scoreAddressCandidate(line: string): number {
  if (looksLikeScriptNoise(line)) return -100;
  let score = 0;
  if (ADDRESS_KEYWORDS.test(line)) score += 35;
  if (/[،,]/.test(line)) score += 25;
  if (AREA_ALIASES.some((entry) => entry.patterns.some((pattern) => pattern.test(line)))) score += 20;
  if (CITY_ALIASES.some((entry) => entry.patterns.some((pattern) => pattern.test(line)))) score += 15;
  if (/\d/.test(line)) score += 5;
  if (line.length >= 12 && line.length <= 240) score += 10;
  if (/google|maps|place_id|data=!/i.test(line)) score -= 50;
  return score;
}

function extractAddress(rawText?: string | null, explicitAddress?: string | null): string | null {
  const explicit = cleanAddressCandidate(explicitAddress);
  if (explicit && (ADDRESS_KEYWORDS.test(explicit) || /[،,]/.test(explicit))) return explicit;

  const lines = (rawText ?? "")
    .split(/[\n\r]+/)
    .map((line) => cleanAddressCandidate(line))
    .filter((line): line is string => Boolean(line));

  const uniqueLines = Array.from(new Set(lines));
  const ranked = uniqueLines
    .map((line) => ({ line, score: scoreAddressCandidate(line) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.line ?? explicit ?? null;
}

function normalizeArea(value?: string | null): { area: string | null; city: string | null } {
  const text = compactLocationText(value) ?? "";
  if (!text) return { area: null, city: null };
  for (const entry of AREA_ALIASES) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return { area: entry.area, city: entry.city ?? null };
    }
  }
  return { area: text, city: null };
}

function inferAreaAndCity(address?: string | null, rawText?: string | null, defaultArea?: string | null): { area: string | null; city: string | null } {
  const normalizedDefault = normalizeArea(defaultArea);
  if (normalizedDefault.area) return normalizedDefault;

  const haystack = [address, rawText].filter(Boolean).join("\n");
  for (const entry of AREA_ALIASES) {
    if (entry.patterns.some((pattern) => pattern.test(haystack))) {
      return { area: entry.area, city: entry.city ?? inferCity(haystack) };
    }
  }

  const parts = (address ?? "")
    .split(/[،,|]/)
    .map((part) => cleanAddressCandidate(part))
    .filter((part): part is string => Boolean(part))
    .filter((part) => !/^(egypt|مصر)$/i.test(part));

  const city = inferCity(haystack);
  const areaCandidate = parts.find((part) => !city || part !== city) ?? null;
  return { area: areaCandidate, city };
}

function inferCity(value?: string | null): string | null {
  const text = compactLocationText(value) ?? "";
  for (const entry of CITY_ALIASES) {
    if (entry.patterns.some((pattern) => pattern.test(text))) return entry.city;
  }
  return null;
}

export function normalizeLocationInput(input: LocationInput): NormalizedLocation {
  const rawText = input.rawText ?? "";
  const mapUrl = compactLocationText(input.mapUrl) ?? extractMapUrl(rawText);
  const coordinates = extractCoordinates([rawText, mapUrl].filter(Boolean).join("\n"));
  const plusCode = extractPlusCode(rawText);
  const address = extractAddress(rawText, input.explicitAddress);
  const { area, city } = inferAreaAndCity(address, rawText, input.defaultArea ?? null);
  const warnings: string[] = [];

  if (coordinates && !address) warnings.push("Coordinates were detected, but no readable street address was available. Paste the visible Maps address for a cleaner address.");
  if (plusCode && !address) warnings.push("A Google plus code was detected, but it is not a readable street address.");
  if (!area) warnings.push("Area was not detected. Add the district manually to route the lead into the right campaign.");
  if (!address) warnings.push("Readable address was not detected. Coordinates and links are kept separate from the address field.");

  return {
    address,
    area,
    city: city ?? inferCity(address),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    plusCode,
    mapUrl,
    warnings,
  };
}

export function coordinatesLabel(latitude?: number | null, longitude?: number | null): string | null {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}
