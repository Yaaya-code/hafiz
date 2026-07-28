/**
 * SRS Revision Intelligence Engine tests.
 */

import { describe, expect, it } from "vitest";
import {
  applyNearReviewOutcome,
  applyReviewOutcome,
  createMemoryItem,
  rankFarRevisionQueue,
  rankRevisionItems,
  scheduleNearRevision,
  selectRevisionItemsForCapacity,
  scoreRevisionItem,
  computeNextInterval,
} from "./index";
import type { RevisionMemoryItem } from "../models/revision-memory";

const DAY = "2026-07-23";

function baseItem(
  over: Partial<RevisionMemoryItem> & Pick<RevisionMemoryItem, "id">
): RevisionMemoryItem {
  return {
    id: over.id,
    content: over.content ?? {
      surah: 78,
      fromAyah: 1,
      toAyah: 10,
      pagesApprox: 0.5,
      labelAr: "test",
    },
    lastReviewedAt: over.lastReviewedAt ?? "2026-07-20",
    reviewCount: over.reviewCount ?? 3,
    mistakesCount: over.mistakesCount ?? 0,
    successRate: over.successRate ?? 0.9,
    strengthScore: over.strengthScore ?? 0.7,
    stabilityScore: over.stabilityScore ?? 0.65,
    nextReviewDate: over.nextReviewDate ?? "2026-07-23",
    intervalDays: over.intervalDays ?? 3,
    easeFactor: over.easeFactor ?? 2.5,
    consecutiveSuccesses: over.consecutiveSuccesses ?? 2,
    consecutiveFailures: over.consecutiveFailures ?? 0,
    isNear: over.isNear,
    urgent: over.urgent,
    source: over.source ?? "far_corpus",
  };
}

describe("SRS Revision Intelligence", () => {
  it("1. New memorized item gets first review scheduled", () => {
    const item = createMemoryItem(
      "new-1",
      { surah: 114, fromAyah: 1, toAyah: 6, pagesApprox: 0.2, labelAr: "الناس" },
      DAY,
      { isNear: true, source: "new_hifz" }
    );
    expect(item.reviewCount).toBe(0);
    expect(item.lastReviewedAt).toBeNull();
    expect(item.nextReviewDate).toBe("2026-07-24");
    expect(item.intervalDays).toBe(1);
    expect(item.isNear).toBe(true);

    const near = scheduleNearRevision(
      "near-1",
      { surah: 112, pagesApprox: 0.2 },
      DAY
    );
    expect(near.nextReviewDate).toBe("2026-07-24");
    expect(near.isNear).toBe(true);
  });

  it("2. Forgotten content gets higher priority", () => {
    const stable = baseItem({
      id: "stable",
      strengthScore: 0.9,
      stabilityScore: 0.9,
      mistakesCount: 0,
      nextReviewDate: "2026-07-30",
      successRate: 1,
    });
    const forgotten = baseItem({
      id: "forgotten",
      strengthScore: 0.2,
      stabilityScore: 0.15,
      mistakesCount: 4,
      consecutiveFailures: 2,
      nextReviewDate: "2026-07-18",
      successRate: 0.3,
    });

    const ranked = rankRevisionItems([stable, forgotten], { asOfDate: DAY });
    expect(ranked[0].item.id).toBe("forgotten");
    expect(ranked[0].priorityScore).toBeGreaterThan(ranked[1].priorityScore);
  });

  it("3. High mistake count increases priority", () => {
    const clean = baseItem({ id: "clean", mistakesCount: 0 });
    const messy = baseItem({ id: "messy", mistakesCount: 6 });
    const sClean = scoreRevisionItem(clean, { asOfDate: DAY });
    const sMessy = scoreRevisionItem(messy, { asOfDate: DAY });
    expect(sMessy.priorityScore).toBeGreaterThan(sClean.priorityScore);
    expect(
      sMessy.reasons.some(
        (r) => r.includes("mistake") || r.includes("high mistakes")
      )
    ).toBe(true);
  });

  it("4. Successful reviews increase interval", () => {
    const item = baseItem({
      id: "ok",
      intervalDays: 3,
      easeFactor: 2.5,
      consecutiveSuccesses: 1,
    });
    const next = computeNextInterval(item, "success", DAY);
    expect(next.intervalDays).toBeGreaterThan(item.intervalDays);
    expect(next.stabilityScore).toBeGreaterThanOrEqual(item.stabilityScore);

    const updated = applyReviewOutcome(item, "success", DAY);
    expect(updated.intervalDays).toBeGreaterThan(item.intervalDays);
    expect(updated.reviewCount).toBe(item.reviewCount + 1);
    expect(updated.consecutiveSuccesses).toBe(2);
    expect(updated.consecutiveFailures).toBe(0);
  });

  it("5. Failed reviews shorten interval", () => {
    const item = baseItem({
      id: "fail-me",
      intervalDays: 10,
      easeFactor: 2.5,
      stabilityScore: 0.7,
      strengthScore: 0.7,
    });
    const next = computeNextInterval(item, "fail", DAY);
    expect(next.intervalDays).toBe(1);
    expect(next.stabilityScore).toBeLessThan(item.stabilityScore);
    expect(next.easeFactor).toBeLessThan(item.easeFactor);

    const updated = applyReviewOutcome(item, "fail", DAY);
    expect(updated.intervalDays).toBe(1);
    expect(updated.mistakesCount).toBeGreaterThan(item.mistakesCount);
    expect(updated.consecutiveFailures).toBe(1);
    expect(updated.consecutiveSuccesses).toBe(0);
  });

  it("6. Strong stable memorizer receives less frequent revision", () => {
    const strong = baseItem({
      id: "strong",
      strengthScore: 0.92,
      stabilityScore: 0.9,
      mistakesCount: 0,
      successRate: 1,
      nextReviewDate: "2026-07-28",
      intervalDays: 12,
    });
    const weak = baseItem({
      id: "weak",
      strengthScore: 0.3,
      stabilityScore: 0.25,
      mistakesCount: 2,
      successRate: 0.4,
      nextReviewDate: "2026-07-22",
      intervalDays: 2,
    });

    // After success, strong gets longer interval than weak after fail
    const strongAfter = applyReviewOutcome(strong, "success", DAY);
    const weakAfter = applyReviewOutcome(weak, "fail", DAY);
    expect(strongAfter.intervalDays).toBeGreaterThan(weakAfter.intervalDays);

    const ranked = rankRevisionItems([strong, weak], { asOfDate: DAY });
    expect(ranked[0].item.id).toBe("weak");
  });

  it("7. Weak memorizer receives frequent revision", () => {
    const weak = baseItem({
      id: "w1",
      strengthScore: 0.25,
      stabilityScore: 0.2,
      mistakesCount: 3,
      consecutiveFailures: 1,
      nextReviewDate: "2026-07-23",
    });
    const scored = scoreRevisionItem(weak, { asOfDate: DAY });
    expect(scored.priorityScore).toBeGreaterThan(40);
    expect(
      scored.reasons.some(
        (r) =>
          r.includes("weak") ||
          r.includes("low stability") ||
          r.includes("mistake")
      )
    ).toBe(true);

    // Fail keeps interval short
    const afterFail = applyReviewOutcome(weak, "fail", DAY);
    expect(afterFail.intervalDays).toBe(1);
  });

  it("8. Same input produces same ranking", () => {
    const items = [
      baseItem({ id: "a", mistakesCount: 1, nextReviewDate: "2026-07-22" }),
      baseItem({ id: "b", mistakesCount: 5, nextReviewDate: "2026-07-20" }),
      baseItem({
        id: "c",
        strengthScore: 0.95,
        stabilityScore: 0.95,
        nextReviewDate: "2026-08-01",
      }),
      baseItem({ id: "d", isNear: true, nextReviewDate: "2026-07-23" }),
    ];
    const r1 = rankRevisionItems(items, { asOfDate: DAY });
    const r2 = rankRevisionItems(items, { asOfDate: DAY });
    expect(r1.map((x) => x.item.id)).toEqual(r2.map((x) => x.item.id));
    expect(r1.map((x) => x.priorityScore)).toEqual(
      r2.map((x) => x.priorityScore)
    );

    const selected1 = selectRevisionItemsForCapacity(r1, {
      maxItems: 2,
      maxMinutes: 40,
    });
    const selected2 = selectRevisionItemsForCapacity(r2, {
      maxItems: 2,
      maxMinutes: 40,
    });
    expect(selected1.map((x) => x.item.id)).toEqual(
      selected2.map((x) => x.item.id)
    );
  });

  it("9. No mutation of input state", () => {
    const item = baseItem({
      id: "immutable",
      mistakesCount: 2,
      content: { surah: 2, fromAyah: 1, toAyah: 5, pagesApprox: 1 },
    });
    const snapshot = JSON.stringify(item);
    const items = [item, baseItem({ id: "other" })];
    const itemsSnap = JSON.stringify(items);

    applyReviewOutcome(item, "fail", DAY);
    scoreRevisionItem(item, { asOfDate: DAY });
    rankRevisionItems(items, { asOfDate: DAY });
    selectRevisionItemsForCapacity(
      rankRevisionItems(items, { asOfDate: DAY }),
      { maxItems: 1 }
    );
    applyNearReviewOutcome(
      scheduleNearRevision("n", { surah: 1 }, DAY),
      "fail",
      DAY
    );

    expect(JSON.stringify(item)).toBe(snapshot);
    expect(JSON.stringify(items)).toBe(itemsSnap);
  });
});

describe("near revision intelligence", () => {
  it("fail keeps urgent near queue; success graduates", () => {
    const near = scheduleNearRevision(
      "n-hifz",
      { surah: 114, pagesApprox: 0.25 },
      DAY
    );
    const failed = applyNearReviewOutcome(near, "fail", "2026-07-24");
    expect(failed.isNear).toBe(true);
    expect(failed.urgent).toBe(true);
    expect(failed.intervalDays).toBe(1);

    const ok = applyNearReviewOutcome(near, "success", "2026-07-24");
    expect(ok.isNear).toBe(false);
    expect(ok.urgent).toBe(false);
    expect(ok.intervalDays).toBeGreaterThanOrEqual(1);
  });
});

describe("capacity selection", () => {
  it("selects highest priority within limits", () => {
    const ranked = rankRevisionItems(
      [
        baseItem({ id: "low", mistakesCount: 0, nextReviewDate: "2026-08-01" }),
        baseItem({
          id: "high",
          mistakesCount: 8,
          nextReviewDate: "2026-07-10",
          strengthScore: 0.2,
          stabilityScore: 0.2,
        }),
        baseItem({ id: "mid", mistakesCount: 2, nextReviewDate: "2026-07-22" }),
      ],
      { asOfDate: DAY }
    );
    const picked = selectRevisionItemsForCapacity(ranked, { maxItems: 2 });
    expect(picked).toHaveLength(2);
    expect(picked[0].item.id).toBe("high");
  });

  it("rankFarRevisionQueue excludes near items", () => {
    const ranked = rankFarRevisionQueue(
      [
        baseItem({ id: "far", isNear: false }),
        baseItem({ id: "near", isNear: true, urgent: true }),
      ],
      DAY
    );
    expect(ranked.every((r) => r.item.id !== "near")).toBe(true);
  });
});
