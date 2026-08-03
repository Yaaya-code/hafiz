import { describe, expect, it } from "vitest";
import {
  buildLiveWordStream,
  isClearMismatch,
  matchLive,
  wordsMatchStrict,
} from "./live-recitation";

const fatihaStart = buildLiveWordStream([
  {
    surahNumber: 1,
    ayahNumber: 1,
    text: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  },
  {
    surahNumber: 1,
    ayahNumber: 2,
    text: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
  },
]);

describe("wordsMatchStrict", () => {
  it("matches exact normalized forms", () => {
    expect(wordsMatchStrict("بسم", "بسم")).toBe(true);
    expect(wordsMatchStrict("الله", "الله")).toBe(true);
  });

  it("rejects unrelated words", () => {
    expect(wordsMatchStrict("الرحمن", "كتاب")).toBe(false);
    expect(isClearMismatch("الرحمن", "كتاب")).toBe(true);
  });
});

describe("matchLive strict — no premature reveal", () => {
  it("does not reveal or mark current on next word after first match", () => {
    const r = matchLive(fatihaStart, "بسم", { interim: true, strict: true });
    const first = r.display[0];
    const second = r.display[1];
    expect(first.status).toBe("correct");
    expect(first.revealed).toBe(true);
    // Next word stays pending — no current/partial gold
    expect(second.status).toBe("pending");
    expect(second.revealed).toBe(false);
    expect(r.cursor).toBe(1);
  });

  it("never auto-highlights unspoken trailing words", () => {
    const r = matchLive(fatihaStart, "بسم الله", {
      interim: true,
      strict: true,
    });
    const pending = r.display.filter((w) => w.status === "pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(r.display.every((w) => w.status !== "current")).toBe(true);
    for (const w of r.display) {
      if (w.status === "pending") expect(w.revealed).toBe(false);
    }
  });
});

describe("matchLive strict — mistakes not ignored", () => {
  it("marks expected word incorrect when spoken is clearly wrong", () => {
    // First word wrong committed token (non-interim so last token is judged)
    const r = matchLive(fatihaStart, "كتاب", {
      interim: false,
      strict: true,
    });
    expect(r.display[0].status).toBe("incorrect");
    expect(r.display[0].revealed).toBe(true);
    expect(r.stats.incorrect).toBeGreaterThanOrEqual(1);
  });

  it("does not soft-skip wrong words in strict mode", () => {
    // Say wrong then later the second expected word — first must still be judged wrong
    const r = matchLive(fatihaStart, "xyz الله", {
      interim: false,
      strict: true,
    });
    // "xyz" is not arabic meaningful after normalize — may drop.
    // Use clear Arabic mismatch:
    const r2 = matchLive(fatihaStart, "كتاب الله", {
      interim: false,
      strict: true,
    });
    expect(r2.display[0].status).toBe("incorrect");
    // Second spoken may match second expected after first marked wrong
    // cursor advances past incorrect first word
    expect(r2.cursor).toBeGreaterThanOrEqual(1);
    // silence unused
    void r;
  });

  it("marks correct sequence green without revealing ahead", () => {
    const r = matchLive(fatihaStart, "بسم الله الرحمن", {
      interim: true,
      strict: true,
    });
    const greens = r.display.filter((w) => w.status === "correct");
    expect(greens.length).toBeGreaterThanOrEqual(2);
    // First unrevealed after matched prefix is still pending
    const firstPending = r.display.find((w) => w.status === "pending");
    expect(firstPending?.revealed).toBe(false);
  });
});
