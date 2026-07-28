/**
 * Prisma client singleton — safe when DATABASE_URL is missing.
 * App keeps working in local-only mode without a live Postgres connection.
 *
 * Supabase: set DATABASE_URL (pooler) + DIRECT_URL (direct).
 * If DIRECT_URL is omitted, it falls back to DATABASE_URL so Prisma still boots.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  // Schema declares directUrl — ensure env is present for Prisma
  if (!process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }
  try {
    return new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
    });
  } catch {
    return null;
  }
}

export const prisma: PrismaClient | null =
  globalForPrisma.prisma ?? createClient();

// Cache on globalThis in all envs (important for serverless connection reuse)
if (prisma) {
  globalForPrisma.prisma = prisma;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && prisma);
}

export async function withPrisma<T>(
  fn: (db: PrismaClient) => Promise<T>
): Promise<T | null> {
  if (!prisma) return null;
  try {
    return await fn(prisma);
  } catch (err) {
    console.error("[prisma]", err);
    return null;
  }
}
