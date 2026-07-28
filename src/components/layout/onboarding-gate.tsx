"use client";

/**
 * Client-side first-run gate for app shell routes.
 * Incomplete onboarding → /onboarding (once profile has hydrated).
 *
 * Always re-reads localStorage via hasCompletedOnboarding() so a stale React
 * profile snapshot cannot trap users after they finished onboarding.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import {
  hasCompletedOnboarding,
  loadProfile,
} from "@/lib/user-profile";

/** Routes that may be used before onboarding is complete */
const ALLOWED_WITHOUT_ONBOARDING = new Set(["/settings"]);

function isAllowedWithoutOnboarding(pathname: string): boolean {
  return Array.from(ALLOWED_WITHOUT_ONBOARDING).some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { profile, ready } = useHafizProfile();
  const pathname = usePathname();
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!pathname) return;

    // Source of truth: fresh localStorage, not just React state
    const complete =
      hasCompletedOnboarding(loadProfile()) ||
      hasCompletedOnboarding(profile);

    if (complete) {
      redirectedRef.current = false;
      return;
    }

    if (isAllowedWithoutOnboarding(pathname)) return;

    // Avoid replace spam if already navigating
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace("/onboarding");
  }, [ready, profile, pathname, router]);

  // Also re-check after sync / profile events (covers in-flight races)
  useEffect(() => {
    if (!ready) return;
    const recheck = () => {
      if (hasCompletedOnboarding(loadProfile())) {
        redirectedRef.current = false;
        return;
      }
      if (!pathname || isAllowedWithoutOnboarding(pathname)) return;
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      router.replace("/onboarding");
    };
    window.addEventListener("hafiz-profile-updated", recheck);
    window.addEventListener("hafiz-sync-applied", recheck);
    return () => {
      window.removeEventListener("hafiz-profile-updated", recheck);
      window.removeEventListener("hafiz-sync-applied", recheck);
    };
  }, [ready, pathname, router]);

  return <>{children}</>;
}
