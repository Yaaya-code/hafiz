"use client";

/**
 * Invisible-first sync UX.
 * - Background sync does not flash "جاري المزامنة…"
 * - Only show offline notice or real sync errors
 * - Brief success is optional and suppressed by default
 */

import { useSyncProgress } from "@/hooks/use-sync-progress";
import { cn } from "@/lib/utils";

export function SyncStatusBanner() {
  const { status, isOnline } = useSyncProgress();

  // Online + healthy (including quiet background syncing) → no chrome
  if (isOnline && status !== "error") {
    return null;
  }

  if (!isOnline) {
    return (
      <div
        className={cn(
          "border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100"
        )}
        role="status"
      >
        أنت غير متصل — تقدّمك محفوظ، وسيُحدَّث تلقائياً عند عودة الشبكة.
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="border-b border-orange-500/30 bg-orange-500/10 px-4 py-2 text-center text-xs text-orange-100"
        role="alert"
      >
        ⚠ حدث خطأ مؤقت في الاتصال — تقدّمك بأمان.
      </div>
    );
  }

  return null;
}
