/**
 * Onboarding completion flag — sticky + recovery.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
});

vi.stubGlobal("window", {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
});

import { STORAGE_KEYS } from "@/lib/storage/safe-storage";
import {
  getDefaultProfile,
  hasCompletedOnboarding,
  loadProfile,
  normalizeProfile,
  saveProfile,
  type HafizProfile,
} from "./user-profile";

function completedProfile(over: Partial<HafizProfile> = {}): HafizProfile {
  return {
    ...getDefaultProfile(),
    name: "Tester",
    onboardingComplete: true,
    completedAt: "2026-07-26T12:00:00.000Z",
    goals: ["habit"],
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
    ...over,
  };
}

describe("onboarding completion", () => {
  beforeEach(() => {
    store.clear();
  });

  it("default profile is not complete", () => {
    expect(hasCompletedOnboarding(getDefaultProfile())).toBe(false);
  });

  it("saveProfile persists onboardingComplete true", () => {
    saveProfile(completedProfile());
    const raw = JSON.parse(store.get(STORAGE_KEYS.profile) || "{}") as {
      onboardingComplete: boolean;
    };
    expect(raw.onboardingComplete).toBe(true);
    expect(hasCompletedOnboarding(loadProfile())).toBe(true);
  });

  it("normalize recovers complete when flag false but plan+completedAt exist", () => {
    const broken = completedProfile({ onboardingComplete: false });
    const fixed = normalizeProfile(broken);
    expect(fixed.onboardingComplete).toBe(true);
    expect(hasCompletedOnboarding(fixed)).toBe(true);
  });

  it("loadProfile recovers sticky complete from storage with false flag", () => {
    const broken = completedProfile({ onboardingComplete: false });
    store.set(STORAGE_KEYS.profile, JSON.stringify(broken));
    const loaded = loadProfile();
    expect(loaded.onboardingComplete).toBe(true);
    expect(hasCompletedOnboarding(loaded)).toBe(true);
  });

  it("brand-new empty storage is not complete", () => {
    expect(hasCompletedOnboarding(loadProfile())).toBe(false);
  });
});
