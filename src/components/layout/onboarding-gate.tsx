"use client";

/**
 * Simple UX gate: no forced multi-step onboarding.
 * Ensures a safe completed profile (local + optional server heal)
 * so stats / profile screens never see null critical fields.
 */

import { useEffect, useRef } from "react";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import {
  ensureSimpleProfileReady,
  hasCompletedOnboarding,
  loadProfile,
} from "@/lib/user-profile";
import { bootstrapSimpleProfileAction } from "@/lib/actions/bootstrap-simple-profile";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { profile, ready, update } = useHafizProfile();
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (bootstrappedRef.current) return;

    const complete =
      hasCompletedOnboarding(loadProfile()) ||
      hasCompletedOnboarding(profile);

    if (complete) {
      // Still heal missing numeric/enum fields for older profiles
      const healed = ensureSimpleProfileReady({ name: profile.name });
      if (
        !profile.plan ||
        !profile.learningStyle ||
        profile.memorizationStrength == null
      ) {
        update(healed);
      }
      bootstrappedRef.current = true;
      void bootstrapSimpleProfileAction({ name: healed.name || undefined });
      return;
    }

    // Auto-complete simplified onboarding — no redirect to /onboarding
    const readyProfile = ensureSimpleProfileReady({
      name: profile.name || undefined,
    });
    update(readyProfile);
    bootstrappedRef.current = true;
    void bootstrapSimpleProfileAction({
      name: readyProfile.name || undefined,
    });
  }, [ready, profile, update]);

  return <>{children}</>;
}
