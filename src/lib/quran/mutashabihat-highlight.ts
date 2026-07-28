/**
 * Highlight ONLY exact similar multi-word phrases (2+ consecutive words).
 * Single-word matches are ignored completely.
 */

export type WordMark = "shared" | "neutral";

export interface HighlightToken {
  text: string;
  mark: WordMark;
  isSpace: boolean;
}

/** Strip harakat for comparison; display keeps original text */
export function normalizeArabicWord(word: string): string {
  return word
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u06E5\u06E6]/g, "")
    .replace(/ٱ/g, "ا")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF]/g, "")
    .trim();
}

function isWhitespace(s: string): boolean {
  return /^\s+$/.test(s);
}

export function tokenizeAyah(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

type WordRef = { tokIdx: number; norm: string };

function contentWords(tokens: string[]): WordRef[] {
  const out: WordRef[] = [];
  tokens.forEach((t, i) => {
    if (isWhitespace(t)) return;
    const norm = normalizeArabicWord(t);
    if (!norm) return;
    out.push({ tokIdx: i, norm });
  });
  return out;
}

/** Minimum consecutive words to count as a real mutashabih phrase */
export const MIN_PHRASE_WORDS = 2;

/**
 * Maximal common consecutive runs of length >= minLen between two word lists.
 */
function commonPhraseSpans(
  wordsA: WordRef[],
  wordsB: WordRef[],
  minLen: number
): { a: Set<number>; b: Set<number>; phrases: string[] } {
  const n = wordsA.length;
  const m = wordsB.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0)
  );
  const aIdx = new Set<number>();
  const bIdx = new Set<number>();
  const phrases: string[] = [];

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (wordsA[i - 1].norm === wordsB[j - 1].norm) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        const len = dp[i][j];
        if (len >= minLen) {
          const canExtend =
            i < n && j < m && wordsA[i].norm === wordsB[j].norm;
          if (!canExtend) {
            const phraseParts: string[] = [];
            for (let k = 0; k < len; k++) {
              aIdx.add(wordsA[i - 1 - k].tokIdx);
              bIdx.add(wordsB[j - 1 - k].tokIdx);
              phraseParts.unshift(wordsA[i - 1 - k].norm);
            }
            phrases.push(phraseParts.join(" "));
          }
        }
      }
    }
  }

  return { a: aIdx, b: bIdx, phrases };
}

const WEAK_WORDS = new Set(
  [
    "و", "في", "من", "على", "الي", "عن", "ما", "لا", "ان", "ان", "الا", "او",
    "ثم", "بل", "قد", "لم", "لن", "لو", "مع", "هو", "هي", "هم", "هذا", "هذه",
    "ذلك", "تلك", "كل", "بين", "بعد", "قبل", "يا", "له", "لها", "به", "بها",
  ].map(normalizeArabicWord)
);

/** Phrase is strong if it has 2+ words and at least one content word (len>=3, not particle) */
function isStrongPhrase(phrase: string): boolean {
  const parts = phrase.split(" ").filter(Boolean);
  if (parts.length < MIN_PHRASE_WORDS) return false;
  return parts.some((w) => w.length >= 3 && !WEAK_WORDS.has(w));
}

/**
 * True if any pair of texts shares a consecutive multi-word phrase.
 * Drops single-word "mutashabihat" and weak particle-only runs.
 */
export function hasMultiWordPhrase(
  texts: string[],
  minWords: number = MIN_PHRASE_WORDS
): boolean {
  if (texts.length < 2) return false;
  const allWords = texts.map((t) => contentWords(tokenizeAyah(t)));
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      let spans = commonPhraseSpans(
        allWords[i],
        allWords[j],
        Math.max(3, minWords)
      );
      if (spans.phrases.length === 0) {
        spans = commonPhraseSpans(allWords[i], allWords[j], minWords);
      }
      if (spans.phrases.some(isStrongPhrase)) return true;
    }
  }
  return false;
}

/**
 * Longest multi-word phrase length shared by any pair (0 if none).
 */
export function maxSharedPhraseLength(texts: string[]): number {
  if (texts.length < 2) return 0;
  const allWords = texts.map((t) => contentWords(tokenizeAyah(t)));
  let max = 0;
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const spans = commonPhraseSpans(allWords[i], allWords[j], 2);
      for (const p of spans.phrases) {
        const len = p.split(" ").filter(Boolean).length;
        if (len > max) max = len;
      }
    }
  }
  return max;
}

/**
 * Highlight only tokens inside a multi-word common phrase (2+ words).
 * Never highlights single-word matches.
 */
export function highlightMutashabihAyahs(texts: string[]): HighlightToken[][] {
  if (texts.length === 0) return [];

  const allTokens = texts.map(tokenizeAyah);
  const allWords = allTokens.map(contentWords);
  const highlight = allTokens.map((toks) => toks.map(() => false));

  if (texts.length === 1) {
    return allTokens.map((tokens) =>
      tokens.map((t) => ({
        text: t,
        mark: "neutral" as WordMark,
        isSpace: isWhitespace(t),
      }))
    );
  }

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      // Prefer 3-word phrases; fall back to 2 — never 1
      let spans = commonPhraseSpans(allWords[i], allWords[j], 3);
      if (!spans.phrases.some(isStrongPhrase)) {
        spans = commonPhraseSpans(allWords[i], allWords[j], 2);
      }
      // Only highlight tokens that belong to strong multi-word phrases
      if (!spans.phrases.some(isStrongPhrase)) continue;
      // Re-mark only strong phrase runs: filter by rebuilding from strong phrases only
      const strong = commonPhraseSpans(allWords[i], allWords[j], 2);
      // mark only words that are in a strong phrase span — use all spans of len>=2 that are strong
      // simplest: use all indices from spans if any strong phrase exists
      for (const idx of strong.a) highlight[i][idx] = true;
      for (const idx of strong.b) highlight[j][idx] = true;
    }
  }

  return allTokens.map((tokens, a) =>
    tokens.map((t, idx) => {
      if (isWhitespace(t) || !normalizeArabicWord(t)) {
        return { text: t, mark: "neutral" as WordMark, isSpace: true };
      }
      return {
        text: t,
        mark: highlight[a][idx] ? ("shared" as WordMark) : ("neutral" as WordMark),
        isSpace: false,
      };
    })
  );
}

/** Exact similar multi-word phrases for chips */
export function extractSimilarPhrases(texts: string[]): string[] {
  if (texts.length < 2) return [];
  const allWords = texts.map((t) => contentWords(tokenizeAyah(t)));
  const phraseSet = new Set<string>();

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      let spans = commonPhraseSpans(allWords[i], allWords[j], 3);
      if (spans.phrases.length === 0) {
        spans = commonPhraseSpans(allWords[i], allWords[j], 2);
      }
      for (const p of spans.phrases) {
        if (isStrongPhrase(p)) phraseSet.add(p);
      }
    }
  }

  return [...phraseSet].sort((a, b) => b.length - a.length).slice(0, 12);
}

/** @deprecated */
export function extractSimilarWords(texts: string[]): string[] {
  return extractSimilarPhrases(texts);
}

/** @deprecated */
export function extractDiffWords(texts: string[]): string[] {
  return extractSimilarPhrases(texts);
}
