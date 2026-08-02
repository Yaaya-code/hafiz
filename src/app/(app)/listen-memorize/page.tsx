"use client";

/**
 * Legacy 6-phase listen-memorize retired.
 * Redirect to the new single-cycle Talqeen session.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function ListenMemorizeRedirectPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-[40vh] max-w-lg" />}>
      <RedirectInner />
    </Suspense>
  );
}

function RedirectInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const q = new URLSearchParams();
    const surah = params.get("surah");
    const from = params.get("from");
    const to = params.get("to");
    const qari = params.get("qari");
    const reps = params.get("reps");
    if (surah) q.set("surah", surah);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (qari) q.set("qari", qari);
    if (reps) q.set("reps", reps);
    const qs = q.toString();
    router.replace(qs ? `/session/talqeen?${qs}` : "/session/talqeen");
  }, [router, params]);

  return (
    <div className="mx-auto max-w-lg p-10 text-center text-sm text-muted-foreground">
      جاري فتح وضع التلقين الجديد…
    </div>
  );
}
