import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  authProductionWarnings,
  isAuthConfigured,
  isAuthRequired,
} from "@/lib/auth/config";
import { isDatabaseConfigured } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  const warnings = authProductionWarnings();
  return NextResponse.json({
    ok: true,
    user: session,
    authConfigured: isAuthConfigured(),
    databaseConfigured: isDatabaseConfigured(),
    requireAuth: isAuthRequired(),
    /** Only surfaced in non-production or when debugging */
    warnings:
      process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "1"
        ? warnings
        : undefined,
  });
}
