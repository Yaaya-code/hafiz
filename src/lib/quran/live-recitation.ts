/**
 * Word-level progressive matching for Quran recitation.
 * - Only mark words after completion (Madd-safe)
 * - Tracks reveal cursor for word-by-word display
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
  /** Word-level reveal: show only if user reached this word */
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
  /** Inclusive global index of last revealed word */
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

export type MatchLiveOptions = { interim?: boolean };

export function matchLive(
  stream: LiveAyahWords[],
  spokenText: string,
  opts: MatchLiveOptions = {}
): LiveMatchResult {
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
  /** Furthest index user has "touched" (for reveal) */
  let revealMax = -1;

  while (si < spoken.length && oi < total) {
    const sWord = spoken[si];
    const exp = flat[oi].norm;

    if (sWord === prevSpoken && sWord.length > 1) {
      if (wordsMatch(exp, sWord) || isPartialWord(exp, sWord)) {
        si++;
        continue;
      }
      repeated++;
      si++;
      continue;
    }

    // Complete match only — confirmed spoken word
    if (wordsMatch(exp, sWord) && !isPartialWord(exp, sWord)) {
      status[oi] = "correct";
      matched++;
      revealMax = Math.max(revealMax, oi); // only confirm after full match
      prevSpoken = sWord;
      oi++;
      si++;
      continue;
    }

    // Madd / incomplete — wait. Do NOT reveal the expected word yet.
    if (isPartialWord(exp, sWord)) {
      status[oi] = "partial"; // internal only — not revealed
      notes[oi] = undefined;
      lastMessage = undefined;
      prevSpoken = sWord;
      si++;
      continue;
    }

    // Merge fragments (يتساء + لون) → one confirmed word
    let mergedHit = false;
    for (let take = 2; take <= 6 && si + take - 1 < spoken.length; take++) {
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
        // still elongating — no reveal
        status[oi] = "partial";
        prevSpoken = merged;
        si += take;
        mergedHit = true;
        break;
      }
    }
    if (mergedHit) continue;

    let foundLater = -1;
    for (let k = oi + 1; k < Math.min(total, oi + 4); k++) {
      if (wordsMatch(flat[k].norm, sWord)) {
        foundLater = k;
        break;
      }
    }
    if (foundLater > oi) {
      // Only commit skip when speech is finalized enough
      const commitSkip = !opts.interim || si < spoken.length - 1;
      if (commitSkip) {
        for (let k = oi; k < foundLater; k++) {
          status[k] = "missing";
          notes[k] = "كلمة ناقصة: «" + flat[k].text + "»";
          missing++;
          lastMessage = notes[k];
          // reveal missing as teacher correction (confirmed miss)
          revealMax = Math.max(revealMax, k);
        }
        status[foundLater] = "correct";
        matched++;
        revealMax = Math.max(revealMax, foundLater);
        oi = foundLater + 1;
        prevSpoken = sWord;
        si++;
        continue;
      }
    }

    let foundSpoken = -1;
    for (let k = si + 1; k < Math.min(spoken.length, si + 4); k++) {
      if (wordsMatch(exp, spoken[k])) {
        foundSpoken = k;
        break;
      }
    }
    if (foundSpoken > si) {
      // Count only meaningful intervening tokens (ignore ASR noise/silence crumbs)
      const between = spoken
        .slice(si, foundSpoken)
        .filter((w) => isMeaningfulSpokenToken(w));
      if (between.length > 0) {
        extra += between.length;
        if (!opts.interim || si < spoken.length - 1) {
          lastMessage = "كلمة زائدة أثناء التلاوة";
        }
      }
      si = foundSpoken;
      continue;
    }

    // Last interim token — listening only, do not reveal expected word
    if (opts.interim && si === spoken.length - 1) {
      status[oi] = "current"; // internal cursor, NOT revealed
      prevSpoken = sWord;
      si++;
      continue;
    }

    // Confirmed wrong word — reveal correction
    status[oi] = "incorrect";
    notes[oi] = "المتوقع «" + flat[oi].text + "» · سمعت «" + sWord + "»";
    incorrect++;
    lastMessage = notes[oi];
    revealMax = Math.max(revealMax, oi);
    prevSpoken = sWord;
    oi++;
    si++;
  }

  // Trailing spoken tokens after full target match — only count real extras
  // when they look like actual words (filter ASR silence/noise tokens)
  if (oi >= total && si < spoken.length) {
    const trailing = spoken.slice(si).filter((w) => isMeaningfulSpokenToken(w));
    extra += trailing.length;
  }

  /**
   * CONFIRMED speech only:
   * reveal = correct | missing | incorrect
   * Never partial/current/pending (those are predictions / in-progress)
   */
  const display: LiveDisplayWord[] = flat.map((w, i) => {
    const st = status[i];
    const confirmed =
      st === "correct" || st === "missing" || st === "incorrect";
    return {
      text: w.text,
      ayahNumber: w.ayahNumber,
      globalIndex: i,
      status: confirmed ? st : st === "partial" || st === "current" ? st : "hidden",
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
    const anyRevealed = words.some((w) => w.revealed);
    if (anyRevealed) {
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
  // Current position for tracking (not for display prediction)
  if (oi < total) {
    currentAyah = flat[oi].ayahNumber;
  } else if (flat.length) {
    currentAyah = flat[flat.length - 1].ayahNumber;
    revealedUpToAyah = Math.max(revealedUpToAyah, currentAyah);
  }
  // revealedWordIndex = last confirmed only
  let confirmedMax = -1;
  for (let i = 0; i < display.length; i++) {
    if (display[i].revealed) confirmedMax = i;
  }
  revealMax = confirmedMax;

  const judged = matched + missing + incorrect;
  let accuracy = judged === 0 ? 0 : matched / Math.max(1, judged);

  // Perfect / complete match: clear false "extra word" noise from ASR silence tokens
  const allTargetMatched =
    total > 0 && matched === total && missing === 0 && incorrect === 0;
  if (allTargetMatched || accuracy >= 0.999) {
    extra = 0;
    accuracy = 1;
    if (
      lastMessage &&
      (lastMessage.includes("زائدة") || lastMessage.includes("زائد"))
    ) {
      lastMessage = undefined;
    }
  }

  // Only keep extra-word flags when unmatched spoken tokens remain
  // after targets are not fully correct
  if (!allTargetMatched && oi < total) {
    // still mid-ayah — do not treat trailing interim noise as extras
    if (opts.interim) {
      extra = 0;
      if (
        lastMessage &&
        (lastMessage.includes("زائدة") || lastMessage.includes("زائد"))
      ) {
        lastMessage = undefined;
      }
    }
  }

  return {
    display,
    stats: {
      matched,
      missing,
      incorrect,
      extra,
      repeated,
      total,
      accuracy,
      lastMessage,
    },
    revealedUpToAyah,
    lastCompletedAyah,
    currentAyah,
    revealedWordIndex: revealMax,
    cursor: oi,
  };
}

/** Filter Web Speech noise / silence crumbs that are not real extra words */
function isMeaningfulSpokenToken(w: string): boolean {
  const t = (w || "").trim();
  if (!t) return false;
  // Very short ASR fragments / punctuation-like noise
  if (t.length <= 1) return false;
  // Common non-lexical ASR artifacts
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
  // Suppress extra-word complaints on near-perfect recitation
  const extra =
    pct >= 100 || (stats.matched === stats.total && stats.missing === 0)
      ? 0
      : stats.extra;
  const lines = [
    "تقرير التلاوة",
    "────────────",
    "الدقة: " + pct + "%",
    "كلمات صحيحة: " + stats.matched + " / " + stats.total,
    "كلمات ناقصة: " + stats.missing,
    "غير مطابقة: " + stats.incorrect,
    "",
    lastCompletedAyah > 0
      ? "أكملت حتى الآية " +
        lastCompletedAyah +
        " من " +
        totalAyahs +
        "."
      : "لم تُكمل آية بالكامل بعد.",
    next <= totalAyahs
      ? "المتبقي: الآيات " + next + "–" + totalAyahs + "."
      : "أحسنت — أنهيت النطاق.",
    "",
  ];
  if (extra > 0) {
    lines.push("كلمات زائدة محتملة: " + extra);
  }
  if (pct >= 95 && stats.missing === 0 && extra === 0) {
    lines.push("طلاقة ممتازة. المدود لم تُحسب فواصل كلمات.");
  } else if (pct >= 80) {
    lines.push("أداء جيد. راجع الكلمات الحمراء فقط.");
  } else {
    lines.push("أعد من موضع التوقف ببطء.");
  }
  return lines.join("\n");
}
