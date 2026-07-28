"use client";

/**
 * Soft non-blocking toast for offline / audio network failures.
 * Does not interrupt revision session or recitation UI.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Notice = { message: string; kind: string; id: number };

export function AudioNoticeToast() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { message?: string; kind?: string }
        | undefined;
      if (!d?.message) return;
      setNotice({
        message: d.message,
        kind: d.kind || "error",
        id: Date.now(),
      });
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setNotice(null), 4500);
    };
    window.addEventListener("hafiz-audio-notice", on);
    return () => {
      window.removeEventListener("hafiz-audio-notice", on);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  if (!notice) return null;

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none fixed bottom-20 inset-x-0 z-[60] flex justify-center px-4",
      )}
    >
      <div
        className={cn(
          "max-w-md rounded-xl border px-4 py-2.5 text-center text-xs shadow-lg backdrop-blur-md",
          notice.kind === "offline" &&
            "border-amber-500/40 bg-amber-950/90 text-amber-50",
          notice.kind === "fallback" &&
            "border-sky-500/40 bg-sky-950/90 text-sky-50",
          notice.kind === "error" &&
            "border-orange-500/40 bg-orange-950/90 text-orange-50"
        )}
      >
        {notice.message}
      </div>
    </div>
  );
}
