import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];
const BYPASS_PREFIXES = ["/_next", "/favicon.ico"];
const SESSION_COOKIE_NAME = "smartcrm_session";

function isBypassed(pathname: string) {
  return BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isBypassed(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!token && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    const next = `${pathname}${search}`;
    if (next && next !== "/login") {
      loginUrl.searchParams.set("next", next);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image).*)"],
};
