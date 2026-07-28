/**
 * Auth configuration — works with Supabase Postgres via DATABASE_URL.
 * Local-first: auth is optional when AUTH_SECRET / DATABASE_URL missing.
 *
 * Secrets must come from environment only — never hardcode production secrets.
 */

export const AUTH_COOKIE = "hafiz_session";
export const GUEST_COOKIE = "hafiz_guest";

/** Known insecure / template values — never accepted in production */
const INSECURE_SECRETS = [
  "hafiz-dev-auth-secret-change-me",
  "replace-with-a-long-random-secret-min-32-chars",
  "replace-with-a-long-random-secret",
  "secret",
  "password",
  "changeme",
];

export function isInsecureSecret(s: string): boolean {
  const lower = s.toLowerCase();
  if (
    INSECURE_SECRETS.some(
      (x) => lower === x.toLowerCase() || lower.includes("change-me")
    )
  ) {
    return true;
  }
  if (lower.includes("replace-with")) return true;
  return false;
}

/**
 * Pure secret resolver (testable without mutating process.env.NODE_ENV).
 */
export function resolveAuthSecret(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const raw = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  const s = raw?.trim() || "";
  const isProd = env.NODE_ENV === "production";

  if (isProd) {
    if (!s) {
      console.error("[auth] AUTH_SECRET is missing in production");
      return null;
    }
    if (s.length < 32) {
      console.error(
        "[auth] AUTH_SECRET must be at least 32 characters in production"
      );
      return null;
    }
    if (isInsecureSecret(s)) {
      console.error(
        "[auth] AUTH_SECRET is insecure for production — set a strong random secret"
      );
      return null;
    }
    return s;
  }

  // Development / test
  if (s && s.length >= 16 && !isInsecureSecret(s)) {
    return s;
  }
  if (s && isInsecureSecret(s)) {
    if (s === "hafiz-dev-auth-secret-change-me") {
      return s;
    }
    console.warn(
      "[auth] AUTH_SECRET looks like a template — using dev fallback"
    );
  }
  // Dev fallback so login works without .env (NOT for production)
  return "hafiz-dev-auth-secret-change-me";
}

/**
 * Resolve signing secret for JWT cookies.
 * - Development: env secret or explicit dev-only fallback
 * - Production: requires strong AUTH_SECRET (≥32 chars, not a template)
 */
export function getAuthSecret(): string | null {
  return resolveAuthSecret(process.env);
}

export function isAuthConfigured(): boolean {
  return Boolean(getAuthSecret());
}

/** Production readiness flags for /api/v1/auth/me diagnostics */
export function authProductionWarnings(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const warnings: string[] = [];
  const raw = (env.AUTH_SECRET || env.NEXTAUTH_SECRET || "").trim();
  if (env.NODE_ENV === "production") {
    if (!raw) warnings.push("AUTH_SECRET missing in production");
    else if (raw.length < 32)
      warnings.push("AUTH_SECRET shorter than 32 chars");
    else if (isInsecureSecret(raw))
      warnings.push("AUTH_SECRET is a known insecure value");
    if (!env.DATABASE_URL) {
      warnings.push("DATABASE_URL missing — cloud sync disabled");
    }
  } else if (!raw) {
    warnings.push("AUTH_SECRET unset — using development fallback");
  }
  return warnings;
}

/** Cookie security flags (single source of truth for docs + tests) */
export function getSessionCookieOptions(
  maxAgeSeconds: number,
  env: NodeJS.ProcessEnv = process.env
): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** When true, middleware requires session or guest cookie for /(app) routes. */
export function isAuthRequired(): boolean {
  return (
    process.env.REQUIRE_AUTH === "true" || process.env.REQUIRE_AUTH === "1"
  );
}

export function sessionMaxAgeSeconds(): number {
  const days = Number(process.env.AUTH_SESSION_DAYS || 30);
  return Math.max(1, days) * 24 * 60 * 60;
}
