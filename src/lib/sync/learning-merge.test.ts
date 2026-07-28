/**
 * Phase 3 — Cloud Sync Integrity tests (Cases 1–5)
 */

import { describe, expect, it } from "vitest";
import {
  mergeLearningSnapshots,
  mergeUserIntent,
  mergeRevisionMemory,
  maxHifzPointer,
  compareHifzPointer,
  isForecastOnlyLearningSnapshot,
  stripForecast,
  validateLearningSnapshotCloud,
  makeLearningStateMeta,
} from "./learning-merge";
import type { LearningSnapshotCloud } from "./types";
import type { HafizProfile } from "@/lib/user-profile";
import { getDefaultProfile } from "@/lib/user-profile";
import {
  applyLocalSnapshot,
  emptySnapshot,
  mergeProfilesForSync,
} from "./local-snapshot";
import { APP_STORAGE_KEYS } from "@/application/persistence/keys";

// ── localStorage mock for applyLocalSnapshot cases ──────────────────

const store = new Map<string, string>();

function installStorageMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(globalThis as any).window) {
    // @ts-expect-error test shim
    globalThis.window = {
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  // @ts-expect-error test shim
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

function baseProfile(over: Partial<HafizProfile> = {}): HafizProfile {
  return {
    ...getDefaultProfile(),
    onboardingComplete: true,
    completedAt: "2026-07-01T00:00:00.000Z",
    name: "طالب",
    learningGoalId: "complete_quran",
    progressionMode: "continue_forward",
    pagesPerDay: 1,
    dailyMinutes: 60,
    ...over,
  };
}

function snapWithCursor(
  surah: number,
  ayah: number,
  over: Partial<LearningSnapshotCloud> = {}
): LearningSnapshotCloud {
  return {
    version: 1,
    updatedAt: "2026-07-26T10:00:00.000Z",
    userState: {
      userId: "u1",
      streakDays: 0,
      hifz: {
        currentPointer: { surah, ayah },
        track: "continue_forward",
        paused: false,
        weekHifzLog: [],
      },
      planning: {
        currentHifzPointer: { surah, ayah },
      },
      sessions: { records: [], maxRecords: 200 },
      mistakes: { records: [], maxRecords: 200 },
      revision: {},
      learning: {},
      stateVersion: 1,
      updatedAt: "2026-07-26",
    },
    revisionMemory: [],
    planCache: {},
    learningStateMeta: makeLearningStateMeta(
      "session_completed",
      "2026-07-26T10:00:00.000Z"
    ),
    ...over,
  };
}

describe("Phase 3 helpers", () => {
  it("compareHifzPointer / maxHifzPointer never regress", () => {
    expect(compareHifzPointer({ surah: 2, ayah: 111 }, { surah: 2, ayah: 101 })).toBeGreaterThan(
      0
    );
    expect(maxHifzPointer({ surah: 2, ayah: 111 }, { surah: 2, ayah: 101 })).toEqual({
      surah: 2,
      ayah: 111,
    });
    expect(maxHifzPointer({ surah: 2, ayah: 101 }, { surah: 114, ayah: 1 })).toEqual({
      surah: 114,
      ayah: 1,
    });
  });

  it("validateLearningSnapshotCloud rejects garbage", () => {
    expect(validateLearningSnapshotCloud([]).ok).toBe(false);
    expect(validateLearningSnapshotCloud({ version: 1, revisionMemory: {} }).ok).toBe(
      false
    );
    expect(
      validateLearningSnapshotCloud({
        version: 1,
        userState: null,
        revisionMemory: [],
      }).ok
    ).toBe(true);
  });
});

describe("Phase 3 Case 1: cursor never regresses on sync", () => {
  it("Device A 2:111 + Device B stale 2:101 → stays 2:111", () => {
    const deviceA = snapWithCursor(2, 111, {
      updatedAt: "2026-07-26T12:00:00.000Z",
      learningStateMeta: makeLearningStateMeta(
        "session_completed",
        "2026-07-26T12:00:00.000Z"
      ),
    });
    // Stale device with NEWER wall clock (classic LWW trap)
    const deviceB = snapWithCursor(2, 101, {
      updatedAt: "2026-07-26T18:00:00.000Z",
      learningStateMeta: makeLearningStateMeta(
        "plan_seed",
        "2026-07-26T18:00:00.000Z"
      ),
    });

    const merged = mergeLearningSnapshots(deviceA, deviceB);
    const ptr = (merged?.userState as { hifz: { currentPointer: { surah: number; ayah: number } } })
      ?.hifz?.currentPointer;
    expect(ptr).toEqual({ surah: 2, ayah: 111 });
    // Forecast stripped
    expect(merged?.lastForecastHint).toBeUndefined();
  });
});

describe("Phase 3 Case 2: Intent merge for progressionMode / learningGoalId", () => {
  it("newer complete_quran wins over stale revision_only", () => {
    const deviceA = baseProfile({
      learningGoalId: "complete_quran",
      progressionMode: "continue_forward",
      intentUpdatedAt: "2026-07-20T00:00:00.000Z",
      completedAt: "2026-07-20T00:00:00.000Z",
    });
    const deviceB = baseProfile({
      learningGoalId: "revision_only",
      progressionMode: "from_start",
      intentUpdatedAt: "2026-07-01T00:00:00.000Z",
      completedAt: "2026-07-01T00:00:00.000Z",
    });

    const merged = mergeUserIntent(deviceA, deviceB)!;
    expect(merged.learningGoalId).toBe("complete_quran");
    expect(merged.progressionMode).toBe("continue_forward");

    // Also via mergeProfilesForSync
    const via = mergeProfilesForSync(deviceB, deviceA);
    expect(via.learningGoalId).toBe("complete_quran");
  });

  it("does not lose memorizationSelection when newer side empty", () => {
    const withSel = baseProfile({
      intentUpdatedAt: "2026-07-01T00:00:00.000Z",
      memorizationSelection: {
        mode: "SURAH",
        surahSelections: [{ surah: 2, strength: "GOOD", fromAyah: 1, toAyah: 100 }],
        juzSelections: [],
      },
    });
    const newerEmpty = baseProfile({
      intentUpdatedAt: "2026-07-25T00:00:00.000Z",
      memorizationSelection: {
        mode: "JUZ",
        surahSelections: [],
        juzSelections: [],
      },
    });
    const merged = mergeUserIntent(withSel, newerEmpty)!;
    expect(merged.memorizationSelection?.surahSelections?.length).toBe(1);
  });
});

describe("Phase 3 Case 3: forecast-only cloud does not move cursor", () => {
  it("isForecastOnly + merge discards forecast without touching cursor", () => {
    const forecastOnly: LearningSnapshotCloud = {
      version: 1,
      updatedAt: "2026-07-26T20:00:00.000Z",
      lastForecastHint: {
        asOfDate: "2026-07-26",
        summaryAr: "سيصل لسورة النبأ",
        projectedPointer: { surah: 78, ayah: 1 },
      },
      planCache: {},
      revisionMemory: [],
    };
    expect(isForecastOnlyLearningSnapshot(forecastOnly)).toBe(true);

    const actual = snapWithCursor(2, 111);
    const merged = mergeLearningSnapshots(actual, stripForecast(forecastOnly));
    const ptr = (
      merged?.userState as {
        hifz: { currentPointer: { surah: number; ayah: number } };
      }
    )?.hifz?.currentPointer;
    expect(ptr).toEqual({ surah: 2, ayah: 111 });
    expect(merged?.lastForecastHint).toBeUndefined();

    // Even if forecast hint rides on a plan_seed shell with older pointer, max wins
    const sneakyForecast: LearningSnapshotCloud = {
      version: 1,
      updatedAt: "2026-07-26T21:00:00.000Z",
      lastForecastHint: {
        asOfDate: "2026-07-26",
        summaryAr: "توقع",
        projectedPointer: { surah: 78, ayah: 1 },
      },
      userState: {
        hifz: { currentPointer: { surah: 2, ayah: 50 } },
        sessions: { records: [], maxRecords: 200 },
      },
      revisionMemory: [],
      planCache: {},
      learningStateMeta: makeLearningStateMeta("plan_seed"),
    };
    const mergedSneaky = mergeLearningSnapshots(actual, sneakyForecast);
    const ptr2 = (
      mergedSneaky?.userState as {
        hifz: { currentPointer: { surah: number; ayah: number } };
      }
    )?.hifz?.currentPointer;
    expect(ptr2).toEqual({ surah: 2, ayah: 111 });
    expect(mergedSneaky?.lastForecastHint).toBeUndefined();
  });

  it("applyLocalSnapshot ignores forecast-only cloud", () => {
    installStorageMock();
    store.clear();
    store.set(
      APP_STORAGE_KEYS.learningSnapshot,
      JSON.stringify(snapWithCursor(2, 111))
    );

    const snap = emptySnapshot("dev-a");
    snap.learningSnapshot = {
      version: 1,
      updatedAt: "2026-07-27T00:00:00.000Z",
      lastForecastHint: {
        asOfDate: "2026-07-27",
        summaryAr: "توقع",
        projectedPointer: { surah: 114, ayah: 1 },
      },
      revisionMemory: [],
      planCache: {},
    };

    applyLocalSnapshot(snap, { replaceCollections: false });
    const after = JSON.parse(
      store.get(APP_STORAGE_KEYS.learningSnapshot) || "{}"
    ) as LearningSnapshotCloud;
    const ptr = (after.userState as { hifz: { currentPointer: { surah: number; ayah: number } } })
      ?.hifz?.currentPointer;
    expect(ptr).toEqual({ surah: 2, ayah: 111 });
  });
});

describe("Phase 3 Case 4: logout/login preserves Actual via merge", () => {
  it("merge keeps cursor + SRS across rehydrate", () => {
    const local = snapWithCursor(2, 111, {
      revisionMemory: [
        {
          id: "s2",
          content: { surah: 2 },
          reviewCount: 3,
          nextReviewDate: "2026-08-01",
          lastReviewedAt: "2026-07-20",
          mistakesCount: 0,
        },
      ],
    });
    // Cloud after logout is same user cloud row
    const cloud = snapWithCursor(2, 111, {
      revisionMemory: [
        {
          id: "s2",
          content: { surah: 2 },
          reviewCount: 3,
          nextReviewDate: "2026-08-01",
          lastReviewedAt: "2026-07-20",
          mistakesCount: 0,
        },
        {
          id: "s78",
          content: { surah: 78 },
          reviewCount: 1,
          nextReviewDate: "2026-07-28",
          lastReviewedAt: "2026-07-25",
          mistakesCount: 0,
        },
      ],
    });

    const merged = mergeLearningSnapshots(local, cloud)!;
    expect(
      (merged.userState as { hifz: { currentPointer: { surah: number; ayah: number } } }).hifz
        .currentPointer
    ).toEqual({ surah: 2, ayah: 111 });
    expect(merged.revisionMemory?.length).toBe(2);
  });
});

describe("Phase 3 Case 5: offline session then sync keeps progress", () => {
  it("offline advanced cursor merges over older cloud", () => {
    installStorageMock();
    store.clear();

    // Offline local after session 2:101 → 2:111
    store.set(
      APP_STORAGE_KEYS.learningSnapshot,
      JSON.stringify(
        snapWithCursor(2, 111, {
          updatedAt: "2026-07-26T15:00:00.000Z",
          userState: {
            ...((snapWithCursor(2, 111).userState as object) || {}),
            hifz: {
              currentPointer: { surah: 2, ayah: 111 },
              lastAdvancedDate: "2026-07-26",
              track: "continue_forward",
              paused: false,
              weekHifzLog: [],
            },
            sessions: {
              maxRecords: 200,
              records: [
                {
                  id: "offline-1",
                  date: "2026-07-26",
                  kind: "new_hifz",
                  outcome: "completed",
                  createdAt: "2026-07-26T15:00:00.000Z",
                },
              ],
            },
          },
        })
      )
    );

    // Cloud still at 2:101
    const cloudSnap = emptySnapshot("dev-a");
    cloudSnap.learningSnapshot = snapWithCursor(2, 101, {
      updatedAt: "2026-07-26T08:00:00.000Z",
    });

    applyLocalSnapshot(cloudSnap, { replaceCollections: false });

    const after = JSON.parse(
      store.get(APP_STORAGE_KEYS.learningSnapshot) || "{}"
    ) as LearningSnapshotCloud;
    const us = after.userState as {
      hifz: { currentPointer: { surah: number; ayah: number }; lastAdvancedDate?: string };
      sessions: { records: { id: string }[] };
    };
    expect(us.hifz.currentPointer).toEqual({ surah: 2, ayah: 111 });
    expect(us.hifz.lastAdvancedDate).toBe("2026-07-26");
    expect(us.sessions.records.some((r) => r.id === "offline-1")).toBe(true);
  });

  it("SRS merge by id keeps higher reviewCount", () => {
    const merged = mergeRevisionMemory(
      [
        {
          id: "x",
          reviewCount: 5,
          lastReviewedAt: "2026-07-20",
          nextReviewDate: "2026-08-01",
          mistakesCount: 1,
        },
      ],
      [
        {
          id: "x",
          reviewCount: 2,
          lastReviewedAt: "2026-07-10",
          nextReviewDate: "2026-07-15",
          mistakesCount: 0,
        },
        {
          id: "y",
          reviewCount: 1,
          nextReviewDate: "2026-07-27",
        },
      ]
    ) as { id: string; reviewCount: number }[];
    const x = merged.find((m) => m.id === "x")!;
    expect(x.reviewCount).toBe(5);
    expect(merged.map((m) => m.id).sort()).toEqual(["x", "y"]);
  });
});

describe("Phase 3 Intent + profile soft merge sticky onboarding", () => {
  it("local complete not downgraded by incomplete cloud", () => {
    const local = baseProfile({ name: "A", plan: { dailyNewPages: 1 } as HafizProfile["plan"] });
    const remote = {
      ...getDefaultProfile(),
      onboardingComplete: false,
      name: "stale",
    };
    const m = mergeProfilesForSync(local, remote);
    expect(m.onboardingComplete).toBe(true);
    expect(m.name).toBe("A");
  });
});
