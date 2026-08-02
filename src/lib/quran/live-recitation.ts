/**
 * Streaming word-level alignment for live Quran recitation.
 * - Interim tokens advance the cursor word-by-word
 * - Green = matched · Red = skipped/wrong · Gold = current
 * - Never waits for ayah/range end to paint status
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
  /** Always true in streaming UI — full range stays visible */
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
   * Streaming alignment (default true):
   * commit skips immediately even on interim so red paints word-by-word.
   */
  streaming?: boolean;
};

/**
 * Align spoken transcript against the expected word stream.
 * Optimized for continuous onInterim updates (no block-wait).
 */
export function matchLive(
  stream: LiveAyahWords[],
  spokenText: string,
  opts: MatchLiveOptions = {}
): LiveMatchResult {
  const streaming = opts.streaming !== false;
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
  let matched = 0;
  let missing = 0;
  let incorrect = 0;
  let extra = 0;
  let repeated = 0;
  let lastMessage: string | undefined;
  let prevSpoken = "";
  let revealMax = -1;

  /** Mark oi..to-1 as skipped (red) and advance */
  function markSkipped(from: number, to: number) {
    for (let k = from; k < to; k++) {
      if (status[k] === "correct") continue;
      status[k] = "incorrect";
      notes[k] = "تم تخطّي «" + flat[k].text + "»";
      incorrect++;
      lastMessage = notes[k];
      revealMax = Math.max(revealMax, k);
    }
  }

  while (si < spoken.length && oi < total) {
    const sWord = spoken[si];
    const exp = flat[oi].norm;

    // Ignore exact ASR duplicates of previous token
    if (sWord === prevSpoken && sWord.length > 1) {
      if (wordsMatch(exp, sWord) || isPartialWord(exp, sWord)) {
        si++;
        continue;
      }
      repeated++;
      si++;
      continue;
    }

    // 1) Exact match → green immediately
    if (wordsMatch(exp, sWord) && !isPartialWord(exp, sWord)) {
      status[oi] = "correct";
      matched++;
      revealMax = Math.max(revealMax, oi);
      prevSpoken = sWord;
      oi++;
      si++;
      continue;
    }

    // 2) Madd / partial elongation of current expected word
    if (isPartialWord(exp, sWord)) {
      status[oi] = "partial";
      prevSpoken = sWord;
      si++;
      continue;
    }

    // 3) Merge ASR fragments into one expected word
    let mergedHit = false;
    for (let take = 2; take <= 5 && si + take - 1 < spoken.length; take++) {
      const merged = spoken.slice(si, si + take).join("");
      if (wordsMatch(exp, merged) && !isPartialWord(exp, merged)) {
        status[oi] = "correct";
        matched++;
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

    // 4) User skipped ahead — look for sWord within next window
    let foundLater = -1;
    const lookAhead = streaming ? 8 : 4;
    for (let k = oi + 1; k < Math.min(total, oi + lookAhead); k++) {
      if (wordsMatch(flat[k].norm, sWord)) {
        foundLater = k;
        break;
      }
      // partial match on a later word (still elongating)
      if (isPartialWord(flat[k].norm, sWord)) {
        foundLater = k;
        break;
      }
    }

    if (foundLater > oi) {
      // STREAMING: commit skips immediately (even on interim last token)
      const commitSkip =
        streaming || !interim || si < spoken.length - 1;
      if (commitSkip) {
        markSkipped(oi, foundLater);
        if (wordsMatch(flat[foundLater].norm, sWord)) {
          status[foundLater] = "correct";
          matched++;
          revealMax = Math.max(revealMax, foundLater);
          oi = foundLater + 1;
        } else {
          // partial on later word
          status[foundLater] = "partial";
          oi = foundLater;
        }
        prevSpoken = sWord;
        si++;
        continue;
      }
    }

    // 5) Extra spoken noise before the expected word
    let foundSpoken = -1;
    for (let k = si + 1; k < Math.min(spoken.length, si + 4); k++) {
      if (wordsMatch(exp, spoken[k])) {
        foundSpoken = k;
        break;
      }
    }
    if (foundSpoken > si) {
      const between = spoken
        .slice(si, foundSpoken)
        .filter((w) => isMeaningfulSpokenToken(w));
      if (between.length > 0) {
        extra += between.length;
      }
      si = foundSpoken;
      continue;
    }

    // 6) Last interim token not matching — mark as current cursor (gold)
    if (interim && si === spoken.length - 1 && streaming) {
      // If it clearly doesn't match and isn't partial, still show cursor
      status[oi] = "current";
      prevSpoken = sWord;
      si++;
      continue;
    }

    // 7) Confirmed wrong word at cursor
    // On pure interim single last token without streaming skip, stay soft
    if (interim && !streaming && si === spoken.length - 1) {
      status[oi] = "current";
      prevSpoken = sWord;
      si++;
      continue;
    }

    status[oi] = "incorrect";
    notes[oi] =
      "المتوقع «" + flat[oi].text + "» · سمعت «" + sWord + "»";
    incorrect++;
    lastMessage = notes[oi];
    revealMax = Math.max(revealMax, oi);
    prevSpoken = sWord;
    oi++;
    si++;
  }

  // Trailing extras after full match
  if (oi >= total && si < spoken.length) {
    const trailing = spoken.slice(si).filter((w) => isMeaningfulSpokenToken(w));
    extra += trailing.length;
  }

  // Cursor highlight on first pending word
  if (oi < total && status[oi] === "pending") {
    status[oi] = "current";
  }

  const display: LiveDisplayWord[] = flat.map((w, i) => {
    const st = status[i];
    return {
      text: w.text,
      ayahNumber: w.ayahNumber,
      globalIndex: i,
      status: st,
      // Full range always visible (streaming UX)
      revealed: true,
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
    if (words.some((w) => w.status !== "pending" && w.status !== "hidden")) {
      revealedUpToAyah = a.ayahNumber;
      currentAyah = a.ayahNumber;
    }
    if (
      words.length &&
      words.every((w) => w.status === "correct")
    ) {
      lastCompletedAyah = a.ayahNumber;
    }
  }
  if (oi < total) {
    currentAyah = flat[oi].ayahNumber;
  } else if (flat.length) {
    currentAyah = flat[flat.length - 1].ayahNumber;
    revealedUpToAyah = Math.max(revealedUpToAyah, currentAyah);
  }

  let confirmedMax = -1;
  for (let i = 0; i < display.length; i++) {
    if (
      display[i].status === "correct" ||
      display[i].status === "incorrect" ||
      display[i].status === "missing"
    ) {
      confirmedMax = i;
    }
  }
  revealMax = confirmedMax;

  const correctCount = display.filter((w) => w.status === "correct").length;
  const errorCount = display.filter(
    (w) => w.status === "incorrect" || w.status === "missing"
  ).length;
  const judgedPositions = correctCount + errorCount;
  const accuracy =
    judgedPositions === 0 ? 0 : correctCount / Math.max(1, judgedPositions);

  const allTargetMatched =
    total > 0 && correctCount === total && errorCount === 0;
  let finalExtra = extra;
  let finalMsg = lastMessage;
  if (allTargetMatched || accuracy >= 0.999) {
    finalExtra = 0;
    if (
      finalMsg &&
      (finalMsg.includes("زائدة") || finalMsg.includes("تخط"))
    ) {
      finalMsg = undefined;
    }
  }

  return {
    display,
    stats: {
      matched: correctCount,
      missing,
      incorrect: errorCount,
      extra: finalExtra,
      repeated,
      total,
      accuracy: allTargetMatched ? 1 : accuracy,
      lastMessage: finalMsg,
    },
    revealedUpToAyah,
    lastCompletedAyah,
    currentAyah,
    revealedWordIndex: revealMax,
    cursor: oi,
  };
}

function isMeaningfulSpokenToken(w: string): boolean {
  const t = (w || "").trim();
  if (!t) return false;
  if (t.length <= 1) return false;
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
  const extra =
    pct >= 100 || (stats.matched === stats.total && stats.missing === 0)
      ? 0
      : stats.extra;
  const lines = [
    "تقرير التلاوة",
    "────────────",
    "الدقة: " + pct + "%",
    "كلمات صحيحة: " + stats.matched + " / " + stats.total,
    "غير مطابقة / متجاوزة: " + stats.incorrect,
    "",
    lastCompletedAyah > 0
      ? "أكملت حتى الآية " + lastCompletedAyah + " من " + totalAyahs + "."
      : "لم تُكمل آية بالكامل بعد.",
    next <= totalAyahs
      ? "المتبقي: الآيات " + next + "–" + totalAyahs + "."
      : "أحسنت — أنهيت النطاق.",
    "",
  ];
  if (extra > 0) {
    lines.push("كلمات زائدة محتملة: " + extra);
  }
  if (pct >= 95 && stats.incorrect === 0 && extra === 0) {
    lines.push("طلاقة ممتازة. المدود لم تُحسب فواصل كلمات.");
  } else if (pct >= 80) {
    lines.push("أداء جيد. راجع الكلمات الحمراء فقط.");
  } else {
    lines.push("أعد من موضع التوقف ببطء.");
  }
  return lines.join("\n");
}
