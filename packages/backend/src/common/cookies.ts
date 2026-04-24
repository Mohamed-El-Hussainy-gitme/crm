export type CookieSameSite = "Strict" | "Lax" | "None";

export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: CookieSameSite;
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
};

const COOKIE_RESERVED_CHARS = /[()<>@,;:\\"/\[\]?={}\s]/;

function assertValidCookieName(name: string) {
  if (!name || COOKIE_RESERVED_CHARS.test(name)) {
    throw new Error(`Invalid cookie name: ${name}`);
  }
}

export function parseCookies(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;

    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }

  return cookies;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  assertValidCookieName(name);

  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path ?? "/"}`);

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.expires) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.domain) {
    segments.push(`Domain=${options.domain}`);
  }

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.secure) {
    segments.push("Secure");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  return segments.join("; ");
}
