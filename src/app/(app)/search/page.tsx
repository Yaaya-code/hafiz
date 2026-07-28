"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { searchAyahs, SURAHS, QURAN_STATS } from "@/lib/quran";
import { getSurah } from "@/lib/quran/surahs";
import { formatArabicNumber } from "@/lib/utils";
import Link from "next/link";

export default function SearchPage() {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return searchAyahs(q.trim(), 40);
  }, [q]);

  const surahHits = useMemo(() => {
    if (!q.trim()) return [];
    const query = q.trim().toLowerCase();
    return SURAHS.filter(
      (s) =>
        s.nameAr.includes(q.trim()) ||
        s.nameEn.toLowerCase().includes(query) ||
        s.nameTransliteration.toLowerCase().includes(query)
    ).slice(0, 8);
  }, [q]);

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">البحث</h1>
        <p className="text-sm text-muted-foreground">
          ابحث في النص العثماني الكامل ({formatArabicNumber(QURAN_STATS.corpusAyahsLoaded)} آية)
          — كلمة، عبارة، سورة، أو رقم صفحة
        </p>
      </div>
      <div className="relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="ps-10 h-12"
          placeholder="مثال: الرحمن · الصراط · 2:255 · الكهف"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      {surahHits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {surahHits.map((s) => (
            <Link
              key={s.number}
              href={"/quran"}
              className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
              onClick={() => {
                // reader opens at last pos; user can pick surah
              }}
            >
              سورة {s.nameAr}
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {results.map((r) => (
          <Card key={r.surahNumber + ":" + r.ayahNumber}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="muted">
                  {getSurah(r.surahNumber)?.nameAr} ·{" "}
                  {formatArabicNumber(r.ayahNumber)}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  ص {formatArabicNumber(r.page)} · ج {formatArabicNumber(r.juz)}
                </span>
              </div>
              <p className="font-quran text-lg leading-loose">{r.text}</p>
              <div className="flex gap-2 text-xs">
                <Link
                  href={
                    "/session/revision?mode=memorize&surah=" +
                    r.surahNumber +
                    "&from=" +
                    r.ayahNumber +
                    "&to=" +
                    r.ayahNumber
                  }
                  className="text-primary hover:underline"
                >
                  حفظ
                </Link>
                <Link href="/quran" className="text-primary hover:underline">
                  قراءة
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
        {q && results.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            لا نتائج
          </p>
        )}
        {!q && (
          <p className="text-center text-sm text-muted-foreground py-8">
            ابحث في كامل المصحف — {formatArabicNumber(114)} سورة
          </p>
        )}
      </div>
    </div>
  );
}
