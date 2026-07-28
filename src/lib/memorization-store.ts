/**
 * Client-side ayah-level memorization tracking + AI-style suggestions.
 */
import type { AyahProgress, MemorizationStrength } from "@/lib/quran/types";
import {
  STORAGE_KEYS,
  isBrowser,
  safeGetJSON,
  safeSetJSON,
  emitStorageEvent,
} from "@/lib/storage/safe-storage";

const KEY = STORAGE_KEYS.ayahProgress;
const STATS_KEY = STORAGE_KEYS.memStats;

export type MemSessionStats = {
  totalListenSeconds: number;
  totalPracticeSessions: number;
  ayahsMastered: number;
  audioMastered: number;
  lastSessionAt?: string;
  timeline: { date: string; listened: number; practiced: number; mastered: number }[];
};

export function loadAyahProgress(): Record<string, AyahProgress> {
  if (!isBrowser()) return {};
  return safeGetJSON<Record<string, AyahProgress>>(KEY, {});
}

export function saveAyahProgress(map: Record<string, AyahProgress>) {
  if (!isBrowser()) return;
  safeSetJSON(KEY, map);
  emitStorageEvent("hafiz-mem-updated");
}

export function ayahKey(surah: number, ayah: number) {
  return `${surah}:${ayah}`;
}

export function getOrCreate(
  map: Record<string, AyahProgress>,
  surah: number,
  ayah: number
): AyahProgress {
  const k = ayahKey(surah, ayah);
  if (!map[k]) {
    map[k] = {
      surahNumber: surah,
      ayahNumber: ayah,
      listenCount: 0,
      practiceCount: 0,
      successTests: 0,
      failTests: 0,
      confidence: 0,
      status: "NOT_STARTED",
    };
  }
  return map[k];
}

export function recordListen(surah: number, ayah: number) {
  const map = loadAyahProgress();
  const p = getOrCreate(map, surah, ayah);
  p.listenCount += 1;
  p.lastRevisedAt = new Date().toISOString();
  p.confidence = Math.min(1, p.confidence + 0.02);
  saveAyahProgress(map);
  bumpStats({ listened: 1 });
  return p;
}

export function recordPractice(surah: number, ayah: number) {
  const map = loadAyahProgress();
  const p = getOrCreate(map, surah, ayah);
  p.practiceCount += 1;
  p.lastRevisedAt = new Date().toISOString();
  saveAyahProgress(map);
  bumpStats({ practiced: 1 });
  return p;
}

export function recordTest(surah: number, ayah: number, success: boolean) {
  const map = loadAyahProgress();
  const p = getOrCreate(map, surah, ayah);
  if (success) {
    p.successTests += 1;
    p.confidence = Math.min(1, p.confidence + 0.12);
  } else {
    p.failTests += 1;
    p.confidence = Math.max(0, p.confidence - 0.1);
  }
  p.practiceCount += 1;
  p.lastRevisedAt = new Date().toISOString();
  saveAyahProgress(map);
  return p;
}

export function markMastered(surah: number, ayah: number) {
  const map = loadAyahProgress();
  const p = getOrCreate(map, surah, ayah);
  p.status = "MASTERED";
  p.memorizedAt = p.memorizedAt || new Date().toISOString();
  p.attemptsToMaster = p.practiceCount + p.successTests;
  p.confidence = Math.max(p.confidence, 0.9);
  p.lastRevisedAt = new Date().toISOString();
  saveAyahProgress(map);
  bumpStats({ mastered: 1 });
  return p;
}

export function setStrength(
  surah: number,
  ayah: number,
  strength: MemorizationStrength
) {
  const map = loadAyahProgress();
  const p = getOrCreate(map, surah, ayah);
  p.status = strength;
  if (strength === "STRONG") p.confidence = Math.max(p.confidence, 0.85);
  if (strength === "WEAK") p.confidence = Math.min(p.confidence, 0.4);
  saveAyahProgress(map);
  return p;
}

function bumpStats(delta: { listened?: number; practiced?: number; mastered?: number }) {
  const stats = loadMemStats();
  const today = new Date().toISOString().slice(0, 10);
  let row = stats.timeline.find((t) => t.date === today);
  if (!row) {
    row = { date: today, listened: 0, practiced: 0, mastered: 0 };
    stats.timeline.push(row);
  }
  row.listened += delta.listened || 0;
  row.practiced += delta.practiced || 0;
  row.mastered += delta.mastered || 0;
  stats.totalPracticeSessions += delta.practiced || 0;
  stats.ayahsMastered += delta.mastered || 0;
  stats.totalListenSeconds += (delta.listened || 0) * 15; // approx
  stats.lastSessionAt = new Date().toISOString();
  if (isBrowser()) {
    safeSetJSON(STATS_KEY, stats);
  }
}

const emptyMemStats = (): MemSessionStats => ({
  totalListenSeconds: 0,
  totalPracticeSessions: 0,
  ayahsMastered: 0,
  audioMastered: 0,
  timeline: [],
});

export function loadMemStats(): MemSessionStats {
  if (!isBrowser()) return emptyMemStats();
  return {
    ...emptyMemStats(),
    ...safeGetJSON<Partial<MemSessionStats>>(STATS_KEY, {}),
  };
}

export function getAudioMasteryInsights(): {
  surahNumber: number;
  ayahNumber: number;
  listensBeforeMaster: number;
}[] {
  return Object.values(loadAyahProgress())
    .filter((p) => p.learnedViaAudio && (p.listensBeforeMaster || p.listenCount))
    .map((p) => ({
      surahNumber: p.surahNumber,
      ayahNumber: p.ayahNumber,
      listensBeforeMaster: p.listensBeforeMaster || p.listenCount,
    }))
    .slice(0, 8);
}

export function getWeakestAyahs(limit = 5): AyahProgress[] {
  return Object.values(loadAyahProgress())
    .filter((p) => p.listenCount + p.practiceCount > 0)
    .sort((a, b) => a.confidence - b.confidence || b.failTests - a.failTests)
    .slice(0, limit);
}

export function getMostRepeatedAyahs(limit = 5): AyahProgress[] {
  return Object.values(loadAyahProgress())
    .sort((a, b) => b.listenCount + b.practiceCount - (a.listenCount + a.practiceCount))
    .slice(0, limit);
}

export function getRecentlyMastered(limit = 5): AyahProgress[] {
  return Object.values(loadAyahProgress())
    .filter((p) => p.memorizedAt || p.status === "MASTERED")
    .sort(
      (a, b) =>
        new Date(b.memorizedAt || b.lastRevisedAt || 0).getTime() -
        new Date(a.memorizedAt || a.lastRevisedAt || 0).getTime()
    )
    .slice(0, limit);
}

/** Intelligent coaching suggestions */
export function buildCoachInsights(): {
  id: string;
  title: string;
  body: string;
  urgency: "low" | "medium" | "high";
  href: string;
}[] {
  const all = Object.values(loadAyahProgress());
  const insights: {
    id: string;
    title: string;
    body: string;
    urgency: "low" | "medium" | "high";
    href: string;
  }[] = [];

  for (const p of all) {
    if (p.listenCount >= 10 && p.failTests >= 3) {
      insights.push({
        id: `fail-${p.surahNumber}-${p.ayahNumber}`,
        title: "راجع غداً هذه الآية",
        body: `سمعت سورة ${p.surahNumber} آية ${p.ayahNumber} ${p.listenCount} مرة لكن أخفقت في الاختبار ${p.failTests} مرات. أضفها لمراجعة الغد.`,
        urgency: "high",
        href: `/session/revision?mode=memorize&surah=${p.surahNumber}&from=${p.ayahNumber}&to=${p.ayahNumber}`,
      });
    }
    if (p.lastRevisedAt) {
      const days = Math.floor(
        (Date.now() - new Date(p.lastRevisedAt).getTime()) / 86400000
      );
      if (days >= 20 && p.status !== "NOT_STARTED") {
        insights.push({
          id: `old-${p.surahNumber}-${p.ayahNumber}`,
          title: "قد تُنسى قريباً",
          body: `سورة ${p.surahNumber} آية ${p.ayahNumber} لم تُراجع منذ ${days} يوماً — تحتاج انتباهاً.`,
          urgency: "medium",
          href: `/session/revision?surah=${p.surahNumber}&from=${p.ayahNumber}&to=${p.ayahNumber}`,
        });
      }
    }
  }

  const listens = all.reduce((s, p) => s + p.listenCount, 0);
  const practices = all.reduce((s, p) => s + p.practiceCount, 0);
  if (listens > practices * 2 && listens > 5) {
    insights.push({
      id: "style-audio",
      title: "ملفّك التعليمي",
      body: "أسلوبك الأقوى يبدو التكرار السمعي — استمر بالاستماع ثم اختبر نفسك بدون نظر.",
      urgency: "low",
      href: "/listen-memorize",
    });
  } else if (practices > listens && practices > 3) {
    insights.push({
      id: "style-practice",
      title: "ملفّك التعليمي",
      body: "تتعلم أكثر بالممارسة والاختبار — حافظ يقترح اختباراً قصيراً بعد كل استماع.",
      urgency: "low",
      href: "/quiz",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "start",
      title: "ابدأ رحلة الحفظ",
      body: "افتح ورد الحفظ، استمع لآية ٣ مرات، ثم اختبر نفسك.",
      urgency: "medium",
      href: "/plans/new",
    });
  }

  return insights.slice(0, 5);
}
