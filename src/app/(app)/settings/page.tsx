"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { useAuth } from "@/hooks/use-auth";
import { clearProfile, displayName, summarizeMemorization } from "@/lib/user-profile";
import { useEffect, useState } from "react";
import {
  getSpeechCapability,
  type SpeechCapability,
} from "@/lib/quran/speech-recognition";
import { ManualWirdCard } from "@/components/track/manual-wird-card";
import { CreatePlanCta } from "@/components/track/create-plan-cta";
import {
  usageTrackLabelAr,
  type UsageTrack,
} from "@/lib/usage-track";
import { invalidatePlanCache } from "@/application";

export default function SettingsPage() {
  const { profile, ready, update } = useHafizProfile();
  const auth = useAuth();
  const [name, setName] = useState("");
  const [pages, setPages] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saved, setSaved] = useState(false);
  const [speech, setSpeech] = useState<SpeechCapability | null>(null);

  useEffect(() => {
    setSpeech(getSpeechCapability());
  }, []);

  if (!ready) {
    return (
      <div className="mx-auto max-w-6xl xl:max-w-7xl p-8 text-sm text-muted-foreground">
        جاري التحميل...
      </div>
    );
  }

  const display = displayName(profile);

  function handleSave() {
    update((p) => ({
      ...p,
      name: name || p.name,
      journey: {
        ...p.journey,
        displayName: name || p.journey?.displayName || p.name,
      },
      pagesPerDay: pages ? Number(pages) : p.pagesPerDay,
      dailyMinutes: minutes ? Number(minutes) : p.dailyMinutes,
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleResetOnboarding() {
    clearProfile();
    window.location.href = "/onboarding";
  }

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl min-w-0 space-y-4 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">
          الملف الشخصي والتفضيلات وخطتك
        </p>
      </div>

      <Card className="border-[#D4AF37]/25">
        <CardHeader>
          <CardTitle className="text-base">الحساب</CardTitle>
          <CardDescription>
            حسابك يحفظ تقدمك تلقائياً عبر أجهزتك
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {auth.loading ? (
            <p className="text-muted-foreground">جاري التحقق من الجلسة…</p>
          ) : auth.user ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">الحساب متصل ومُزامن</Badge>
              </div>
              <p>
                <span className="text-muted-foreground">البريد: </span>
                <span dir="ltr">{auth.user.email}</span>
              </p>
              {auth.user.name && (
                <p>
                  <span className="text-muted-foreground">الاسم: </span>
                  {auth.user.name}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void auth.logout()}
                >
                  تسجيل الخروج
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                سجّل الدخول للوصول لحفظك وتقدمك.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/login"
                  className="inline-flex h-8 items-center rounded-lg bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] px-3 text-xs font-bold text-[#020408]"
                >
                  تسجيل الدخول
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent"
                >
                  إنشاء حساب
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Track mode + non-automatic UIs */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base">مسار الاستخدام</CardTitle>
          <CardDescription>
            الحالي:{" "}
            {usageTrackLabelAr(
              (profile.usageTrack || "AUTOMATIC_PLAN") as UsageTrack
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={
                profile.usageTrack === "AUTOMATIC_PLAN" || !profile.usageTrack
                  ? "success"
                  : "muted"
              }
            >
              {usageTrackLabelAr(
                (profile.usageTrack || "AUTOMATIC_PLAN") as UsageTrack
              )}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {profile.usageTrack === "EXTERNAL_TRACKER"
              ? "تحدد الورد يدوياً — المحرك لا يولّد جدولاً زمنياً. استخدم التسميع والاختبارات على نطاقك."
              : profile.usageTrack === "FREE_EXPLORER"
                ? "استخدام حر بدون خطة. يمكنك التحويل لخطة يومية بضغطة واحدة."
                : "محرك حافظ يبني ورد الحفظ والمراجعة يومياً."}
          </p>
          {profile.usageTrack === "AUTOMATIC_PLAN" || !profile.usageTrack ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  update((p) => ({
                    ...p,
                    usageTrack: "EXTERNAL_TRACKER",
                    hasActivePlan: false,
                    intentUpdatedAt: new Date().toISOString(),
                  }));
                  try {
                    invalidatePlanCache();
                  } catch {
                    /* ignore */
                  }
                }}
              >
                التحويل لمتابعة مع شيخ (ورد يدوي)
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {profile.usageTrack === "FREE_EXPLORER" && <CreatePlanCta />}
      {profile.usageTrack === "EXTERNAL_TRACKER" && <ManualWirdCard />}

      <Card className="border-[#D4AF37]/20">
        <CardHeader>
          <CardTitle className="text-base">ملخص رحلتك</CardTitle>
          <CardDescription>
            {profile.onboardingComplete
              ? "من إعدادك الشخصي"
              : "لم تُكمل الإعداد بعد"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {profile.onboardingComplete ? (
              <Badge variant="success">إعداد مكتمل</Badge>
            ) : (
              <Badge variant="warning">إعداد ناقص</Badge>
            )}
            {profile.revisionStyle && (
              <Badge variant="muted">{profile.revisionStyle}</Badge>
            )}
          </div>
          <p>
            <span className="text-muted-foreground">الاسم: </span>
            {display}
          </p>
          {profile.journey?.relationship && (
            <p>
              <span className="text-muted-foreground">علاقتك بالقرآن: </span>
              {profile.journey.relationship}
            </p>
          )}
          {profile.journey?.topChallenge && (
            <p>
              <span className="text-muted-foreground">أولوية حافظ: </span>
              {profile.journey.topChallenge}
            </p>
          )}
          {profile.journey?.habitTime && (
            <p>
              <span className="text-muted-foreground">وقت التلاوة المعتاد: </span>
              {profile.journey.habitTime}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">الحفظ: </span>
            {summarizeMemorization(profile.memorizationSelection)}
          </p>
          {profile.goals?.length > 0 && (
            <p>
              <span className="text-muted-foreground">الأهداف: </span>
              {profile.goals.join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href="/onboarding"
              className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent"
            >
              إعادة الإعداد
            </Link>
            <Button variant="ghost" size="sm" onClick={handleResetOnboarding}>
              مسح البيانات المحلية
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الملف الشخصي</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>الاسم</Label>
            <Input
              placeholder={display}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>صفحات حفظ / يوم</Label>
              <Input
                type="number"
                placeholder={String(profile.pagesPerDay)}
                value={pages}
                onChange={(e) => setPages(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>دقائق يومياً</Label>
              <Input
                type="number"
                placeholder={String(profile.dailyMinutes)}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </div>
          <Button variant="premium" onClick={handleSave}>
            {saved ? "تم الحفظ ✓" : "حفظ"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">المظهر</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">الوضع الداكن / الفاتح</span>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">التذكيرات</CardTitle>
          <CardDescription>
            لا يوجد تبويب منفصل للتذكيرات — اضبط التفضيلات هنا
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span>تذكير بورد المراجعة اليومي</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#D4AF37]" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span>تذكير بورد الحفظ</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#D4AF37]" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span>تنبيه عند ضعف آية (من الأخطاء)</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#D4AF37]" />
          </label>
          <p className="text-xs text-muted-foreground">
            الإشعارات الفورية للمتصفح تُفعَّل لاحقاً عند دعم الإشعارات على جهازك.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">اللغة</CardTitle>
          <CardDescription>الواجهة حالياً بالعربية — الإنجليزية قريباً</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Badge variant="success">العربية</Badge>
            <Badge variant="muted">English (قريباً)</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">التعرّف على الصوت (التسميع)</CardTitle>
          <CardDescription>
            يُستخدم في جلسة المراجعة — يحتاج متصفحاً داعماً وإذن ميكروفون
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {speech ? (
            <>
              <Badge variant={speech.supported ? "success" : "warning"}>
                {speech.supported ? "مدعوم على هذا الجهاز" : "غير مدعوم"}
              </Badge>
              {speech.reasonAr && (
                <p className="text-xs text-muted-foreground">{speech.reasonAr}</p>
              )}
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>سياق آمن (HTTPS): {speech.secureContext ? "نعم" : "لا"}</li>
                <li>محرك التعرّف: {speech.hasCtor ? "متوفر" : "غير متوفر"}</li>
                <li>الميكروفون API: {speech.mediaDevices ? "متوفر" : "غير متوفر"}</li>
              </ul>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">جاري الفحص…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
