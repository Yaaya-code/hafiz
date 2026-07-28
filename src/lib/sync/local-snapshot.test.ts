import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Unit-test merge helpers via applyLocalSnapshot with a mock localStorage.
 */

const store = new Map<string, string>();

vi.stubGlobal("window", {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
});

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
});

import {
  applyLocalSnapshot,
  emptySnapshot,
  mergeProfilesForSync,
} from "./local-snapshot";
import { STORAGE_KEYS } from "@/lib/storage/safe-storage";
import { APP_STORAGE_KEYS } from "@/application/persistence/keys";
import type { HafizProfile } from "@/lib/user-profile";

describe("applyLocalSnapshot merge", () => {
  beforeEach(() => {
    store.clear();
  });

  it("merges mistakes by id without wiping local-only rows", () => {
    store.set(
      STORAGE_KEYS.mistakes,
      JSON.stringify([
        {
          id: "local-only",
          surahNumber: 1,
          type: "OTHER",
          frequency: 1,
          difficulty: 2,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ])
    );

    const snap = emptySnapshot("dev");
    snap.mistakes = [
      {
        id: "cloud-1",
        surahNumber: 2,
        type: "HARAKA",
        frequency: 2,
        difficulty: 3,
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
      },
    ];

    applyLocalSnapshot(snap, { replaceCollections: false });
    const merged = JSON.parse(store.get(STORAGE_KEYS.mistakes) || "[]") as {
      id: string;
    }[];
    const ids = merged.map((m) => m.id).sort();
    expect(ids).toEqual(["cloud-1", "local-only"]);
  });

  it("replaceCollections still unions mistakes (never wipes local-only error bank)", () => {
    store.set(
      STORAGE_KEYS.mistakes,
      JSON.stringify([
        {
          id: "local-only",
          surahNumber: 1,
          type: "OTHER",
          frequency: 1,
          difficulty: 2,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ])
    );
    const snap = emptySnapshot("dev");
    snap.mistakes = [
      {
        id: "cloud-1",
        surahNumber: 2,
        type: "HARAKA",
        frequency: 1,
        difficulty: 3,
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
      },
    ];
    applyLocalSnapshot(snap, { replaceCollections: true });
    const merged = JSON.parse(store.get(STORAGE_KEYS.mistakes) || "[]") as {
      id: string;
    }[];
    expect(merged.map((m) => m.id).sort()).toEqual(["cloud-1", "local-only"]);
  });

  it("LWW keeps newer mistake row by updatedAt", () => {
    store.set(
      STORAGE_KEYS.mistakes,
      JSON.stringify([
        {
          id: "same",
          surahNumber: 2,
          type: "WRONG_WORD",
          frequency: 1,
          difficulty: 3,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          note: "old",
        },
      ])
    );
    const snap = emptySnapshot("dev");
    snap.mistakes = [
      {
        id: "same",
        surahNumber: 2,
        type: "WRONG_WORD",
        frequency: 5,
        difficulty: 4,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
        note: "new",
      },
    ];
    applyLocalSnapshot(snap, { replaceCollections: false });
    const merged = JSON.parse(store.get(STORAGE_KEYS.mistakes) || "[]") as {
      id: string;
      frequency: number;
      note?: string;
    }[];
    expect(merged).toHaveLength(1);
    expect(merged[0].frequency).toBe(5);
    expect(merged[0].note).toBe("new");
  });

  it("never wipes offline streak when cloud streak is empty/weaker", () => {
    store.set(
      STORAGE_KEYS.streak,
      JSON.stringify({
        current: 12,
        longest: 20,
        lastActiveDate: "2026-07-27",
        totalDays: 40,
      })
    );
    const snap = emptySnapshot("dev");
    snap.streak = {
      current: 0,
      longest: 0,
      lastActiveDate: "",
      totalDays: 0,
    };
    applyLocalSnapshot(snap, { replaceCollections: true });
    const s = JSON.parse(store.get(STORAGE_KEYS.streak) || "{}") as {
      current: number;
      longest: number;
    };
    expect(s.current).toBe(12);
    expect(s.longest).toBe(20);
  });

  it("replaceCollections replaces profile without merging prior local", () => {
    store.set(
      STORAGE_KEYS.profile,
      JSON.stringify({
        version: 2,
        name: "Old User",
        onboardingComplete: true,
        goals: ["old-goal"],
        pagesPerDay: 3,
        revisionSessionsPerDay: 2,
        dailyMinutes: 60,
        memorizationStrength: 5,
        revisionStyle: "intensive",
        preferredQariId: "x",
      })
    );
    const snap = emptySnapshot("dev");
    snap.profile = {
      version: 2,
      name: "Cloud User",
      onboardingComplete: true,
      goals: ["new-goal"],
      pagesPerDay: 1,
      revisionSessionsPerDay: 1,
      dailyMinutes: 30,
      memorizationStrength: 2,
      revisionStyle: "light",
      preferredQariId: "alafasy",
      completedAt: "2026-07-26T00:00:00.000Z",
    } as never;
    applyLocalSnapshot(snap, { replaceCollections: true });
    const profile = JSON.parse(store.get(STORAGE_KEYS.profile) || "{}") as {
      name: string;
      goals: string[];
    };
    expect(profile.name).toBe("Cloud User");
    expect(profile.goals).toEqual(["new-goal"]);
  });

  it("Phase 3: empty cloud profile does not wipe local User Intent", () => {
    store.set(
      STORAGE_KEYS.profile,
      JSON.stringify({
        version: 2,
        name: "Stale",
        onboardingComplete: true,
        learningGoalId: "complete_quran",
        progressionMode: "continue_forward",
        pagesPerDay: 1,
        revisionSessionsPerDay: 2,
        dailyMinutes: 45,
        memorizationStrength: 3,
        revisionStyle: "balanced",
        preferredQariId: "alafasy",
        goals: [],
        completedAt: "2026-07-01T00:00:00.000Z",
      })
    );
    const snap = emptySnapshot("dev");
    snap.profile = null;
    applyLocalSnapshot(snap, { replaceCollections: true });
    // Intent is sticky — empty cloud must not erase local profile
    const kept = JSON.parse(store.get(STORAGE_KEYS.profile) || "{}") as {
      name: string;
      learningGoalId?: string;
    };
    expect(kept.name).toBe("Stale");
    expect(kept.learningGoalId).toBe("complete_quran");
  });

  it("soft merge never downgrades completed local onboarding", () => {
    const completedLocal = {
      version: 2 as const,
      name: "Local Complete",
      onboardingComplete: true,
      completedAt: "2026-07-26T12:00:00.000Z",
      goals: ["habit"],
      pagesPerDay: 1,
      revisionSessionsPerDay: 2,
      dailyMinutes: 45,
      memorizationStrength: 3 as const,
      revisionStyle: "balanced" as const,
      preferredQariId: "alafasy",
      plan: {
        dailyNewPages: 1,
        dailyRevisionPages: 2,
        sessions: 2,
        sessionLengthMinutes: 20,
        revisionMinutes: 30,
        newMinutes: 15,
        memorizedUnits: 1,
        estimatedDaysToFirstFullPass: 10,
        strengthSummary: "x",
        styleSummary: "y",
        goals: ["habit"],
        focus: [],
        scheduleHint: [],
        welcomeMessage: { greeting: "hi", body: "b", closing: "c" },
      },
    };
    store.set(STORAGE_KEYS.profile, JSON.stringify(completedLocal));

    const snap = emptySnapshot("dev");
    snap.profile = {
      version: 2,
      name: "Cloud Stale",
      onboardingComplete: false,
      completedAt: "",
      goals: [],
      pagesPerDay: 1,
      revisionSessionsPerDay: 2,
      dailyMinutes: 45,
      memorizationStrength: 3,
      revisionStyle: "balanced",
      preferredQariId: "alafasy",
    } as HafizProfile;

    applyLocalSnapshot(snap, { replaceCollections: false });
    const profile = JSON.parse(store.get(STORAGE_KEYS.profile) || "{}") as {
      onboardingComplete: boolean;
      name: string;
      plan?: unknown;
    };
    expect(profile.onboardingComplete).toBe(true);
    expect(profile.name).toBe("Local Complete");
    expect(profile.plan).toBeTruthy();
  });

  it("Phase 3: learningSnapshot merge never regresses cursor", () => {
    store.set(
      APP_STORAGE_KEYS.learningSnapshot,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-07-26T12:00:00.000Z",
        userState: {
          hifz: { currentPointer: { surah: 2, ayah: 111 } },
          sessions: { records: [], maxRecords: 200 },
        },
        revisionMemory: [{ id: "a", reviewCount: 1 }],
        planCache: {},
        learningStateMeta: {
          version: 2,
          updatedAt: "2026-07-26T12:00:00.000Z",
          source: "session_completed",
        },
      })
    );

    const snap = emptySnapshot("dev");
    snap.learningSnapshot = {
      version: 1,
      updatedAt: "2026-07-26T20:00:00.000Z",
      userState: {
        hifz: { currentPointer: { surah: 2, ayah: 101 } },
        sessions: { records: [], maxRecords: 200 },
      },
      revisionMemory: [],
      planCache: {},
      learningStateMeta: {
        version: 2,
        updatedAt: "2026-07-26T20:00:00.000Z",
        source: "plan_seed",
      },
    };

    applyLocalSnapshot(snap, { replaceCollections: false });
    const after = JSON.parse(
      store.get(APP_STORAGE_KEYS.learningSnapshot) || "{}"
    ) as {
      userState: { hifz: { currentPointer: { surah: number; ayah: number } } };
    };
    expect(after.userState.hifz.currentPointer).toEqual({
      surah: 2,
      ayah: 111,
    });
  });

  it("mergeProfilesForSync keeps local plan when cloud incomplete", () => {
    const local = {
      version: 2 as const,
      name: "A",
      onboardingComplete: true,
      completedAt: "2026-07-26T00:00:00.000Z",
      goals: ["g"],
      pagesPerDay: 1,
      revisionSessionsPerDay: 1,
      dailyMinutes: 30,
      memorizationStrength: 3 as const,
      revisionStyle: "balanced" as const,
      preferredQariId: "alafasy",
      plan: { dailyNewPages: 1 } as HafizProfile["plan"],
    };
    const remote = {
      ...local,
      name: "B",
      onboardingComplete: false,
      completedAt: "",
      plan: undefined,
    };
    const merged = mergeProfilesForSync(local, remote);
    expect(merged.onboardingComplete).toBe(true);
    expect(merged.name).toBe("A");
    expect(merged.plan).toEqual(local.plan);
  });
});
