import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE = "hafiz_session";

/**
 * Route protection for Hafiz production.
 *
 * - REQUIRE_AUTH=true (recommended production): app routes need a valid session.
 * - Guest cookie is no longer accepted as a substitute for an account.
 * - Auth/public pages always open.
 *
 * Uses jose edge-compatible JWT verify (same secret as server session).
 */

function secretKey(): Uint8Array | null {
  const s =
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV !== "production"
      ? "hafiz-dev-auth-secret-change-me"
      : null);
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return false;
  const key = secretKey();
  if (!key) return false;
  try {
    await jwtVerify(token, key);
    return true;
  } catch {
    return false;
  }
}

function isAppRoute(pathname: string): boolean {
  const appPrefixes = [
    "/dashboard",
    "/plans",
    "/session",
    "/quran",
    "/quiz",
    "/goals",
    "/planner",
    "/mutashabihat",
    "/mistakes",
    "/stats",
    "/settings",
    "/achievements",
    "/listen-memorize",
    "/qaris",
    "/notes",
    "/bookmarks",
    "/search",
    "/teacher",
    "/admin",
    "/social",
  ];
  return appPrefixes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow static / API / auth marketing
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/qaris") ||
    pathname.includes(".")
  ) {
    // still protect below only for pages; APIs handle their own auth later
  }

  const requireAuth =
    process.env.REQUIRE_AUTH === "true" || process.env.REQUIRE_AUTH === "1";

  if (!requireAuth) {
    return NextResponse.next();
  }

  // Public pages when REQUIRE_AUTH
  const publicPaths = [
    "/",
    "/login",
    "/signup",
    "/forgot-password",
    "/onboarding",
    "/plan-reveal",
  ];
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  if (!isAppRoute(pathname)) {
    return NextResponse.next();
  }

  // Accounts only — no guest bypass
  if (await hasValidSession(req)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match all pathnames except static files handled loosely above.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icon.svg).*)",
  ],
};
