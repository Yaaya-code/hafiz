"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Pause,
  Play,
  RotateCcw,
  StickyNote,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  SURAHS,
  getSurah,
  getSurahAyahs,
  getAvailableQaris,
  resolvePlayableQariId,
  ayahAudioUrl,
  searchSurahs,
} from "@/lib/quran";
import { fetchSurahMeanings } from "@/lib/quran/meanings";
import { loadReaderPos, saveReaderPos } from "@/lib/reader-store";
import {
  loadBookmarks,
  toggleAyahBookmark,
  isAyahBookmarked,
  saveNote,
  notesForAyah,
  recordActivity,
} from "@/lib/user-activity";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { cn, formatArabicNumber } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";
import { SurahGuide } from "@/components/quran/surah-guide";
import { PageHeader } from "@/components/layout/back-button";
import {
  playGlobalAudio,
  stopGlobalAudio,
} from "@/lib/audio/global-audio";

/** Digital Mushaf — reading experience (not memorization mode) */
export default function QuranReaderPage() {
  const { profile, ready: profileReady } = useHafizProfile();
  // SSR-safe defaults — never read localStorage on first paint
  const [surahNum, setSurahNum] = useState(1);
  const [ayahNum, setAyahNum] = useState(1);
  const [qariId, setQariId] = useState("alafasy");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const continuousRef = useRef(false);
  const [noteText, setNoteText] = useState("");
  const [bookmarks, setBookmarks] = useState<ReturnType<typeof loadBookmarks>>(
    []
  );
  const [showNote, setShowNote] = useState(false);
  const [ayahNotes, setAyahNotes] = useState<ReturnType<typeof notesForAyah>>(
    []
  );
  const [bookmarked, setBookmarked] = useState(false);
  const [meanings, setMeanings] = useState<Record<number, string>>({});
  const [hydrated, setHydrated] = useState(false);

  // Hydrate position + qari only after mount (avoids SSR mismatch).
  // Preferred qari from profile is applied in the following effect.
  useEffect(() => {
    const pos = loadReaderPos();
    setSurahNum(pos.surahNumber || 1);
    setAyahNum(pos.ayahNumber || 1);
    setQariId(pos.qariId || "alafasy");
    setBookmarks(loadBookmarks());
    setHydrated(true);
  }, []);

  // When profile finishes loading, prefer saved qari if reader pos has default
  useEffect(() => {
    if (!profileReady || !hydrated) return;
    if (profile.preferredQariId) {
      const pos = loadReaderPos();
      if (!pos.qariId || pos.qariId === "alafasy") {
        setQariId(resolvePlayableQariId(profile.preferredQariId));
      }
    }
  }, [profileReady, profile.preferredQariId, hydrated]);

  useEffect(() => {
    let cancelled = false;
    fetchSurahMeanings(surahNum).then((m) => {
      if (!cancelled) setMeanings(m);
    });
    return () => {
      cancelled = true;
    };
  }, [surahNum]);

  useEffect(() => {
    if (!hydrated) return;
    saveReaderPos({
      surahNumber: surahNum,
      ayahNumber: ayahNum,
      qariId,
      updatedAt: new Date().toISOString(),
    });
    const n = notesForAyah(surahNum, ayahNum)[0];
    setNoteText(n?.content || "");
    setAyahNotes(notesForAyah(surahNum, ayahNum));
    setBookmarks(loadBookmarks());
    setBookmarked(isAyahBookmarked(surahNum, ayahNum));
  }, [surahNum, ayahNum, qariId, hydrated]);

  const surah = getSurah(surahNum) || SURAHS[0];
  const ayahs = useMemo(() => getSurahAyahs(surahNum), [surahNum]);
  const current = ayahs.find((a) => a.ayahNumber === ayahNum) || ayahs[0];

  const filteredSurahs = useMemo(() => searchSurahs(query), [query]);

  function stopAudio() {
    continuousRef.current = false;
    setContinuous(false);
    stopGlobalAudio();
    setPlaying(false);
  }

  function playCurrent() {
    if (!current) return;
    continuousRef.current = false;
    setContinuous(false);
    const url = ayahAudioUrl(qariId, surahNum, ayahNum);
    setPlaying(true);
    playGlobalAudio(url, {
      onEnded: () => {
        if (repeat) {
          playCurrent();
          return;
        }
        setPlaying(false);
        if (ayahNum < surah.ayahCount) {
          setAyahNum((a) => a + 1);
        }
      },
      onError: () => setPlaying(false),
    });
  }

  /** Continuous surah playback: onEnded → next ayah auto-play */
  function playSurahContinuous(fromAyah = 1) {
    continuousRef.current = true;
    setContinuous(true);
    const start = Math.max(1, Math.min(surah.ayahCount, fromAyah));

    const playAt = (ayah: number) => {
      if (!continuousRef.current) return;
      setAyahNum(ayah);
      setPlaying(true);
      const url = ayahAudioUrl(qariId, surahNum, ayah);
      playGlobalAudio(url, {
        onEnded: () => {
          if (!continuousRef.current) return;
          if (ayah < surah.ayahCount) {
            playAt(ayah + 1);
          } else {
            continuousRef.current = false;
            setContinuous(false);
            setPlaying(false);
          }
        },
        onError: () => {
          continuousRef.current = false;
          setContinuous(false);
          setPlaying(false);
        },
      });
    };

    playAt(start);
  }

  function goSurah(n: number) {
    stopAudio();
    setSurahNum(n);
    setAyahNum(1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <FadeIn>
        <PageHeader
          title="القرآن"
          description="مصحف رقمي — قراءة واستماع وفهم وإشارات"
          backHref="/dashboard"
          actions={<Badge variant="muted">قراءة وفهم</Badge>}
        />
      </FadeIn>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Surah list */}
        <Card className="lg:col-span-4 max-h-[75vh] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">السور (١١٤)</CardTitle>
            <Input
              placeholder="ابحث عن سورة..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mt-2"
            />
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-1 pe-1">
            {filteredSurahs.map((s) => (
              <button
                key={s.number}
                type="button"
                onClick={() => goSurah(s.number)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm transition-colors",
                  surahNum === s.number
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                <span className="w-7 text-xs text-muted-foreground">
                  {s.number}
                </span>
                <span className="flex-1">{s.nameAr}</span>
                <span className="text-[10px] text-muted-foreground">
                  {s.ayahCount}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Reader */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="border-primary/15">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-lg">
                  {surah.nameAr}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({surah.revelationType === "Meccan" ? "مكية" : "مدنية"} ·{" "}
                    {formatArabicNumber(surah.ayahCount)} آية)
                  </span>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  جزء تقريبي {formatArabicNumber(surah.startJuz)} · صفحات{" "}
                  {formatArabicNumber(surah.startPage)}–
                  {formatArabicNumber(surah.endPage)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={surahNum <= 1}
                  onClick={() => goSurah(surahNum - 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={surahNum >= 114}
                  onClick={() => goSurah(surahNum + 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[42vh] space-y-3 overflow-y-auto rounded-2xl bg-muted/30 p-4">
                {ayahs.map((a) => (
                  <button
                    key={a.ayahNumber}
                    type="button"
                    onClick={() => {
                      stopAudio();
                      setAyahNum(a.ayahNumber);
                    }}
                    className={cn(
                      "block w-full rounded-xl px-3 py-3 text-start transition-colors",
                      a.ayahNumber === ayahNum
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : "hover:bg-background/60"
                    )}
                  >
                    <p className="font-quran text-xl leading-loose md:text-2xl">
                      {a.text}{" "}
                      <span className="text-sm text-muted-foreground">
                        ﴿{formatArabicNumber(a.ayahNumber)}﴾
                      </span>
                    </p>
                    {meanings[a.ayahNumber] && (
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {meanings[a.ayahNumber]}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Audio controls */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex flex-col gap-1 text-xs min-w-[12rem]">
                <span className="text-muted-foreground">القارئ</span>
                <select
                  className="h-9 rounded-xl border bg-background px-2 text-sm"
                  value={qariId}
                  onChange={(e) => setQariId(e.target.value)}
                >
                  {getAvailableQaris().map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="premium"
                  size="sm"
                  onClick={() =>
                    playing && !continuous ? stopAudio() : playCurrent()
                  }
                >
                  {playing && !continuous ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {playing && !continuous ? "إيقاف" : "استمع للآية"}
                </Button>
                <Button
                  variant={continuous ? "premium" : "outline"}
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    if (continuous && playing) {
                      stopAudio();
                      return;
                    }
                    playSurahContinuous(ayahNum || 1);
                  }}
                >
                  {continuous && playing ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {continuous && playing
                    ? "إيقاف المتصل"
                    : "استمع للسورة كاملة"}
                </Button>
                <Button
                  variant={repeat ? "soft" : "outline"}
                  size="sm"
                  onClick={() => setRepeat((r) => !r)}
                >
                  <RotateCcw className="h-4 w-4" />
                  تكرار
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = toggleAyahBookmark(surahNum, ayahNum);
                    setBookmarks(next);
                    setBookmarked(
                      next.some(
                        (b) =>
                          b.type === "ayah" &&
                          b.surahNumber === surahNum &&
                          b.ayahNumber === ayahNum
                      )
                    );
                    recordActivity();
                  }}
                >
                  {bookmarked ? (
                    <BookmarkCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                  إشارة
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNote((s) => !s)}
                >
                  <StickyNote className="h-4 w-4" />
                  ملاحظة
                </Button>
              </div>
            </CardContent>
          </Card>

          {showNote && (
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-sm font-medium">
                  ملاحظة على {surah.nameAr} ﴿{formatArabicNumber(ayahNum)}﴾
                </p>
                <Input
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="اكتب ملاحظتك..."
                />
                <Button
                  size="sm"
                  variant="premium"
                  onClick={() => {
                    saveNote({
                      content: noteText,
                      surahNumber: surahNum,
                      ayahNumber: ayahNum,
                    });
                    setAyahNotes(notesForAyah(surahNum, ayahNum));
                    recordActivity();
                  }}
                >
                  حفظ الملاحظة
                </Button>
                {ayahNotes.length > 0 && (
                  <div className="space-y-1 pt-2">
                    {ayahNotes.map((n) => (
                      <p
                        key={n.id}
                        className="text-xs rounded-lg bg-[#D4AF37]/10 px-2 py-1.5 text-muted-foreground"
                      >
                        📝 {n.content}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {bookmarks.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">إشاراتك</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {bookmarks
                  .filter((b) => b.surahNumber && b.ayahNumber)
                  .slice(0, 12)
                  .map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="rounded-lg border px-2 py-1 text-xs hover:bg-accent"
                      onClick={() => {
                        goSurah(b.surahNumber!);
                        setAyahNum(b.ayahNumber!);
                      }}
                    >
                      {b.label}
                    </button>
                  ))}
              </CardContent>
            </Card>
          )}

          <SurahGuide
            surahNumber={surahNum}
            focusAyah={ayahNum}
            meanings={meanings}
          />
        </div>
      </div>
    </div>
  );
}
