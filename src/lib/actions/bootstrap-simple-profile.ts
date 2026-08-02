"use server";

/**
 * Server-side: ensure Prisma Profile has safe non-null defaults
 * and onboardingComplete=true for the simplified UX path.
 */

import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { getSimplePlanShell } from "@/lib/user-profile";

const EMPTY_MEM_SELECTION = {
  mode: "JUZ",
  juzSelections: [] as number[],
  surahSelections: [] as { surah: number; strength?: string }[],
};

/**
 * Call after login/signup or first dashboard paint.
 * Idempotent — never wipes an already-complete rich profile.
 */
export async function bootstrapSimpleProfileAction(opts?: {
  name?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isDatabaseConfigured() || !prisma) {
      return { ok: true }; // local-only / no DB — client profile is enough
    }

    const session = await getSession();
    if (!session?.userId) {
      return { ok: false, error: "no_session" };
    }

    const existing = await prisma.profile.findUnique({
      where: { userId: session.userId },
    });

    const name =
      (opts?.name || session.name || "").trim() || "صديق القرآن";
    const planShell = getSimplePlanShell(name);

    if (!existing) {
      await prisma.profile.create({
        data: {
          userId: session.userId,
          onboardingComplete: true,
          pagesPerDay: 1,
          revisionSessionsPerDay: 2,
          dailyMinutes: 30,
          memorizationStrength: 3,
          revisionStyle: "BALANCED",
          preferredQariId: "alafasy",
          startPage: 1,
          currentPage: 1,
          memorizationSelection: EMPTY_MEM_SELECTION,
          targetPlan: planShell,
          preferences: {
            learningStyle: "LISTEN_AND_READ",
            usageTrack: "FREE_EXPLORER",
            hasActivePlan: false,
            simpleUx: true,
          },
        },
      });
      return { ok: true };
    }

    // Heal incomplete / null-ish profiles only
    const data: {
      onboardingComplete?: boolean;
      pagesPerDay?: number;
      revisionSessionsPerDay?: number;
      dailyMinutes?: number;
      memorizationStrength?: number;
      preferredQariId?: string;
      memorizationSelection?: object;
      targetPlan?: object;
      preferences?: object;
    } = {};

    if (!existing.onboardingComplete) {
      data.onboardingComplete = true;
    }
    if (existing.pagesPerDay == null || existing.pagesPerDay < 0) {
      data.pagesPerDay = 1;
    }
    if (
      existing.revisionSessionsPerDay == null ||
      existing.revisionSessionsPerDay < 1
    ) {
      data.revisionSessionsPerDay = 2;
    }
    if (existing.dailyMinutes == null || existing.dailyMinutes < 1) {
      data.dailyMinutes = 30;
    }
    if (
      existing.memorizationStrength == null ||
      existing.memorizationStrength < 1
    ) {
      data.memorizationStrength = 3;
    }
    if (!existing.preferredQariId) {
      data.preferredQariId = "alafasy";
    }
    if (existing.memorizationSelection == null) {
      data.memorizationSelection = EMPTY_MEM_SELECTION;
    }
    if (existing.targetPlan == null) {
      data.targetPlan = planShell;
    }
    if (existing.preferences == null) {
      data.preferences = {
        learningStyle: "LISTEN_AND_READ",
        usageTrack: "FREE_EXPLORER",
        hasActivePlan: false,
        simpleUx: true,
      };
    }

    if (Object.keys(data).length > 0) {
      await prisma.profile.update({
        where: { userId: session.userId },
        data,
      });
    }

    return { ok: true };
  } catch (e) {
    console.error("[bootstrapSimpleProfile]", e);
    return { ok: false, error: "bootstrap_failed" };
  }
}
