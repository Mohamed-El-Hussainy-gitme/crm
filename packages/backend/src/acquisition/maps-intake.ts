import { coordinatesLabel, normalizeLocationInput } from "./location-normalizer.js";
import { extractPhones, extractPrimaryPhone, mergePhoneCandidates } from "./phone-extractor.js";

export type MapsIntakeResult = {
  source: string;
  mapUrl?: string | undefined;
  resolvedUrl?: string | undefined;
  placeLabel?: string | undefined;
  locationText?: string | undefined;
  area?: string | undefined;
  city?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  coordinates?: string | undefined;
  plusCode?: string | undefined;
  company?: string | undefined;
  firstName?: string | undefined;
  phone?: string | undefined;
  phoneCandidates?: string[] | undefined;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  warnings: string[];
};

const EGYPT_AREAS: Array<[RegExp, string]> = [
  [/(nasr\s*city|مدينة\s*نصر)/i, "Nasr City"],
  [/(new\s*cairo|tagamoa|التجمع|القاهرة\s*الجديدة)/i, "New Cairo"],
  [/(heliopolis|مصر\s*الجديدة)/i, "Heliopolis"],
  [/(maadi|المعادي)/i, "Maadi"],
  [/(dokki|الدقي)/i, "Dokki"],
  [/(mohandessin|المهندسين)/i, "Mohandessin"],
  [/(zamalek|الزمالك)/i, "Zamalek"],
  [/(mokattam|المقطم)/i, "Mokattam"],
  [/(6th\s*of\s*october|october|٦\s*أكتوبر|6\s*october)/i, "6 October"],
  [/(sheikh\s*zayed|الشيخ\s*زايد)/i, "Sheikh Zayed"],
  [/(madinaty|مدينتي)/i, "Madinaty"],
  [/(rehab|الرحاب)/i, "Rehab"],
  [/(shorouk|الشروق)/i, "Shorouk"],
  [/(obour|العبور)/i, "Obour"],
  [/(giza|الجيزة)/i, "Giza"],
  [/(cairo|القاهرة)/i, "Cairo"],
  [/(alexandria|الإسكندرية|اسكندرية)/i, "Alexandria"],
];

function compactWhitespace(value?: string | null): string | undefined {
  const cleaned = value
    ?.replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function stripGoogleTitle(value?: string | null): string | undefined {
  const cleaned = compactWhitespace(value)
    ?.replace(/\s*-\s*Google\s*Maps\s*$/i, "")
    .replace(/^Google\s*Maps\s*-\s*/i, "")
    .replace(/^Directions\s+to\s+/i, "")
    .replace(/^اتجاهات\s+إلى\s+/i, "")
    .trim();
  if (!cleaned || /^google maps$/i.test(cleaned)) return undefined;
  if (/^https?:\/\//i.test(cleaned)) return undefined;
  if (/^[A-Za-z0-9_-]{8,}$/.test(cleaned) && !cleaned.includes(" ")) return undefined;
  return cleaned;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/\+/g, " ");
  }
}

export function extractUrl(input: string): string | undefined {
  const match = input.match(/https?:\/\/[^\s)\]}>,]+/i);
  if (!match) return undefined;
  return match[0].replace(/[.,،؛]+$/g, "");
}

function isGoogleMapsHost(hostname: string): boolean {
  return /(^|\.)(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl)$/i.test(hostname);
}

function titleFromUrl(urlValue?: string): string | undefined {
  if (!urlValue) return undefined;
  try {
    const url = new URL(urlValue);
    if (url.hostname.includes("maps.app.goo.gl") || url.hostname.includes("goo.gl")) return undefined;

    const placeSegment = url.pathname.includes("/place/")
      ? url.pathname.split("/place/")[1]?.split("/")[0]
      : undefined;
    if (placeSegment) return stripGoogleTitle(safeDecode(placeSegment));

    const query = url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("destination") || url.searchParams.get("daddr");
    if (query) {
      const decoded = safeDecode(query).split(/[،,|]/)[0]?.trim();
      return stripGoogleTitle(decoded);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function extractMeta(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    if (match) return compactWhitespace(match);
  }
  return undefined;
}

function extractHtmlTitle(html: string): string | undefined {
  return compactWhitespace(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
}

function extractJsonString(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`"${escaped}"\\s*:\\s*"((?:\\\\.|[^"])*)"`, "i"),
    new RegExp(`\\\\"${escaped}\\\\"\\s*:\\s*\\\\"((?:\\\\\\\\.|[^\\\\"])*)\\\\"`, "i"),
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    if (!value) continue;
    return compactWhitespace(value.replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\u0026/g, "&"));
  }
  return undefined;
}

function extractPhone(input: string): string | undefined {
  return extractPrimaryPhone(input) ?? undefined;
}

function isAddressLike(value?: string): boolean {
  if (!value) return false;
  return /(street|st\.?|road|rd\.?|avenue|ave|cairo|giza|alexandria|nasr|maadi|dokki|zamalek|new cairo|heliopolis|شارع|طريق|ميدان|القاهرة|الجيزة|الإسكندرية|مدينة|منطقة|محافظة)/i.test(value);
}

function extractAddressFromText(text: string, placeName?: string): string | undefined {
  const lines = text
    .split(/[\n\r]+/)
    .map((line) => compactWhitespace(line))
    .filter((line): line is string => Boolean(line));

  const label = placeName?.toLowerCase();
  for (const line of lines) {
    if (label && line.toLowerCase() === label) continue;
    if (/^https?:\/\//i.test(line)) continue;
    if (extractPhone(line)) continue;
    if (/^(coffee shop|cafe|restaurant|open|closed|directions|share|save|call|website|menu)$/i.test(line)) continue;
    if (isAddressLike(line) || line.includes(",") || line.includes("،")) return line;
  }
  return undefined;
}

function inferArea(address?: string, defaultArea?: string): string | undefined {
  if (defaultArea?.trim()) return defaultArea.trim();
  if (!address) return undefined;

  for (const [pattern, area] of EGYPT_AREAS) {
    if (pattern.test(address)) return area;
  }

  const parts = address
    .split(/[،,|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^egypt$/i.test(part) && !/^مصر$/.test(part));

  if (parts.length >= 4) return parts[parts.length - 3];
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length >= 2) return parts[parts.length - 1];
  return undefined;
}

async function fetchGoogleMapsPage(urlValue: string): Promise<{ finalUrl?: string | undefined; html?: string | undefined; warning?: string | undefined }> {
  try {
    const response = await fetch(urlValue, {
      redirect: "follow",
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ar,en-US;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 SmartCRM/1.0",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const html = contentType.includes("text/html") ? await response.text() : undefined;
    return { finalUrl: response.url || urlValue, html };
  } catch (error) {
    return { warning: error instanceof Error ? error.message : "Could not resolve Google Maps URL." };
  }
}

export async function parseMapsIntake(input: string, options: { defaultArea?: string | undefined; defaultSource?: string | undefined; resolveRemote?: boolean | undefined } = {}): Promise<MapsIntakeResult> {
  const raw = input.trim();
  const warnings: string[] = [];
  const rawUrl = extractUrl(raw);
  let mapUrl = rawUrl;
  let resolvedUrl: string | undefined;
  let remoteHtml: string | undefined;

  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (options.resolveRemote !== false && isGoogleMapsHost(url.hostname)) {
        const resolved = await fetchGoogleMapsPage(rawUrl);
        resolvedUrl = resolved.finalUrl;
        remoteHtml = resolved.html;
        if (resolved.warning) warnings.push(`Could not resolve Google Maps URL: ${resolved.warning}`);
        if (resolvedUrl && resolvedUrl !== rawUrl) mapUrl = resolvedUrl;
      }
    } catch {
      warnings.push("The pasted URL is not a valid map URL.");
    }
  }

  const source = options.defaultSource || (raw.toLowerCase().includes("google") || rawUrl ? "Google Maps" : "Manual");
  const combinedText = [raw, remoteHtml || "", resolvedUrl || ""].join("\n");

  const title = stripGoogleTitle(
    titleFromUrl(resolvedUrl || rawUrl) ||
    extractMeta(remoteHtml || "", "og:title") ||
    extractMeta(remoteHtml || "", "twitter:title") ||
    extractHtmlTitle(remoteHtml || "") ||
    undefined,
  );

  const description = compactWhitespace(
    extractMeta(remoteHtml || "", "og:description") ||
    extractMeta(remoteHtml || "", "description") ||
    extractJsonString(remoteHtml || "", "description") ||
    undefined,
  );

  const jsonAddress = compactWhitespace(
    extractJsonString(remoteHtml || "", "address") ||
    extractJsonString(remoteHtml || "", "formatted_address") ||
    undefined,
  );

  const addressCandidate = compactWhitespace(
    jsonAddress ||
    (description && isAddressLike(description) ? description : undefined) ||
    extractAddressFromText(raw, title) ||
    extractAddressFromText(remoteHtml || "", title) ||
    undefined,
  );

  const normalizedLocation = normalizeLocationInput({
    rawText: combinedText,
    explicitAddress: addressCandidate,
    defaultArea: options.defaultArea,
    mapUrl,
  });
  const address = normalizedLocation.address ?? undefined;
  const area = normalizedLocation.area ?? undefined;
  const city = normalizedLocation.city ?? undefined;
  const phoneCandidates = mergePhoneCandidates(
    extractPhones(raw).map((item) => item.value),
    extractPhones(remoteHtml || "").map((item) => item.value),
    extractPhones(resolvedUrl || "").map((item) => item.value),
  );
  const phone = phoneCandidates[0];
  const confidenceScore = (title ? 35 : 0) + (phone ? 30 : 0) + (address ? 20 : 0) + (area ? 10 : 0) + (mapUrl ? 5 : 0);

  if (!title) warnings.push("Could not detect the cafe name. Paste the place title or copied Google Maps details with the link.");
  if (!phone) warnings.push("Phone was not detected. Google short links often do not expose phone numbers; paste copied place details if the number is visible in Maps.");
  warnings.push(...normalizedLocation.warnings);

  return {
    source,
    mapUrl: normalizedLocation.mapUrl ?? mapUrl,
    resolvedUrl,
    placeLabel: title,
    locationText: address,
    area,
    city,
    latitude: normalizedLocation.latitude ?? undefined,
    longitude: normalizedLocation.longitude ?? undefined,
    coordinates: coordinatesLabel(normalizedLocation.latitude, normalizedLocation.longitude) ?? undefined,
    plusCode: normalizedLocation.plusCode ?? undefined,
    company: title,
    firstName: title,
    phone,
    phoneCandidates,
    confidence: confidenceScore >= 75 ? "HIGH" : confidenceScore >= 45 ? "MEDIUM" : "LOW",
    warnings: Array.from(new Set(warnings)),
  };
}
