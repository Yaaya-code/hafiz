/**
 * SSR-safe localStorage helpers.
 * Never touch window/localStorage during SSR or before hydration.
 */

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function safeGetItem(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode / blocked storage
    return null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  if (!isBrowser()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string): boolean {
  if (!isBrowser()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function safeGetJSON<T>(key: string, fallback: T): T {
  const raw = safeGetItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeSetJSON(key: string, value: unknown): boolean {
  try {
    return safeSetItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** Stable anonymous device id for local-first sync */
const DEVICE_KEY = "hafiz_device_id_v1";

export function getOrCreateDeviceId(): string {
  if (!isBrowser()) return "ssr";
  let id = safeGetItem(DEVICE_KEY);
  if (!id) {
    id =
      "dev_" +
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2));
    safeSetItem(DEVICE_KEY, id);
  }
  return id;
}

/**
 * Broadcast a storage change. Always deferred so listeners never call
 * setState while another component is still rendering (React #185 error).
 */
export function emitStorageEvent(name: string, detail?: unknown) {
  if (!isBrowser()) return;
  const fire = () => {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {
      // ignore
    }
  };
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fire);
  } else {
    setTimeout(fire, 0);
  }
}

/** Storage keys used by Hafiz local-first layer */
export const STORAGE_KEYS = {
  profile: "hafiz_user_profile_v1",
  notes: "hafiz_notes_v2",
  bookmarks: "hafiz_bookmarks_v2",
  mistakes: "hafiz_mistakes_v2",
  streak: "hafiz_streak_v1",
  achievements: "hafiz_achievements_v1",
  journey: "hafiz_journey_progress_v1",
  ayahProgress: "hafiz_ayah_progress_v1",
  memStats: "hafiz_mem_stats_v1",
  recitation: "hafiz_recitation_progress_v1",
  readerPos: "hafiz_reader_pos_v1",
  lastSync: "hafiz_last_sync_v1",
  deviceId: DEVICE_KEY,
  cloudUserId: "hafiz_cloud_user_id_v1",
  /** Mutashabihat practice progress (also listed in user-data-reset EXTRA keys) */
  mutashabihatProgress: "hafiz_mutashabihat_progress_v1",
} as const;
