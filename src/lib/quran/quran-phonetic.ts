/**
 * Quran-optimized Arabic normalization & fuzzy matching.
 * Fixes ASR Madd splits (e.g. يتساء + لون → يتساءلون).
 */

/** Full Quranic orthographic normalization for comparison */
export function quranNormalize(text: string): string {
  let t = text;
  t = t.replace(
    /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u06E5\u06E6\u0610-\u061A\u06D6-\u06ED]/g,
    ""
  );
  t = t.replace(/[ۖۗۘۙۚۛۜ۝۞ۣ۟۠ۡۢۤۥۦۧۨ۩۪ۭ۫۬۰]/g, "");
  t = t.replace(/[أإآٱٲٳٵ]/g, "ا");
  t = t.replace(/ى/g, "ي");
  t = t.replace(/ؤ/g, "و");
  t = t.replace(/ئ/g, "ي");
  t = t.replace(/ة/g, "ه");
  // Collapse Madd-like repeated vowels
  t = t.replace(/ا{2,}/g, "ا");
  t = t.replace(/و{2,}/g, "و");
  t = t.replace(/ي{2,}/g, "ي");
  // Hamza variants mid-word often dropped/added by ASR
  t = t.replace(/[ءئؤ]/g, "");
  t = t.replace(/[^\u0600-\u06FF\s]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export function quranTokenize(text: string): string[] {
  const n = quranNormalize(text);
  if (!n) return [];
  return n.split(" ").filter((w) => w.length > 0);
}

/** Soft phonetic skeleton (consonant-heavy) for near-match under ASR noise */
export function phoneticSkeleton(word: string): string {
  let w = quranNormalize(word);
  w = w.replace(/[اوي]/g, "");
  w = w.replace(/[ذظض]/g, "د");
  w = w.replace(/[ث]/g, "ت");
  w = w.replace(/[ص]/g, "س");
  w = w.replace(/[ط]/g, "ت");
  w = w.replace(/[حخ]/g, "ه");
  w = w.replace(/[غ]/g, "ع");
  w = w.replace(/[ق]/g, "ك");
  return w;
}

function levenshtein(a: string, b: string): number {
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

function distRatio(a: string, b: string): number {
  const m = Math.max(a.length, b.length, 1);
  return levenshtein(a, b) / m;
}

/**
 * True if spoken ≈ expected under Quranic tolerance.
 * Does NOT treat pure prefixes as full matches (those are partial).
 */
export function wordsMatch(expected: string, spoken: string): boolean {
  const e = quranNormalize(expected);
  const s = quranNormalize(spoken);
  if (!e || !s) return false;
  if (e === s) return true;

  // Full match after dropping alifs (Madd / ASR)
  const e2 = e.replace(/ا/g, "");
  const s2 = s.replace(/ا/g, "");
  if (e2.length >= 2 && e2 === s2) return true;

  const skE = phoneticSkeleton(e);
  const skS = phoneticSkeleton(s);
  if (skE.length >= 3 && skE === skS) return true;

  // Spoken longer: may include trailing noise
  if (s.startsWith(e) && e.length >= 3 && s.length - e.length <= 2) return true;

  // Strict full-word fuzzy (not prefix-only)
  if (s.length >= e.length - 1 || s.length >= 3) {
    const maxLen = Math.max(e.length, s.length);
    if (maxLen <= 2) return e === s;
    const dist = levenshtein(e, s);
    if (maxLen <= 5) return dist <= 1;
    if (dist / maxLen <= 0.28) return true;
    if (skE.length >= 3) {
      const skDist =
        levenshtein(skE, skS) / Math.max(skE.length, skS.length || 1);
      if (skDist <= 0.2) return true;
    }
  }
  return false;
}

/**
 * Mid-word during Madd — do NOT judge as wrong yet.
 */
export function isPartialWord(expected: string, spoken: string): boolean {
  const e = quranNormalize(expected);
  const s = quranNormalize(spoken);
  if (!e || !s) return false;
  if (e === s || wordsMatch(e, s)) return false;

  // Spoken is prefix of expected (يتسا of يتساءلون)
  if (e.startsWith(s) && s.length < e.length && s.length >= 1) return true;

  // Skeleton prefix during elongation
  const skE = phoneticSkeleton(e);
  const skS = phoneticSkeleton(s);
  if (skE.startsWith(skS) && skS.length >= 2 && skS.length < skE.length) {
    return true;
  }

  if (e.length - s.length <= 3 && distRatio(e, s) <= 0.4 && e.includes(s.slice(0, Math.min(3, s.length)))) {
    return true;
  }
  return false;
}

/**
 * Can fragments join to form expected?
 * e.g. ["يتساء", "لون"] → يتساءلون
 */
export function fragmentsFormWord(
  expected: string,
  fragments: string[]
): boolean {
  if (!fragments.length) return false;
  const exp = quranNormalize(expected);
  const joined = quranNormalize(fragments.join(""));
  const joinedSp = quranNormalize(fragments.join(" "));
  if (wordsMatch(exp, joined) || wordsMatch(exp, joinedSp)) return true;
  if (isPartialWord(exp, joined)) return true;
  // Skeleton of join
  const skE = phoneticSkeleton(exp);
  const skJ = phoneticSkeleton(joined);
  if (skE.length >= 3 && (skE === skJ || skE.startsWith(skJ) || skJ.startsWith(skE))) {
    if (Math.abs(skE.length - skJ.length) <= 2) return true;
  }
  return false;
}

/**
 * Reassemble ASR tokens into Quran words using expected sequence.
 * Critical fix for Madd splits: يتساء + لون → one token matching يتساءلون
 */
export function reassembleAsrTokens(
  expectedNormWords: string[],
  rawSpokenTokens: string[]
): string[] {
  if (!rawSpokenTokens.length) return [];
  const spoken = rawSpokenTokens.map(quranNormalize).filter(Boolean);
  const out: string[] = [];
  let si = 0;
  let oi = 0;

  while (si < spoken.length) {
    if (oi >= expectedNormWords.length) {
      // leftover — attach to last or keep
      out.push(spoken[si]);
      si++;
      continue;
    }
    const exp = expectedNormWords[oi];
    let bestTake = 0;
    let bestKind: "full" | "partial" | null = null;

    for (let take = 1; take <= Math.min(6, spoken.length - si); take++) {
      const frags = spoken.slice(si, si + take);
      const joined = quranNormalize(frags.join(""));
      if (wordsMatch(exp, joined) || fragmentsFormWord(exp, frags)) {
        // Prefer exact full match with fewest fragments once full
        if (wordsMatch(exp, joined) && !isPartialWord(exp, joined)) {
          bestTake = take;
          bestKind = "full";
          break; // take smallest full match... actually for Madd splits we need enough fragments
        }
        // Keep expanding while still partial
        if (isPartialWord(exp, joined) || exp.startsWith(joined)) {
          bestTake = take;
          bestKind = "partial";
          continue;
        }
        if (fragmentsFormWord(exp, frags)) {
          bestTake = take;
          bestKind = "full";
        }
      } else if (bestKind === "partial") {
        // overshot after partial
        break;
      }
      // Also: first frag is suffix of exp and next continues? rare
    }

    // Second pass: if first fragment is prefix and second is suffix of expected
    if (bestTake === 0 && si + 1 < spoken.length) {
      const a = spoken[si];
      const b = spoken[si + 1];
      const joined = quranNormalize(a + b);
      if (wordsMatch(exp, joined) || fragmentsFormWord(exp, [a, b])) {
        bestTake = 2;
        bestKind = wordsMatch(exp, joined) ? "full" : "partial";
      } else if (exp.startsWith(a) && (exp.endsWith(b) || exp.includes(b))) {
        // classic يتساء + لون
        const tryJoin = quranNormalize(a + b);
        if (
          phoneticSkeleton(exp) === phoneticSkeleton(tryJoin) ||
          distRatio(exp, tryJoin) <= 0.35 ||
          exp.includes(a) && exp.includes(b)
        ) {
          bestTake = 2;
          bestKind = wordsMatch(exp, tryJoin) ? "full" : "partial";
        }
      }
    }

    if (bestTake > 0) {
      const joined = quranNormalize(spoken.slice(si, si + bestTake).join(""));
      out.push(joined);
      si += bestTake;
      if (bestKind === "full" || wordsMatch(exp, joined)) {
        oi++;
      }
      // partial: stay on same expected word
    } else {
      // no merge — emit token; matcher decides
      out.push(spoken[si]);
      si++;
    }
  }
  return out;
}

/** Clean ASR transcript for Quran using expected word stream */
export function cleanTranscriptForQuran(
  rawTranscript: string,
  expectedNormWords: string[]
): string {
  const spoken = quranTokenize(rawTranscript);
  if (!spoken.length) return "";
  // Aggressive multi-pass reassembly
  let tokens = spoken;
  for (let pass = 0; pass < 3; pass++) {
    const next = reassembleAsrTokens(expectedNormWords, tokens);
    if (next.join(" ") === tokens.join(" ")) break;
    tokens = next;
  }
  return tokens.join(" ");
}
