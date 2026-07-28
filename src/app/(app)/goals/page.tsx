"use client";

/**
 * Goals — real progress from plan + local activity + profile intent goals.
 * Profile goals already feed the planning engine via profile adapter.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatArabicNumber } from "@/lib/utils";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { useOrchestratedPlan } from "@/hooks/use-orchestrated-plan";
import {
  getLearningSnapshot,
  LEARNING_SNAPSHOT_EVENT,
  type LearningSnapshot,
} from "@/application";
import {
  buildProgressGoals,
  profileIntentGoals,
  type ProgressGoal,
} from "@/lib/goals-from-learning";
import { loadAchievements } from "@/lib/user-activity";
import { FadeIn } from "@/components/motion/fade-in";

const periodLabel: Record<ProgressGoal["period"], string> = {
  DAILY: "يومي",
  WEEKLY: "أسبوعي",
  MONTHLY: "شهري",
  YEARLY: "سنوي",
};

export default function GoalsPage() {
  const { profile, ready: profileReady } = useHafizProfile();
  const { ready: planReady, view } = useOrchestratedPlan();
  const [goals, setGoals] = useState<ProgressGoal[]>([]);
  const [intent, setIntent] = useState<string[]>([]);
  const [achs, setAchs] = useState<ReturnType<typeof loadAchievements>>([]);

  useEffect(() => {
    if (!profileReady || !planReady) return;
    const refresh = () => {
      let snap: LearningSnapshot | null = null;
      try {
        snap = getLearningSnapshot();
      } catch {
        snap = null;
      }
      setGoals(buildProgressGoals({ profile, view, snapshot: snap }));
      setIntent(profileIntentGoals(profile));
      setAchs(loadAchievements());
    };
    refresh();
    window.addEventListener("hafiz-activity", refresh);
    window.addEventListener("hafiz-mem-updated", refresh);
    window.addEventListener("hafiz-journey-updated", refresh);
    window.addEventListener("hafiz-profile-updated", refresh);
    window.addEventListener(LEARNING_SNAPSHOT_EVENT, refresh);
    return () => {
      window.removeEventListener("hafiz-activity", refresh);
      window.removeEventListener("hafiz-mem-updated", refresh);
      window.removeEventListener("hafiz-journey-updated", refresh);
      window.removeEventListener("hafiz-profile-updated", refresh);
      window.removeEventListener(LEARNING_SNAPSHOT_EVENT, refresh);
    };
  }, [profile, profileReady, planReady, view]);

  if (!profileReady || !planReady) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">الأهداف</h1>
            <p className="text-sm text-muted-foreground">
              أهدافك من الإعداد + تقدمك الحقيقي على خطة حافظ
            </p>
          </div>
          <Link
            href="/plans/journey"
            className="inline-flex h-8 items-center rounded-lg bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] px-3 text-xs font-medium text-white"
          >
            رحلة اليوم
          </Link>
        </div>
      </FadeIn>

      {intent.length > 0 && (
        <Card className="border-[#D4AF37]/20 bg-[#D4AF37]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">نواياك من الإعداد</CardTitle>
            <p className="text-xs text-muted-foreground">
              تُمرَّر لمحرّك التخطيط عبر ملفك الشخصي وتؤثر على قرارات اليوم
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {intent.map((g, i) => (
              <Badge key={i} variant="secondary">
                {g}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {goals.map((g) => {
          const pct = Math.min(
            100,
            Math.round((g.current / Math.max(1, g.target)) * 100)
          );
          return (
            <Card key={g.id}>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{g.title}</CardTitle>
                <div className="flex items-center gap-1.5">
                  {g.completed && <Badge variant="success">مكتمل</Badge>}
                  <Badge variant="muted">{periodLabel[g.period]}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatArabicNumber(g.current)}
                  <span className="text-base text-muted-foreground">
                    /{formatArabicNumber(g.target)} {g.unit}
                  </span>
                </p>
                <Progress className="mt-3" value={pct} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatArabicNumber(pct)}% مكتمل
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">الشارات</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achs.map((a) => (
            <Card
              key={a.id}
              className={a.unlocked ? "border-[#D4AF37]/30" : "opacity-70"}
            >
              <CardContent className="flex gap-4 p-4">
                <div className="text-3xl">{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.description}
                  </p>
                  {!a.unlocked && (
                    <Progress
                      className="mt-2"
                      value={(a.progress / Math.max(1, a.target)) * 100}
                    />
                  )}
                  {a.unlocked && (
                    <Badge variant="success" className="mt-2">
                      مفتوح
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
