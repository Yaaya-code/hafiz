"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { stopGlobalAudio } from "@/lib/audio/global-audio";

/**
 * Mount once at app root. Stops all Quran/preview audio on route change
 * and on unmount so streams never overlap across pages.
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    stopGlobalAudio();
    return () => {
      stopGlobalAudio();
    };
  }, [pathname]);

  useEffect(() => {
    const onVis = () => {
      // Optional: keep playing in background — only stop if tab hidden long-term
      // Spec: stop on navigation only, not on visibility.
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stopGlobalAudio();
    };
  }, []);

  return <>{children}</>;
}
