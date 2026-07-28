/**
 * Account isolation: clearLocalUserData must wipe progress keys
 * and preserve device id only.
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
import { APP_STORAGE_KEYS } from "@/application/persistence/keys";
import {
  clearLocalUserData,
  isAccountBoundLocally,
} from "./user-data-reset";

describe("clearLocalUserData", () => {
  beforeEach(() => {
    store.clear();
    store.set(STORAGE_KEYS.deviceId, "dev_test_123");
    store.set(STORAGE_KEYS.cloudUserId, "user_abc");
    store.set(STORAGE_KEYS.profile, JSON.stringify({ onboardingComplete: true }));
    store.set(STORAGE_KEYS.streak, JSON.stringify({ current: 5 }));
    store.set(STORAGE_KEYS.mistakes, JSON.stringify([{ id: "m1" }]));
    store.set(STORAGE_KEYS.achievements, JSON.stringify({ first_review: {} }));
    store.set(APP_STORAGE_KEYS.learningSnapshot, JSON.stringify({ v: 1 }));
    store.set("hafiz_mutashabihat_progress_v1", JSON.stringify({ total: 3 }));
  });

  it("removes all user progress keys", () => {
    clearLocalUserData();
    expect(store.has(STORAGE_KEYS.profile)).toBe(false);
    expect(store.has(STORAGE_KEYS.streak)).toBe(false);
    expect(store.has(STORAGE_KEYS.mistakes)).toBe(false);
    expect(store.has(STORAGE_KEYS.achievements)).toBe(false);
    expect(store.has(STORAGE_KEYS.cloudUserId)).toBe(false);
    expect(store.has(APP_STORAGE_KEYS.learningSnapshot)).toBe(false);
    expect(store.has("hafiz_mutashabihat_progress_v1")).toBe(false);
  });

  it("preserves device id", () => {
    clearLocalUserData();
    expect(store.get(STORAGE_KEYS.deviceId)).toBe("dev_test_123");
  });

  it("isAccountBoundLocally reflects cloudUserId", () => {
    expect(isAccountBoundLocally()).toBe(true);
    clearLocalUserData();
    expect(isAccountBoundLocally()).toBe(false);
  });
});
