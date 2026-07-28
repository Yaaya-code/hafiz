/**
 * Build measurable goals for the Goals page from real local plan + activity.
 * Does not invent planning logic — surfaces progress against orchestrated plan.
 */

import type { HafizProfile } from "@/lib/user-profile";
import type { DashboardPlanView } from "@/application";
import type { LearningSnapshot } from "@/application";
import {
  computeDailyGoalProgress,
  computeWeeklyReviewCount,
} from "@/lib/dashboard-local-stats";
import { loadStreak } from "@/lib/user-activity";
import { loadMemStats } from "@/lib/memorization-store";

export type GoalPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type ProgressGoal = {
  id: string;
  title: string;
  period: GoalPeriod;
  target: number;
  current: number;
  unit: string;
  completed: boolean;
  /** Links goal to engine / profile intent */
  source: "plan" | "profile" | "streak" | "activity";
};

/**
 * Measurable goals derived from today's plan, weekly reviews, streak, profile.
 * Profile text goals (onboarding) remain separate qualitative targets.
 */
export function buildProgressGoals(input: {
  profile: HafizProfile;
  view: DashboardPlanView | null;
  snapshot: LearningSnapshot | null;
}): ProgressGoal[] {
  const { profile, view, snapshot } = input;
  const goals: ProgressGoal[] = [];

  const plannedSteps =
    view?.steps.filter((s) => s.kind !== "finish").length ?? 0;
  const daily = computeDailyGoalProgress({
    plannedStepCount: plannedSteps,
    plannedRevisionItems: view?.revision.items.length ?? 0,
    profileDailyRevisionPages: profile.plan?.dailyRevisionPages,
  });
  goals.push({
    id: "daily_journey",
    title: "ورد اليوم (خطوات الرحلة)",
    period: "DAILY",
    target: daily.target,
    current: daily.current,
    unit: "خطوة",
    completed: daily.current >= daily.target,
    source: "plan",
  });

  const dailyMinutesTarget = Math.max(
    10,
    profile.dailyMinutes || profile.plan?.sessionLengthMinutes || 30
  );
  const todayMinutes = view?.totalMinutes ?? 0;
  const dailyDone = daily.current >= daily.target;
  // Progress: fraction of planned minutes from journey steps completed
  let minutesDone = Math.min(
    dailyMinutesTarget,
    Math.round(
      daily.target > 0
        ? (daily.current / daily.target) *
            (view?.totalMinutes || dailyMinutesTarget)
        : 0
    )
  );
  if (dailyDone) {
    minutesDone = Math.min(
      dailyMinutesTarget,
      todayMinutes || dailyMinutesTarget
    );
  }
  goals.push({
    id: "daily_minutes",
    title: "وقت مع القرآن اليوم",
    period: "DAILY",
    target: dailyMinutesTarget,
    current: minutesDone,
    unit: "دقيقة",
    completed: minutesDone >= dailyMinutesTarget || dailyDone,
    source: "profile",
  });

  const weekTarget = Math.max(
    7,
    (profile.plan?.dailyRevisionPages || 3) * 7,
    plannedSteps * 5
  );
  const weekCurrent = computeWeeklyReviewCount(snapshot);
  goals.push({
    id: "weekly_reviews",
    title: "مراجعة هذا الأسبوع",
    period: "WEEKLY",
    target: weekTarget,
    current: Math.min(weekCurrent, weekTarget * 2),
    unit: "وحدة",
    completed: weekCurrent >= weekTarget,
    source: "activity",
  });

  const streak = loadStreak();
  const streakTarget = 7;
  goals.push({
    id: "streak_7",
    title: "سلسلة الانتظام",
    period: "WEEKLY",
    target: streakTarget,
    current: Math.min(streak.current, streakTarget),
    unit: "يوم",
    completed: streak.current >= streakTarget,
    source: "streak",
  });

  const mem = loadMemStats();
  const monthlyMasterTarget = Math.max(10, (profile.pagesPerDay || 1) * 20);
  goals.push({
    id: "monthly_mastery",
    title: "آيات متقنة (تراكمي)",
    period: "MONTHLY",
    target: monthlyMasterTarget,
    current: mem.ayahsMastered || 0,
    unit: "آية",
    completed: (mem.ayahsMastered || 0) >= monthlyMasterTarget,
    source: "activity",
  });

  return goals;
}

/**
 * Qualitative goals from onboarding — already mapped into core UserProfile.goals
 * via adaptHafizProfileToUserProfile (feeds Logic Bible predicates).
 */
export function profileIntentGoals(profile: HafizProfile): string[] {
  const list = (profile.goals || []).filter((g) => g && g.trim().length > 0);
  if (list.length) return list;
  return profile.plan?.goals?.filter(Boolean) || [];
}
