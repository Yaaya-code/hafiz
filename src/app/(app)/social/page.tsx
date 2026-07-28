"use client";

import { Trophy, Users, Swords, Share2, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion/fade-in";
import { formatArabicNumber } from "@/lib/utils";

const friends = [
  { name: "يوسف العتيبي", score: 820, streak: 21 },
  { name: "خالد الشمري", score: 910, streak: 45 },
  { name: "عمر الحربي", score: 690, streak: 7 },
  { name: "فهد الدوسري", score: 755, streak: 14 },
];

const leaderboard = [
  { rank: 1, name: "خالد الشمري", score: 910 },
  { rank: 2, name: "نورة الأحمد", score: 888 },
  { rank: 3, name: "يوسف العتيبي", score: 820 },
  { rank: 4, name: "أحمد بن محمد", score: 748, you: true },
  { rank: 5, name: "فهد الدوسري", score: 755 },
].sort((a, b) => b.score - a.score);

const challenges = [
  {
    title: "تحدي السلسلة ٧ أيام",
    progress: 4,
    target: 7,
    ends: "ينتهي بعد ٣ أيام",
  },
  {
    title: "٥٠ صفحة مراجعة هذا الأسبوع",
    progress: 32,
    target: 50,
    ends: "ينتهي الأحد",
  },
];

export default function SocialPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <FadeIn>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">المجتمع</h1>
            <p className="text-sm text-muted-foreground">
              أصدقاء · تحديات · لوحة المتصدرين — مع تحكم كامل بالخصوصية
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Lock className="h-4 w-4" />
              الخصوصية
            </Button>
            <Button variant="premium" size="sm">
              <Users className="h-4 w-4" />
              دعوة صديق
            </Button>
          </div>
        </div>
      </FadeIn>

      <Stagger className="grid gap-6 lg:grid-cols-3">
        <StaggerItem className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Swords className="h-4 w-4 text-primary" />
                تحديات ودّية
              </CardTitle>
              <CardDescription>تنافس بلطف — الهدف الإتقان لا الأنا</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {challenges.map((c) => (
                <div key={c.title} className="rounded-2xl border border-border/60 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{c.title}</p>
                    <Badge variant="muted">{c.ends}</Badge>
                  </div>
                  <Progress
                    className="mt-3"
                    value={(c.progress / c.target) * 100}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatArabicNumber(c.progress)} / {formatArabicNumber(c.target)}
                  </p>
                </div>
              ))}
              <Button variant="soft" className="w-full">
                إنشاء تحدٍ جديد
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                الأصدقاء
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {friends.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-3 rounded-xl border border-border/50 p-3"
                >
                  <Avatar name={f.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatArabicNumber(f.score)} · 🔥 {formatArabicNumber(f.streak)}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost">
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="border-[#D4AF37]/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-[#D4AF37]" />
                لوحة المتصدرين
              </CardTitle>
              <CardDescription>حلقة خاصة · أسبوعي</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {leaderboard.map((row, i) => (
                <div
                  key={row.name}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                    "you" in row && row.you
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-muted/30"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                      i === 0
                        ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                        : i === 1
                          ? "bg-slate-300/30 text-slate-500"
                          : i === 2
                            ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {formatArabicNumber(i + 1)}
                  </span>
                  <span className="flex-1 font-medium">{row.name}</span>
                  <span className="font-semibold text-primary">
                    {formatArabicNumber(row.score)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="space-y-2 p-4 text-xs text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground">الخصوصية</p>
              <p>• يمكنك إخفاء درجتك عن العامة</p>
              <p>• المجموعات خاصة بدعوة فقط</p>
              <p>• مشاركة الإنجازات اختيارية</p>
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
