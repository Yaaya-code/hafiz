/**
 * Word-level live alignment for Quran recitation.
 *
 * Strict UX rules (direct mode):
 * 1) No premature reveal: never show/highlight word N+1 just because N matched.
 *    A word becomes visible only after the user actually uttered something that
 *    was judged against it (correct OR incorrect).
 * 2) No ignored mistakes: meaningful spoken tokens that fail the match threshold
 *    mark the expected Quran word red (status: "incorrect"), not silent skip.
 */

import {
  cleanTranscriptForQuran,
  isPartialWord,
  quranNormalize,
  quranTokenize,
  wordsMatch,
} from "./quran-phonetic";
import { isMobileSpeechEnvironment } from "./speech-recognition";

/**
 * ASR-tolerant Arabic normalization (tashkeel↓ hamza→ا ة→ه ى→ي).
 * Used heavily by the Whisper profile; Web Speech also benefits from base normalize.
 */
export function normalizeArabicText(text: string): string {
  return quranNormalize(text || "");
}

/**
 * Matching profiles (Progressive Enhancement):
 * - webspeech: comfortable classic logic (desktop golden era — soft-ignore noise)
 * - whisper: stricter live rules tuned for Whisper-tiny noise / no premature red spam
 */
export type MatchProfile = "webspeech" | "whisper";

/** Resolve profile: explicit opt wins; else desktop → webspeech, mobile → whisper. */
export function resolveMatchProfile(
  explicit?: MatchProfile
): MatchProfile {
  if (explicit === "webspeech" || explicit === "whisper") return explicit;
  if (typeof window === "undefined") return "webspeech";
  return isMobileSpeechEnvironment() ? "whisper" : "webspeech";
}

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
      normWords: displayWords.map(normalizeArabicText),
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
   * Strict cursor (stay on current expected word). Behavior of mismatches
   * depends on `profile`.
   */
  strict?: boolean;
  /**
   * webspeech = classic comfortable desktop matching (pre-Whisper era).
   * whisper = mobile/WASM-oriented rules.
   * Omit to auto-pick from environment (desktop→webspeech, mobile→whisper).
   */
  profile?: MatchProfile;
};

/** Levenshtein distance (exported for tests / diagnostics). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Classic Web Speech match (desktop golden era — pre-Whisper-tuning).
 * No extra Levenshtein gate that rejected near-matches from Chrome ASR.
 */
export function wordsMatchWebSpeech(
  expected: string,
  spoken: string
): boolean {
  const e = quranNormalize(expected);
  const s = quranNormalize(spoken);
  if (!e || !s) return false;
  if (e === s) return true;
  const e2 = e.replace(/ا/g, "");
  const s2 = s.replace(/ا/g, "");
  if (e2.length >= 3 && e2 === s2) return true;
  if (e.length <= 2) return e === s;
  if (!wordsMatch(e, s)) return false;
  if (Math.abs(e.length - s.length) > Math.max(2, Math.floor(e.length * 0.25))) {
    return false;
  }
  return true;
}

/**
 * Whisper-oriented match (tighter orthography + soft Levenshtein).
 */
export function wordsMatchWhisper(expected: string, spoken: string): boolean {
  const e = normalizeArabicText(expected);
  const s = normalizeArabicText(spoken);
  if (!e || !s) return false;
  if (e === s) return true;
  const e2 = e.replace(/ا/g, "");
  const s2 = s.replace(/ا/g, "");
  if (e2.length >= 3 && e2 === s2) return true;
  if (e.length <= 2) return e === s;
  if (!wordsMatch(e, s)) return false;
  if (Math.abs(e.length - s.length) > Math.max(2, Math.floor(e.length * 0.28))) {
    return false;
  }
  const dist = levenshtein(e, s);
  const maxLen = Math.max(e.length, s.length);
  if (maxLen <= 4) return dist <= 1;
  return dist / maxLen <= 0.34;
}

/** @deprecated Prefer wordsMatchWebSpeech / wordsMatchWhisper; kept as Whisper alias. */
export function wordsMatchStrict(expected: string, spoken: string): boolean {
  return wordsMatchWhisper(expected, spoken);
}

/** True when spoken is clearly not the expected word (Whisper profile). */
export function isClearMismatch(expected: string, spoken: string): boolean {
  const e = normalizeArabicText(expected);
  const s = normalizeArabicText(spoken);
  if (!e || !s) return false;
  if (wordsMatchWhisper(e, s)) return false;
  if (isPartialWord(e, s)) return false;
  if (e.length <= 2) return s !== e && s.length >= 2;
  const dist = levenshtein(e, s);
  const maxLen = Math.max(e.length, s.length);
  return dist / maxLen > 0.4;
}

export function matchLive(
  stream: LiveAyahWords[],
  spokenText: string,
  opts: MatchLiveOptions = {}
): LiveMatchResult {
  const profile = resolveMatchProfile(opts.profile);
  const isWebSpeech = profile === "webspeech";
  const strict = opts.strict === true;
  const streaming = !strict && opts.streaming === true;
  const interim = opts.interim === true;

  const matchWord = isWebSpeech ? wordsMatchWebSpeech : wordsMatchWhisper;

  const flat: { text: string; norm: string; ayahNumber: number }[] = [];
  for (const a of stream) {
    for (let i = 0; i < a.displayWords.length; i++) {
      const raw = a.normWords[i] || a.displayWords[i];
      flat.push({
        text: a.displayWords[i],
        // Both profiles normalize; Whisper path is explicit for ASR typos
        norm: isWebSpeech ? quranNormalize(raw) : normalizeArabicText(raw),
        ayahNumber: a.ayahNumber,
      });
    }
  }

  const expectedNorms = flat.map((f) => f.norm);
  const spokenRaw = isWebSpeech
    ? spokenText
    : normalizeArabicText(spokenText);
  const cleaned = cleanTranscriptForQuran(spokenRaw, expectedNorms);
  let spoken = quranTokenize(cleaned);
  if (!spoken.length) spoken = quranTokenize(spokenRaw);
  if (!isWebSpeech) {
    spoken = spoken.map((w) => normalizeArabicText(w)).filter(Boolean);
  }

  const total = flat.length;
  const status: LiveStatus[] = Array(total).fill("pending");
  const notes: (string | undefined)[] = Array(total).fill(undefined);

  let oi = 0;
  let si = 0;
  let extra = 0;
  let repeated = 0;
  let lastMessage: string | undefined;
  let prevSpoken = "";

  function markIncorrect(idx: number, spokenWord: string) {
    if (idx < 0 || idx >= total) return;
    status[idx] = "incorrect";
    notes[idx] =
      "المتوقع «" + flat[idx].text + "» · سمعت «" + spokenWord + "»";
    lastMessage = notes[idx];
  }

  function markSkipped(from: number, to: number) {
    for (let k = from; k < to; k++) {
      if (status[k] === "correct") continue;
      status[k] = "incorrect";
      notes[k] = "تم تخطّي «" + flat[k].text + "»";
      lastMessage = notes[k];
    }
  }

  while (si < spoken.length && oi < total) {
    const sWord = spoken[si];
    const exp = flat[oi].norm;
    const isLastToken = si === spoken.length - 1;
    const softInterim = interim && isLastToken;

    if (sWord === prevSpoken && sWord.length > 1) {
      if (matchWord(exp, sWord) || isPartialWord(exp, sWord)) {
        si++;
        continue;
      }
      repeated++;
      si++;
      continue;
    }

    // 1) Full match of CURRENT word
    if (matchWord(exp, sWord) && !isPartialWord(exp, sWord)) {
      status[oi] = "correct";
      prevSpoken = sWord;
      oi++;
      si++;
      continue;
    }

    // 2) Madd / partial of CURRENT word
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
      if (matchWord(exp, merged) && !isPartialWord(exp, merged)) {
        status[oi] = "correct";
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

    // 4) STRICT path — profile decides comfort vs harshness
    if (strict) {
      if (isWebSpeech) {
        // Desktop balance: ignore noise / growing interim — but punish clear wrongs.
        // Never wait forever for the exact word (that killed the "test" UX).
        if (softInterim) {
          status[oi] = "current";
          prevSpoken = sWord;
          si++;
          continue;
        }
        if (!isMeaningfulSpokenToken(sWord)) {
          si++;
          continue;
        }
        // Meaningful token that is not a match/partial → count as incorrect
        markIncorrect(oi, sWord);
        prevSpoken = sWord;
        oi++;
        si++;
        continue;
      }

      // WHISPER profile: judge committed mismatches (mobile live path)
      if (softInterim) {
        break;
      }
      if (isMeaningfulSpokenToken(sWord) && isClearMismatch(exp, sWord)) {
        markIncorrect(oi, sWord);
        prevSpoken = sWord;
        oi++;
        si++;
        continue;
      }
      if (!isMeaningfulSpokenToken(sWord)) {
        si++;
        continue;
      }
      if (!interim || !isLastToken) {
        markIncorrect(oi, sWord);
        prevSpoken = sWord;
        oi++;
        si++;
        continue;
      }
      break;
    }

    // 5) Non-strict streaming skip-ahead
    let foundLater = -1;
    if (streaming) {
      for (let k = oi + 1; k < Math.min(total, oi + 6); k++) {
        if (matchWord(flat[k].norm, sWord)) {
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
        oi = foundLater + 1;
        prevSpoken = sWord;
        si++;
        continue;
      }
    }

    // 6) Extra spoken before expected
    let foundSpoken = -1;
    for (let k = si + 1; k < Math.min(spoken.length, si + 3); k++) {
      if (matchWord(exp, spoken[k])) {
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

    if (softInterim) {
      if (isWebSpeech) {
        status[oi] = "current";
        prevSpoken = sWord;
        si++;
        continue;
      }
      break;
    }

    markIncorrect(oi, sWord);
    prevSpoken = sWord;
    oi++;
    si++;
  }

  if (oi >= total && si < spoken.length) {
    extra += spoken.slice(si).filter((w) => isMeaningfulSpokenToken(w)).length;
  }

  // Web Speech: restore classic cursor marker. Whisper: no premature "current".
  if (isWebSpeech && oi < total && status[oi] === "pending") {
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
      // Whisper: hide leftover "current". Web Speech: keep cursor status.
      status: !isWebSpeech && st === "current" ? "pending" : st,
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
    if (
      words.some(
        (w) =>
          w.revealed ||
          (isWebSpeech &&
            (w.status === "current" || w.status === "partial"))
      )
    ) {
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
