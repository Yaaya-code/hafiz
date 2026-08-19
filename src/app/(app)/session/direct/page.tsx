"use client";

/**
 * Direct recitation — product path paused.
 * New architecture: acoustic similarity (MFCC+DTW) via /session/audio-lab.
 */

import Link from "next/link";
import { BackButton } from "@/components/layout/back-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DirectSessionPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 pb-16">
      <BackButton href="/dashboard" />
      <h1 className="text-xl font-bold">تسميع مباشر</h1>
      <Card className="border-[#D4AF37]/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">إعادة بناء المحرك الصوتي</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            أُلغي مسار التحويل إلى نص (Whisper و Web Speech) من التسميع. نبني
            الآن مقارنة صوتية محلية (مرجع ↔ تلاوتك) بدون هلوسة حروف.
          </p>
          <p>
            الخطوة الحالية: مختبر أولي قصير على الموبايل للتحقق من MFCC + DTW.
          </p>
          <Link
            href="/session/audio-lab"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] text-base font-bold text-[#020408]"
          >
            افتح مختبر المطابقة الصوتية
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
