"use client";

/**
 * EXTERNAL_TRACKER: set today's manual wird and open scoped tools
 * (revision session, speech, error bank, custom quiz) without auto plan.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Mic, PencilLine, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SURAHS, getSurah } from "@/lib/quran";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import {
  buildManualWird,
  manualWirdQuizHref,
  manualWirdSessionHref,
  profileWithManualWird,
  usageTrackLabelAr,
} from "@/lib/usage-track";
import { formatArabicNumber } from "@/lib/utils";
import { invalidatePlanCache } from "@/application";

type Props = {
  /** Compact card for dashboard; full form for settings */
  compact?: boolean;
};

export function ManualWirdCard({ compact = false }: Props) {
  const { profile, ready, update } = useHafizProfile();
  const w = profile.manualWird;
  const [surah, setSurah] = useState(w?.surah ?? 2);
  const [fromAyah, setFromAyah] = useState(w?.fromAyah ?? 1);
  const [toAyah, setToAyah] = useState(w?.toAyah ?? 16);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(!w);

  useEffect(() => {
    if (!w) return;
    setSurah(w.surah);
    setFromAyah(w.fromAyah);
    setToAyah(w.toAyah);
    setEditing(false);
    // Sync form when profile.manualWird identity fields change
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional field deps
  }, [w?.surah, w?.fromAyah, w?.toAyah, w?.updatedAt]);

  const maxAyah = useMemo(
    () => getSurah(surah)?.ayahCount ?? 286,
    [surah]
  );

  if (!ready) return null;
  if (profile.usageTrack !== "EXTERNAL_TRACKER") return null;

  function save() {
    const wird = buildManualWird({ surah, fromAyah, toAyah });
    update((p) => profileWithManualWird(p, wird));
    try {
      invalidatePlanCache();
    } catch {
      /* non-fatal */
    }
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card className="border-[#D4AF37]/30 bg-[#D4AF37]/5">
      <CardHeader className={compact ? "pb-2 pt-4 px-4" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-[#D4AF37]" />
              الورد الحالي (يدوي)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {usageTrackLabelAr("EXTERNAL_TRACKER")} — بدون خطة تلقائية · استخدم
              التسميع والاختبارات على نطاقك
            </p>
          </div>
          <Badge variant="muted">EXTERNAL</Badge>
        </div>
      </CardHeader>
      <CardContent className={`space-y-3 ${compact ? "px-4 pb-4" : ""}`}>
        {w && !editing ? (
          <>
            <p className="text-sm font-medium">
              {w.labelAr ||
                `سورة ${getSurah(w.surah)?.nameAr || w.surah} · ${formatArabicNumber(w.fromAyah)}–${formatArabicNumber(w.toAyah)}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={manualWirdSessionHref(w)}>
                <Button type="button" variant="premium" size="sm" className="gap-1">
                  <Mic className="h-3.5 w-3.5" />
                  افتح الورد والتسميع
                </Button>
              </Link>
              <Link href={manualWirdQuizHref(w)}>
                <Button type="button" variant="outline" size="sm" className="gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  اختبار النطاق
                </Button>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                تعديل
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">السورة</Label>
              <select
                className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                value={surah}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setSurah(n);
                  setFromAyah(1);
                  const m = getSurah(n)?.ayahCount ?? 16;
                  setToAyah(Math.min(16, m));
                }}
              >
                {SURAHS.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number}. {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">من آية</Label>
                <Input
                  type="number"
                  min={1}
                  max={maxAyah}
                  value={fromAyah}
                  onChange={(e) => setFromAyah(Number(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">إلى آية</Label>
                <Input
                  type="number"
                  min={1}
                  max={maxAyah}
                  value={toAyah}
                  onChange={(e) => setToAyah(Number(e.target.value) || 1)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="premium" size="sm" onClick={save}>
                {saved ? "تم الحفظ ✓" : "حفظ الورد"}
              </Button>
              {w && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  إلغاء
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <BookOpen className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              بعد الحفظ: قراءة بالنطاق · تسميع صوتي · بنك أخطاء · اختبار مخصص —
              دون توليد خطة زمنية من المحرك.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
