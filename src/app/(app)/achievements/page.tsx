"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { loadAchievements, loadStreak } from "@/lib/user-activity";
import { formatArabicNumber } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";

export default function AchievementsPage() {
  // Empty SSR-safe defaults — read localStorage only after mount
  const [achs, setAchs] = useState<ReturnType<typeof loadAchievements>>([]);
  const [streak, setStreak] = useState({
    current: 0,
    longest: 0,
    lastActiveDate: "",
    totalDays: 0,
  });

  useEffect(() => {
    setAchs(loadAchievements());
    setStreak(loadStreak());
    const on = () => {
      setAchs(loadAchievements());
      setStreak(loadStreak());
    };
    window.addEventListener("hafiz-activity", on);
    window.addEventListener("hafiz-achievements-updated", on);
    window.addEventListener("hafiz-quiz-completed", on);
    window.addEventListener("hafiz-sync-applied", on);
    return () => {
      window.removeEventListener("hafiz-activity", on);
      window.removeEventListener("hafiz-achievements-updated", on);
      window.removeEventListener("hafiz-quiz-completed", on);
      window.removeEventListener("hafiz-sync-applied", on);
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <FadeIn>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-[#D4AF37]" />
            الإنجازات والسلاسل
          </h1>
          <p className="text-sm text-muted-foreground">
            سلسلة حالية: 🔥 {formatArabicNumber(streak.current)} · أطول:{" "}
            {formatArabicNumber(streak.longest)}
          </p>
        </div>
      </FadeIn>

      <div className="grid gap-3 sm:grid-cols-2">
        {achs.map((a) => (
          <Card
            key={a.id}
            className={a.unlocked ? "border-[#D4AF37]/30" : "opacity-75"}
          >
            <CardContent className="flex gap-3 p-4">
              <div className="text-3xl">{a.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{a.title}</p>
                  {a.unlocked && <Badge variant="success">مفتوح</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.description}
                </p>
                <Progress
                  className="mt-2"
                  value={(a.progress / a.target) * 100}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatArabicNumber(a.progress)} /{" "}
                  {formatArabicNumber(a.target)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
