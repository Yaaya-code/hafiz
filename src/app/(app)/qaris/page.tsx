"use client";

import { useState } from "react";
import { Check, Pause, Play } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAvailableQaris, qariPreviewAudioUrl } from "@/lib/quran";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { useGlobalAudio } from "@/hooks/use-global-audio";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";
import { PageHeader } from "@/components/layout/back-button";
import { QariAvatar } from "@/components/quran/qari-avatar";
import Link from "next/link";

export default function QarisPage() {
  const { profile, update } = useHafizProfile();
  const { play, stop, playing, currentUrl } = useGlobalAudio();
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  function selectQari(id: string) {
    // Functional update — never run during render; only from click handlers
    update((p) => ({ ...p, preferredQariId: id }));
  }

  function preview(id: string) {
    const url = qariPreviewAudioUrl(id);
    // Toggle off if same sample already playing
    if (previewingId === id && playing) {
      stop();
      setPreviewingId(null);
      return;
    }
    setPreviewingId(id);
    play(url, {
      onEnded: () => setPreviewingId(null),
      onError: () => setPreviewingId(null),
    });
  }

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <FadeIn>
        <PageHeader
          title="مكتبة القرّاء"
          description="قرّاء بتسجيل كامل للمصحف (١١٤ سورة) — يُستخدم في القراءة والمراجعة والحفظ والاستماع"
          backHref="/dashboard"
          actions={
            <Link
              href="/listen-memorize"
              className="inline-flex h-8 items-center rounded-lg bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] px-3 text-xs font-medium text-white"
            >
              الحفظ بالاستماع
            </Link>
          }
        />
      </FadeIn>

      <div className="grid gap-4 sm:grid-cols-2">
        {getAvailableQaris().map((q) => {
          const active = profile.preferredQariId === q.id;
          const isPlayingThis =
            previewingId === q.id &&
            playing &&
            currentUrl === qariPreviewAudioUrl(q.id);

          return (
            <Card
              key={q.id}
              className={cn(
                "transition-all",
                active && "border-primary/50 shadow-md shadow-[0_0_20px_rgba(212,175,55,0.15)]"
              )}
            >
              <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                <QariAvatar qari={q} size={72} className="h-[72px] w-[72px]" />
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    {q.nameAr}
                    {active && (
                      <Badge variant="success" className="gap-1">
                        <Check className="h-3 w-3" />
                        المفضّل
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">{q.style}</CardDescription>
                  {q.bioAr && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {q.bioAr}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-[#D4AF37] dark:text-[#D4AF37]">
                    تسجيل كامل ١١٤ سورة · عينة: الفاتحة آية ٢
                  </p>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => preview(q.id)}
                >
                  {isPlayingThis ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      إيقاف
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      استمع عينة
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "premium"}
                  onClick={() => selectQari(q.id)}
                >
                  {active ? "مختار" : "اختيار للورد"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
