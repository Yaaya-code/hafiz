/**
 * Word-level live alignment for Quran recitation.
 *
 * modes:
 * - streaming (default false for skips): can mark skipped words red when user jumps ahead
 * - strict: NEVER advance past current word unless high-confidence match / partial madd
 */

import {
  cleanTranscriptForQuran,
  isPartialWord,
  quranNormalize,
  quranTokenize,
  wordsMatch,
} from "./quran-phonetic";

export type LiveAyahWords = {
  surahNumber: number;
  ayahNumber: number;
  displayWords: string[];
  normWords: string[];
};

export type LiveStatus =
  | "pending"
  | "correct"
  | "missing"
  | "incorrect"
  | "current"
  | "partial"
  | "hidden";

export type LiveDisplayWord = {
  text: string;
  ayahNumber: number;
  globalIndex: number;
  status: LiveStatus;
  revealed: boolean;
  note?: string;
};

export type LiveMatchResult = {
  display: LiveDisplayWord[];
  stats: {
    matched: number;
    missing: number;
    incorrect: number;
    extra: number;
    repeated: number;
    total: number;
    accuracy: number;
    lastMessage?: string;
  };
  revealedUpToAyah: number;
  lastCompletedAyah: number;
  currentAyah: number;
  revealedWordIndex: number;
  cursor: number;
};

export function buildLiveWordStream(
  ayahs: { surahNumber: number; ayahNumber: number; text: string }[]
): LiveAyahWords[] {
  return ayahs.map((a) => {
    const displayWords = a.text.split(/\s+/).filter(Boolean);
    return {
      surahNumber: a.surahNumber,
      ayahNumber: a.ayahNumber,
      displayWords,
      normWords: displayWords.map(quranNormalize),
    };
  });
}

export type MatchLiveOptions = {
  interim?: boolean;
  /**
   * When true (and not strict): allow marking skipped words red if user jumps ahead.
   * Default false for safety; talqeen/direct pass explicitly.
   */
  streaming?: boolean;
  /**
   * Strict mode: never jump to a later word. Only advance on high-confidence
   * match of the CURRENT expected word (or madd partial of it).
   */
  strict?: boolean;
};

/**
 * High-confidence full match (stricter than wordsMatch for final commit).
 */
export function wordsMatchStrict(expected: string, spoken: string): boolean {
  const e = quranNormalize(expected);
  const s = quranNormalize(spoken);
  if (!e || !s) return false;
  if (e === s) return true;
  // Drop alifs (madd) only if both collapse to same skeleton ≥ 3 chars
  const e2 = e.replace(/ا/g, "");
  const s2 = s.replace(/ا/g, "");
  if (e2.length >= 3 && e2 === s2) return true;
  // Very tight fuzzy: max 1 edit for short, 15% for longer
  if (e.length <= 2) return e === s;
  const maxLen = Math.max(e.length, s.length);
  const dist = (() => {
    // reuse wordsMatch only when clearly close
    return wordsMatch(e, s);
  })();
  if (!dist) return false;
  // wordsMatch already true — require length ratio not too wild
  if (Math.abs(e.length - s.length) > Math.max(2, Math.floor(e.length * 0.25))) {
    return false;
  }
  return true;
}

export function matchLive(
  stream: LiveAyahWords[],
  spokenText: string,
  opts: MatchLiveOptions = {}
): LiveMatchResult {
  const strict = opts.strict === true;
  const streaming = !strict && opts.streaming === true;
  const interim = opts.interim === true;

  const flat: { text: string; norm: string; ayahNumber: number }[] = [];
  for (const a of stream) {
    for (let i = 0; i < a.displayWords.length; i++) {
      flat.push({
        text: a.displayWords[i],
        norm: a.normWords[i],
        ayahNumber: a.ayahNumber,
      });
    }
  }

  const expectedNorms = flat.map((f) => f.norm);
  const cleaned = cleanTranscriptForQuran(spokenText, expectedNorms);
  let spoken = quranTokenize(cleaned);
  if (!spoken.length) spoken = quranTokenize(spokenText);

  const total = flat.length;
  const status: LiveStatus[] = Array(total).fill("pending");
  const notes: (string | undefined)[] = Array(total).fill(undefined);

  let oi = 0;
  let si = 0;
  let extra = 0;
  let repeated = 0;
  let lastMessage: string | undefined;
  let prevSpoken = "";
  let revealMax = -1;

  function markSkipped(from: number, to: number) {
    for (let k = from; k < to; k++) {
      if (status[k] === "correct") continue;
      status[k] = "incorrect";
      notes[k] = "تم تخطّي «" + flat[k].text + "»";
      lastMessage = notes[k];
      revealMax = Math.max(revealMax, k);
    }
  }

  while (si < spoken.length && oi < total) {
    const sWord = spoken[si];
    const exp = flat[oi].norm;

    if (sWord === prevSpoken && sWord.length > 1) {
      if (wordsMatchStrict(exp, sWord) || isPartialWord(exp, sWord)) {
        si++;
        continue;
      }
      repeated++;
      si++;
      continue;
    }

    // 1) High-confidence match of CURRENT word only
    if (wordsMatchStrict(exp, sWord) && !isPartialWord(exp, sWord)) {
      status[oi] = "correct";
      revealMax = Math.max(revealMax, oi);
      prevSpoken = sWord;
      oi++;
      si++;
      continue;
    }

    // 2) Madd / partial of CURRENT word only
    if (isPartialWord(exp, sWord)) {
      status[oi] = "partial";
      prevSpoken = sWord;
      si++;
      continue;
    }

    // 3) Merge fragments for CURRENT expected word
    let mergedHit = false;
    for (let take = 2; take <= 5 && si + take - 1 < spoken.length; take++) {
      const merged = spoken.slice(si, si + take).join("");
      if (wordsMatchStrict(exp, merged) && !isPartialWord(exp, merged)) {
        status[oi] = "correct";
        revealMax = Math.max(revealMax, oi);
        prevSpoken = merged;
        oi++;
        si += take;
        mergedHit = true;
        break;
      }
      if (isPartialWord(exp, merged)) {
        status[oi] = "partial";
        prevSpoken = merged;
        si += take;
        mergedHit = true;
        break;
      }
    }
    if (mergedHit) continue;

    // 4) STRICT: never look ahead — discard noise token, stay on current
    if (strict) {
      // Soft: ignore unmatched interim tokens without advancing expected cursor
      if (interim && si === spoken.length - 1) {
        status[oi] = "current";
        prevSpoken = sWord;
        si++;
        continue;
      }
      // Non-interim unmatched: count as extra noise, stay on word
      if (isMeaningfulSpokenToken(sWord)) {
        extra++;
      }
      prevSpoken = sWord;
      si++;
      continue;
    }

    // 5) Non-strict streaming: optional skip-ahead
    let foundLater = -1;
    if (streaming) {
      for (let k = oi + 1; k < Math.min(total, oi + 6); k++) {
        if (wordsMatchStrict(flat[k].norm, sWord)) {
          foundLater = k;
          break;
        }
      }
    }

    if (foundLater > oi) {
      const commitSkip = !interim || si < spoken.length - 1;
      if (commitSkip) {
        markSkipped(oi, foundLater);
        status[foundLater] = "correct";
        revealMax = Math.max(revealMax, foundLater);
        oi = foundLater + 1;
        prevSpoken = sWord;
        si++;
        continue;
      }
    }

    // 6) Extra spoken before expected
    let foundSpoken = -1;
    for (let k = si + 1; k < Math.min(spoken.length, si + 3); k++) {
      if (wordsMatchStrict(exp, spoken[k])) {
        foundSpoken = k;
        break;
      }
    }
    if (foundSpoken > si) {
      extra += spoken
        .slice(si, foundSpoken)
        .filter((w) => isMeaningfulSpokenToken(w)).length;
      si = foundSpoken;
      continue;
    }

    if (interim && si === spoken.length - 1) {
      status[oi] = "current";
      prevSpoken = sWord;
      si++;
      continue;
    }

    // Soft incorrect on current only (no jump)
    status[oi] = "incorrect";
    notes[oi] =
      "المتوقع «" + flat[oi].text + "» · سمعت «" + sWord + "»";
    lastMessage = notes[oi];
    revealMax = Math.max(revealMax, oi);
    prevSpoken = sWord;
    oi++;
    si++;
  }

  if (oi >= total && si < spoken.length) {
    extra += spoken.slice(si).filter((w) => isMeaningfulSpokenToken(w)).length;
  }

  if (oi < total && status[oi] === "pending") {
    status[oi] = "current";
  }

  const display: LiveDisplayWord[] = flat.map((w, i) => {
    const st = status[i];
    const confirmed =
      st === "correct" || st === "missing" || st === "incorrect";
    return {
      text: w.text,
      ayahNumber: w.ayahNumber,
      globalIndex: i,
      status: st,
      revealed: confirmed,
      note: notes[i],
    };
  });

  let lastCompletedAyah = 0;
  let revealedUpToAyah = stream[0]?.ayahNumber || 1;
  let currentAyah = stream[0]?.ayahNumber || 1;

  const byAyah = new Map<number, LiveDisplayWord[]>();
  for (const w of display) {
    if (!byAyah.has(w.ayahNumber)) byAyah.set(w.ayahNumber, []);
    byAyah.get(w.ayahNumber)!.push(w);
  }

  for (const a of stream) {
    const words = byAyah.get(a.ayahNumber) || [];
    if (words.some((w) => w.revealed || w.status === "current" || w.status === "partial")) {
      revealedUpToAyah = a.ayahNumber;
      currentAyah = a.ayahNumber;
    }
    if (words.length && words.every((w) => w.status === "correct")) {
      lastCompletedAyah = a.ayahNumber;
    }
  }
  if (oi < total) currentAyah = flat[oi].ayahNumber;
  else if (flat.length) {
    currentAyah = flat[flat.length - 1].ayahNumber;
    revealedUpToAyah = Math.max(revealedUpToAyah, currentAyah);
  }

  let confirmedMax = -1;
  for (let i = 0; i < display.length; i++) {
    if (display[i].revealed) confirmedMax = i;
  }

  const correctCount = display.filter((w) => w.status === "correct").length;
  const errorCount = display.filter(
    (w) => w.status === "incorrect" || w.status === "missing"
  ).length;
  const judged = correctCount + errorCount;
  const accuracy = judged === 0 ? 0 : correctCount / Math.max(1, judged);
  const allOk = total > 0 && correctCount === total && errorCount === 0;

  return {
    display,
    stats: {
      matched: correctCount,
      missing: 0,
      incorrect: errorCount,
      extra: allOk ? 0 : extra,
      repeated,
      total,
      accuracy: allOk ? 1 : accuracy,
      lastMessage: allOk ? undefined : lastMessage,
    },
    revealedUpToAyah,
    lastCompletedAyah,
    currentAyah,
    revealedWordIndex: confirmedMax,
    cursor: oi,
  };
}

function isMeaningfulSpokenToken(w: string): boolean {
  const t = (w || "").trim();
  if (!t || t.length <= 1) return false;
  if (/^[.…,،؟?\-–—_]+$/.test(t)) return false;
  return true;
}

export function finalFeedbackAr(
  stats: LiveMatchResult["stats"],
  lastCompletedAyah: number,
  totalAyahs: number
): string {
  const pct = Math.round(stats.accuracy * 100);
  const next = lastCompletedAyah > 0 ? lastCompletedAyah + 1 : 1;
  const lines = [
    "تقرير التلاوة",
    "────────────",
    "الدقة: " + pct + "%",
    "كلمات صحيحة: " + stats.matched + " / " + stats.total,
    "غير مطابقة: " + stats.incorrect,
    "",
    lastCompletedAyah > 0
      ? "أكملت حتى الآية " + lastCompletedAyah + " من " + totalAyahs + "."
      : "لم تُكمل آية بالكامل بعد.",
    next <= totalAyahs
      ? "المتبقي: الآيات " + next + "–" + totalAyahs + "."
      : "أحسنت — أنهيت النطاق.",
  ];
  if (pct >= 95 && stats.incorrect === 0) {
    lines.push("", "طلاقة ممتازة.");
  } else if (pct >= 80) {
    lines.push("", "أداء جيد — راجع الكلمات الحمراء.");
  } else {
    lines.push("", "أعد من موضع التوقف ببطء.");
  }
  return lines.join("\n");
}
