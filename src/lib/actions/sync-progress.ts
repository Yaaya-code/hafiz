"use server";

import { pushAndMergeProgress } from "@/lib/sync/server-sync";
import type { SyncPushBody, SyncPullResult } from "@/lib/sync/types";
import { getSession } from "@/lib/auth/session";

/**
 * Server Action: push local progress snapshot to Prisma and return merge result.
 * Safe to call from client after login or on background interval.
 */
export async function syncProgressAction(
  body: SyncPushBody
): Promise<SyncPullResult> {
  if (!body?.deviceId || !body?.snapshot) {
    return {
      ok: false,
      mode: "local_only",
      synced: false,
      error: "deviceId and snapshot required",
    };
  }
  const session = await getSession();
  return pushAndMergeProgress(body, { sessionUserId: session?.userId ?? null });
}
