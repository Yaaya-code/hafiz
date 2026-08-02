"use client";

/**
 * Simplified home hub (Phase A).
 * Two primary modes: direct recitation + listen-and-repeat (talqeen).
 * No journey orchestration, score charts, or forced plans.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Headphones,
  Mic,
  Settings,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import {
  displayName,
  ensureSimpleProfileReady,
} from "@/lib/user-profile";
import { bootstrapSimpleProfileAction } from "@/lib/actions/bootstrap-simple-profile";
import {
  buildManualWird,
  profileWithManualWird,
} from "@/lib/usage-track";
import { SURAHS, getSurah, getAvailableQaris } from "@/lib/quran";
import { formatArabicNumber, cn } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";
import { SHINE_GOLD_TEXT } from "@/lib/ui-active";

type Mode = "direct" | "talqeen";

export function DashboardView() {
  const router = useRouter();
  const { profile, ready, update } = useHafizProfile();

  const [surah, setSurah] = useState(2);
  const [fromAyah, setFromAyah] = useState(1);
  const [toAyah, setToAyah] = useState(10);
  const [qariId, setQariId] = useState("alafasy");
  const [reps, setReps] = useState(3);
  const [mode, setMode] = useState<Mode>("direct");

  // Bootstrap local + cloud profile with safe defaults (skip long onboarding)
  useEffect(() => {
    if (!ready) return;
    const readyProfile = ensureSimpleProfileReady({
      name: profile.name || undefined,
    });
    if (
      readyProfile.onboardingComplete !== profile.onboardingComplete ||
      !profile.plan ||
      !profile.learningStyle
    ) {
      update(readyProfile);
    }
    void bootstrapSimpleProfileAction({
      name: readyProfile.name || profile.name || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when ready
  }, [ready]);

  // Seed form from last manual wird / preferred qari
  useEffect(() => {
    if (!ready) return;
    if (profile.manualWird) {
      setSurah(profile.manualWird.surah);
      setFromAyah(profile.manualWird.fromAyah);
      setToAyah(profile.manualWird.toAyah);
    }
    if (profile.preferredQariId) {
      setQariId(profile.preferredQariId);
    }
  }, [ready, profile.manualWird, profile.preferredQariId]);

  // Deep-link support from sidebar: /dashboard#direct | #talqeen
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (hash === "talqeen") setMode("talqeen");
    if (hash === "direct") setMode("direct");
  }, []);

  const maxAyah = useMemo(() => getSurah(surah)?.ayahCount ?? 286, [surah]);
  const qaris = useMemo(() => getAvailableQaris(), []);
  const surahMeta = getSurah(surah);

  function clampRange() {
    const from = Math.max(1, Math.min(maxAyah, fromAyah || 1));
    const to = Math.max(from, Math.min(maxAyah, toAyah || from));
    setFromAyah(from);
    setToAyah(to);
    return { from, to };
  }

  function persistWird(from: number, to: number) {
    const wird = buildManualWird({ surah, fromAyah: from, toAyah: to });
    update((p) => ({
      ...profileWithManualWird(p, wird),
      // Keep FREE_EXPLORER for simple UX (don't force EXTERNAL track noise)
      usageTrack:
        p.usageTrack === "AUTOMATIC_PLAN" ? p.usageTrack : "FREE_EXPLORER",
      preferredQariId: qariId || p.preferredQariId || "alafasy",
    }));
  }

  function startSession() {
    const { from, to } = clampRange();
    persistWird(from, to);

    if (mode === "direct") {
      router.push(
        `/session/revision?step=simple_direct&mode=memorize&surah=${surah}&from=${from}&to=${to}`
      );
      return;
    }

    // Talqeen interim: listen-memorize until dedicated /session/talqeen (Phase D)
    const params = new URLSearchParams({
      surah: String(surah),
      from: String(from),
      to: String(to),
      qari: qariId,
      reps: String(reps),
    });
    router.push(`/listen-memorize?${params.toString()}`);
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  const name = displayName(profile);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-28 sm:pb-12">
      <FadeIn>
        <header className="space-y-1">
          <p className={cn("text-sm font-medium", SHINE_GOLD_TEXT)}>
            بسم الله — ابدأ فوراً
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            مرحباً{name && name !== "صديق القرآن" ? `، ${name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            اختر الوضع، حدّد السورة والنطاق، وابدأ — بدون خطط معقّدة.
          </p>
        </header>
      </FadeIn>

      {/* Mode cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("direct")}
          className={cn(
            "rounded-2xl border p-4 text-start transition-all touch-manipulation",
            mode === "direct"
              ? "border-[#D4AF37] bg-[#D4AF37]/10 shadow-[0_0_24px_-8px_rgba(212,175,55,0.45)]"
              : "border-border/60 bg-card/40 hover:border-[#D4AF37]/40"
          )}
        >
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#D4AF37]/15 text-[#D4AF37]">
            <Mic className="h-5 w-5" />
          </div>
          <p className="font-semibold">تسميع مباشر</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            اختر مقطعاً وسمّع آية بآية مع تقييم فوري.
          </p>
          {mode === "direct" && (
            <Badge className="mt-3" variant="success">
              محدّد
            </Badge>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMode("talqeen")}
          className={cn(
            "rounded-2xl border p-4 text-start transition-all touch-manipulation",
            mode === "talqeen"
              ? "border-[#D4AF37] bg-[#D4AF37]/10 shadow-[0_0_24px_-8px_rgba(212,175,55,0.45)]"
              : "border-border/60 bg-card/40 hover:border-[#D4AF37]/40"
          )}
        >
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#D4AF37]/15 text-[#D4AF37]">
            <Headphones className="h-5 w-5" />
          </div>
          <p className="font-semibold">تلقين</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            اسمع الشيخ بعدد تكرار، ثم ردّد الآية.
          </p>
          {mode === "talqeen" && (
            <Badge className="mt-3" variant="success">
              محدّد
            </Badge>
          )}
        </button>
      </div>

      {/* Range picker */}
      <Card className="border-[#D4AF37]/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#D4AF37]" />
            تحديد النطاق
          </CardTitle>
          <CardDescription>
            {surahMeta?.nameAr
              ? `سورة ${surahMeta.nameAr} · ${formatArabicNumber(maxAyah)} آية`
              : "اختر السورة والآيات"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="surah">السورة</Label>
            <select
              id="surah"
              className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={surah}
              onChange={(e) => {
                const n = Number(e.target.value);
                setSurah(n);
                const max = getSurah(n)?.ayahCount ?? 1;
                setFromAyah(1);
                setToAyah(Math.min(10, max));
              }}
            >
              {SURAHS.map((s) => (
                <option key={s.number} value={s.number}>
                  {formatArabicNumber(s.number)}. {s.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="from">من الآية</Label>
              <Input
                id="from"
                type="number"
                min={1}
                max={maxAyah}
                value={fromAyah}
                onChange={(e) => setFromAyah(Number(e.target.value))}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">إلى الآية</Label>
              <Input
                id="to"
                type="number"
                min={1}
                max={maxAyah}
                value={toAyah}
                onChange={(e) => setToAyah(Number(e.target.value))}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          {mode === "talqeen" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="qari">الشيخ</Label>
                <select
                  id="qari"
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={qariId}
                  onChange={(e) => setQariId(e.target.value)}
                >
                  {qaris.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.nameAr || q.nameEn || q.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reps">مرات التكرار</Label>
                <select
                  id="reps"
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={reps}
                  onChange={(e) => setReps(Number(e.target.value))}
                >
                  {[1, 3, 5, 7].map((n) => (
                    <option key={n} value={n}>
                      {formatArabicNumber(n)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="premium"
            size="lg"
            className="hidden sm:flex w-full h-12 text-base gap-2"
            onClick={startSession}
          >
            {mode === "direct" ? (
              <>
                <Mic className="h-5 w-5" />
                ابدأ التسميع
              </>
            ) : (
              <>
                <Headphones className="h-5 w-5" />
                ابدأ التلقين
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {profile.manualWird && (
        <p className="text-center text-xs text-muted-foreground">
          آخر مقطع:{" "}
          <span className="text-foreground font-medium">
            {getSurah(profile.manualWird.surah)?.nameAr}{" "}
            {formatArabicNumber(profile.manualWird.fromAyah)}–
            {formatArabicNumber(profile.manualWird.toAyah)}
          </span>
        </p>
      )}

      <div className="flex justify-center">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#D4AF37] transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          الإعدادات والمزيد
        </Link>
      </div>

      {/* Sticky bottom CTA — large touch target (mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#D4AF37]/20 bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <Button
          type="button"
          variant="premium"
          className="h-14 w-full text-base font-bold gap-2 rounded-2xl shadow-[0_8px_30px_-8px_rgba(212,175,55,0.55)]"
          onClick={startSession}
        >
          {mode === "direct" ? (
            <>
              <Mic className="h-5 w-5" />
              ابدأ التسميع الآن
            </>
          ) : (
            <>
              <Headphones className="h-5 w-5" />
              ابدأ التلقين الآن
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
