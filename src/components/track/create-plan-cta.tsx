"use client";

/**
 * FREE_EXPLORER → one-click convert to AUTOMATIC_PLAN + open plan setup.
 */

import { useRouter } from "next/navigation";
import { CalendarPlus, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import {
  profileWithAutomaticPlan,
  usageTrackLabelAr,
} from "@/lib/usage-track";
import { invalidatePlanCache } from "@/application";

type Props = {
  compact?: boolean;
};

export function CreatePlanCta({ compact = false }: Props) {
  const { profile, ready, update } = useHafizProfile();
  const router = useRouter();

  if (!ready) return null;
  if (profile.usageTrack !== "FREE_EXPLORER") return null;

  function convertToPlan() {
    update((p) => profileWithAutomaticPlan(p));
    try {
      invalidatePlanCache();
    } catch {
      /* non-fatal */
    }
    // Plan reveal rebuilds orchestration for the new track
    router.push("/plan-reveal");
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-l from-primary/10 to-transparent overflow-hidden">
      <CardContent
        className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${compact ? "p-4" : "p-5"}`}
      >
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="muted">FREE</Badge>
            <span className="text-xs text-muted-foreground">
              {usageTrackLabelAr("FREE_EXPLORER")}
            </span>
          </div>
          <p className="font-semibold text-sm sm:text-base flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary shrink-0" />
            تحويل الحساب لبناء خطة حفظ ومراجعة يومية
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            بضغطة واحدة ينتقل حسابك إلى المسار التلقائي (
            {usageTrackLabelAr("AUTOMATIC_PLAN")}) ويفتح إعداد الخطة — يمكنك
            العودة لاحقاً من الإعدادات إن احتجت.
          </p>
        </div>
        <Button
          type="button"
          variant="premium"
          className="gap-2 shrink-0"
          onClick={convertToPlan}
        >
          <Sparkles className="h-4 w-4" />
          ابدأ خطة يومية
        </Button>
      </CardContent>
    </Card>
  );
}
