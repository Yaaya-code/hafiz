import { describe, expect, it } from "vitest";
import {
  resolveAuthSecret,
  getSessionCookieOptions,
  authProductionWarnings,
} from "./config";

describe("auth config", () => {
  it("uses env AUTH_SECRET in development when strong enough", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "development",
        AUTH_SECRET: "a-strong-development-secret-32chars",
      })
    ).toBe("a-strong-development-secret-32chars");
  });

  it("rejects missing AUTH_SECRET in production", () => {
    expect(resolveAuthSecret({ NODE_ENV: "production" })).toBeNull();
  });

  it("rejects insecure template AUTH_SECRET in production", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "production",
        AUTH_SECRET: "replace-with-a-long-random-secret-min-32-chars",
      })
    ).toBeNull();
  });

  it("rejects short AUTH_SECRET in production", () => {
    expect(
      resolveAuthSecret({
        NODE_ENV: "production",
        AUTH_SECRET: "short-but-not-placeholder",
      })
    ).toBeNull();
  });

  it("accepts strong AUTH_SECRET in production", () => {
    const s = resolveAuthSecret({
      NODE_ENV: "production",
      AUTH_SECRET: "prod-grade-secret-value-at-least-32-chars!!",
    });
    expect(s?.length).toBeGreaterThanOrEqual(32);
  });

  it("session cookies are httpOnly and SameSite=lax", () => {
    const opts = getSessionCookieOptions(3600, { NODE_ENV: "production" });
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.secure).toBe(true);
    expect(opts.path).toBe("/");
  });

  it("session cookies secure=false outside production", () => {
    const opts = getSessionCookieOptions(3600, { NODE_ENV: "development" });
    expect(opts.secure).toBe(false);
    expect(opts.httpOnly).toBe(true);
  });

  it("reports production warnings when secrets missing", () => {
    const w = authProductionWarnings({ NODE_ENV: "production" });
    expect(w.some((x) => x.includes("AUTH_SECRET"))).toBe(true);
    expect(w.some((x) => x.includes("DATABASE_URL"))).toBe(true);
  });
});
