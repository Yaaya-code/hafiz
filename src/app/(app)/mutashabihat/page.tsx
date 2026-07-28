"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Sparkles, BookOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  filterMutashabihat,
  MUTASHABIHAT_BY_SURAH,
  MUTASHABIHAT_STATS,
  SIMILARITY_TYPE_LABELS,
} from "@/lib/quran";
import { SURAHS } from "@/lib/quran/surahs";
import {
  extractSimilarPhrases,
  highlightMutashabihAyahs,
} from "@/lib/quran/mutashabihat-highlight";
import {
  HighlightedAyah,
  HighlightLegend,
} from "@/components/quran/highlighted-ayah";
import { formatArabicNumber, cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/back-button";

export default function MutashabihatPage() {
  const [query, setQuery] = useState("");
  const [surah, setSurah] = useState<number | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const surahsWithCounts = useMemo(
    () =>
      SURAHS.map((s) => ({
        ...s,
        count: MUTASHABIHAT_BY_SURAH[s.number] || 0,
      })),
    []
  );

  const filteredSurahs = useMemo(() => {
    const q = query.trim();
    if (!q) return surahsWithCounts;
    return surahsWithCounts.filter(
      (s) =>
        s.nameAr.includes(q) ||
        s.nameEn.toLowerCase().includes(q.toLowerCase()) ||
        String(s.number) === q ||
        s.nameTransliteration.toLowerCase().includes(q.toLowerCase())
    );
  }, [query, surahsWithCounts]);

  /** Groups for the selected surah only */
  const groups = useMemo(() => {
    if (!surah) return [];
    return filterMutashabihat({ surah });
  }, [surah]);

  const selected =
    groups.find((g) => g.id === selectedId) ?? groups[0] ?? null;

  const highlightedTokens = useMemo(() => {
    if (!selected?.ayahs?.length) return [];
    return highlightMutashabihAyahs(selected.ayahs.map((a) => a.text));
  }, [selected]);

  const similarPhrases = useMemo(() => {
    if (!selected?.ayahs?.length) return [];
    return extractSimilarPhrases(selected.ayahs.map((a) => a.text));
  }, [selected]);

  const activeSurah = surah
    ? surahsWithCounts.find((s) => s.number === surah)
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-primary" />
            المتشابهات حسب السورة
          </h1>
        }
        description={
          <>
            {formatArabicNumber(MUTASHABIHAT_STATS.total)} متشابه ·{" "}
            {formatArabicNumber(MUTASHABIHAT_STATS.surahsCovered)} سورة · ظلل
            الجملة المشتركة فقط
          </>
        }
        backHref="/dashboard"
        actions={
          <Link
            href="/mutashabihat/practice"
            className="inline-flex h-10 items-center rounded-xl bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] px-4 text-sm font-medium text-white"
          >
            تدريب / اختبار
          </Link>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="ps-10"
          placeholder="ابحث عن سورة..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT: surahs only */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              السور
            </CardTitle>
            <CardDescription>
              {formatArabicNumber(filteredSurahs.length)} سورة · اختر سورة لعرض
              متشابهاتها
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-1 overflow-y-auto">
            {filteredSurahs.map((s) => (
              <button
                key={s.number}
                type="button"
                onClick={() => {
                  setSurah(s.number);
                  setSelectedId(null);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start transition-colors",
                  surah === s.number
                    ? "border-primary bg-primary/10"
                    : "hover:bg-accent",
                  s.count === 0 && "opacity-60"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-medium">
                    {formatArabicNumber(s.number)}
                  </span>
                  <span className="text-sm font-semibold">{s.nameAr}</span>
                </span>
                <Badge
                  variant={s.count > 0 ? "success" : "muted"}
                  className="text-[10px] shrink-0"
                >
                  {formatArabicNumber(s.count)}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* RIGHT: mutashabihat for selected surah */}
        <div className="lg:col-span-2 space-y-4">
          {!surah && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-base font-medium">اختر سورة من القائمة</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  هتظهر كل المتشابهات المرتبطة بالسورة، مع تظليل الجملة
                  المتشابهة بالظبط
                </p>
              </CardContent>
            </Card>
          )}

          {surah && activeSurah && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    سورة {activeSurah.nameAr}
                  </CardTitle>
                  <CardDescription>
                    {formatArabicNumber(groups.length)} موضع متشابه مرتبط بهذه
                    السورة
                  </CardDescription>
                </CardHeader>
                {groups.length === 0 ? (
                  <CardContent className="text-sm text-muted-foreground">
                    لا توجد متشابهات مسجّلة لهذه السورة حالياً.
                  </CardContent>
                ) : (
                  <CardContent className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {groups.map((g, idx) => {
                      // Title focused on the OTHER positions (not just "surah:ayah / surah:ayah")
                      const others = g.ayahs.filter(
                        (a) => a.surahNumber !== surah
                      );
                      const local = g.ayahs.filter(
                        (a) => a.surahNumber === surah
                      );
                      const label =
                        local.length > 0
                          ? `آية ${local.map((a) => formatArabicNumber(a.ayahNumber)).join("، ")}` +
                            (others.length
                              ? ` ← ${others
                                  .slice(0, 2)
                                  .map(
                                    (a) =>
                                      a.surahName +
                                      " " +
                                      formatArabicNumber(a.ayahNumber)
                                  )
                                  .join(" · ")}`
                              : "")
                          : g.title;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setSelectedId(g.id)}
                          className={cn(
                            "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                            (selected?.id === g.id ||
                              (!selectedId && idx === 0))
                              ? "border-primary bg-primary/10 font-medium text-primary"
                              : "hover:bg-accent"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </CardContent>
                )}
              </Card>

              {selected && (
                <>
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">
                          مقارنة المواضع
                        </CardTitle>
                        <Badge variant="muted" className="text-[10px]">
                          {SIMILARITY_TYPE_LABELS[selected.type]}
                        </Badge>
                      </div>
                      <HighlightLegend className="mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selected.ayahs.map((a, i) => (
                        <div
                          key={a.surahNumber + "-" + a.ayahNumber + "-" + i}
                          className={cn(
                            "rounded-2xl border p-5",
                            a.surahNumber === surah
                              ? "border-primary/40 bg-primary/5"
                              : "bg-muted/20"
                          )}
                        >
                          <Badge
                            variant={
                              a.surahNumber === surah ? "default" : "success"
                            }
                            className="mb-3"
                          >
                            {a.surahName} · آية{" "}
                            {formatArabicNumber(a.ayahNumber)}
                            {a.surahNumber === surah ? " · من السورة" : ""}
                          </Badge>
                          <HighlightedAyah
                            tokens={
                              highlightedTokens[i] ?? [
                                {
                                  text: a.text,
                                  mark: "neutral",
                                  isSpace: false,
                                },
                              ]
                            }
                          />
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {similarPhrases.length > 0 && (
                    <Card className="border-[#D4AF37]/25 bg-[#D4AF37]/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          الجملة المتشابهة
                        </CardTitle>
                        <CardDescription>
                          العبارة المشتركة بالظبط بين المواضع
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        {similarPhrases.map((p) => (
                          <span
                            key={p}
                            className="rounded-lg bg-[#D4AF37]/80/45 px-3 py-1.5 font-quran text-sm font-semibold ring-1 ring-[#D4AF37]/30"
                          >
                            {p}
                          </span>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {(selected.differenceExplain || selected.tips?.length > 0) && (
                    <Card className="border-[#D4AF37]/20 bg-[#D4AF37]/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">ضابط / ملاحظة</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                        {selected.differenceExplain && (
                          <p>{selected.differenceExplain}</p>
                        )}
                        {selected.tips?.slice(0, 2).map((tip) => (
                          <p key={tip}>• {tip}</p>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
