import { NextRequest, NextResponse } from "next/server";
import {
  pushAndMergeProgress,
  pullSnapshotForUser,
} from "@/lib/sync/server-sync";
import { isDatabaseConfigured } from "@/lib/prisma";
import type { SyncPushBody } from "@/lib/sync/types";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

/**
 * POST /api/v1/sync
 * Push local snapshot → merge into Postgres → return merged snapshot.
 * Uses session user when logged in; falls back to guestKey / userId body.
 *
 * GET /api/v1/sync?userId=…&deviceId=…
 * Pull cloud snapshot (session preferred).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SyncPushBody;
    if (!body?.deviceId || !body?.snapshot) {
      return NextResponse.json(
        { ok: false, error: "deviceId and snapshot required" },
        { status: 400 }
      );
    }
    const session = await getSession();
    const result = await pushAndMergeProgress(body, {
      sessionUserId: session?.userId ?? null,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error("[api/sync POST]", err);
    return NextResponse.json(
      {
        ok: false,
        mode: "local_only",
        synced: false,
        error: err instanceof Error ? err.message : "sync failed",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const guestKey = searchParams.get("guestKey") || searchParams.get("deviceId");
  const deviceId = searchParams.get("deviceId") || "unknown";

  if (!isDatabaseConfigured() || !prisma) {
    return NextResponse.json({
      ok: true,
      mode: "local_only",
      synced: false,
      message: "No database — local-only mode",
    });
  }

  try {
    const session = await getSession();
    let resolvedId = session?.userId || userId;
    if (!resolvedId && guestKey) {
      const u = await prisma.user.findUnique({ where: { guestKey } });
      resolvedId = u?.id ?? null;
    }
    if (!resolvedId) {
      return NextResponse.json({
        ok: true,
        mode: "cloud",
        synced: false,
        message: "No user found for pull",
      });
    }

    const snapshot = await pullSnapshotForUser(resolvedId, deviceId);
    return NextResponse.json({
      ok: true,
      mode: "cloud",
      synced: true,
      userId: resolvedId,
      snapshot,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/sync GET]", err);
    return NextResponse.json(
      {
        ok: false,
        mode: "cloud",
        synced: false,
        error: err instanceof Error ? err.message : "pull failed",
      },
      { status: 500 }
    );
  }
}
