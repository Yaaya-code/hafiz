"use client";

/**
 * Local-first progress sync:
 * - UI always reads/writes localStorage immediately (optimistic)
 * - Background POST /api/v1/sync when online / on login / interval
 * - Applies merged cloud snapshot when available
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  applyLocalSnapshot,
  collectLocalSnapshot,
  getCloudUserId,
  getLastSyncAt,
  setCloudUserId,
} from "@/lib/sync/local-snapshot";
import { getOrCreateDeviceId, isBrowser } from "@/lib/storage/safe-storage";
import type { SyncPullResult } from "@/lib/sync/types";
import { loadProfile } from "@/lib/user-profile";

type SyncStatus = "idle" | "syncing" | "ok" | "error" | "local_only";

type SyncContextValue = {
  status: SyncStatus;
  lastSyncedAt: string | null;
  userId: string | null;
  mode: "local_only" | "cloud" | null;
  message: string | null;
  error: string | null;
  /** Push local → cloud and optionally rehydrate */
  syncNow: (opts?: { forceApply?: boolean }) => Promise<SyncPullResult | null>;
  /** Pull cloud → local (after login) */
  pullNow: () => Promise<SyncPullResult | null>;
  isOnline: boolean;
};

const SyncContext = createContext<SyncContextValue | null>(null);

const DEBOUNCE_MS = 2500;
const INTERVAL_MS = 5 * 60 * 1000; // 5 min background

export function SyncProgressProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<"local_only" | "cloud" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!isBrowser()) return;
    setLastSyncedAt(getLastSyncAt());
    setUserId(getCloudUserId());
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const syncNow = useCallback(
    async (opts?: { forceApply?: boolean }): Promise<SyncPullResult | null> => {
      if (!isBrowser()) return null;
      if (syncingRef.current) return null;
      if (!navigator.onLine) {
        setStatus("local_only");
        setMessage("أنت غير متصل — التقدم محفوظ على هذا الجهاز");
        return {
          ok: true,
          mode: "local_only",
          synced: false,
          message: "offline",
        };
      }

      syncingRef.current = true;
      // Quiet background sync: do not flip UI to "syncing" (avoids banner spam).
      // Only surface progress when the user/force path requests apply.
      if (opts?.forceApply) {
        setStatus("syncing");
      }
      setError(null);

      try {
        const snapshot = collectLocalSnapshot();
        const profile = loadProfile();
        const res = await fetch("/api/v1/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            deviceId: getOrCreateDeviceId(),
            guestKey: getOrCreateDeviceId(),
            userId: getCloudUserId() || undefined,
            name: profile.name,
            snapshot,
            clientVersion: 1,
          }),
        });

        let data: SyncPullResult;
        try {
          data = (await res.json()) as SyncPullResult;
        } catch {
          data = {
            ok: false,
            mode: "local_only",
            synced: false,
            error: res.status === 503 ? "الخادم غير متاح (أوفلاين)" : "استجابة غير صالحة",
          };
        }

        setMode(data.mode);
        setMessage(data.message || null);

        if (data.userId) {
          setCloudUserId(data.userId);
          setUserId(data.userId);
        }

        if (!res.ok && !data.ok) {
          setStatus("error");
          setError(
            data.error ||
              (res.status === 503
                ? "غير متصل — التقدم محفوظ محلياً"
                : `فشل المزامنة (${res.status})`)
          );
          return data;
        }

        if (data.ok && data.synced && data.snapshot) {
          // After server merge, replace collections (authoritative).
          // Soft cloud apply without force merges to protect offline locals.
          if (opts?.forceApply || data.mode === "cloud") {
            applyLocalSnapshot(data.snapshot, {
              replaceCollections: Boolean(opts?.forceApply),
            });
          }
          setLastSyncedAt(data.lastSyncedAt || new Date().toISOString());
          setStatus("ok");
          setError(null);
        } else if (data.ok && data.mode === "local_only") {
          setStatus("local_only");
          setMessage(
            data.message ||
              "الوضع المحلي — أضف DATABASE_URL للمزامنة السحابية"
          );
          setError(null);
        } else {
          setStatus("error");
          setError(data.error || "فشل المزامنة");
        }

        return data;
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message.includes("Failed to fetch")
              ? "تعذّر الاتصال — التقدم محفوظ على هذا الجهاز"
              : e.message
            : "network error";
        setStatus(navigator.onLine ? "error" : "local_only");
        setError(msg);
        setMessage(msg);
        return {
          ok: false,
          mode: "local_only",
          synced: false,
          error: msg,
        };
      } finally {
        syncingRef.current = false;
      }
    },
    []
  );

  const pullNow = useCallback(async () => {
    if (!isBrowser()) return null;
    if (!navigator.onLine) {
      setStatus("local_only");
      setMessage("غير متصل — لا يمكن السحب من السحابة الآن");
      return {
        ok: true,
        mode: "local_only" as const,
        synced: false,
        message: "offline",
      };
    }
    const deviceId = getOrCreateDeviceId();
    const uid = getCloudUserId();
    const qs = new URLSearchParams({
      deviceId,
      guestKey: deviceId,
      ...(uid ? { userId: uid } : {}),
    });
    setStatus("syncing");
    setError(null);
    try {
      const res = await fetch("/api/v1/sync?" + qs.toString(), {
        credentials: "include",
      });
      let data: SyncPullResult;
      try {
        data = (await res.json()) as SyncPullResult;
      } catch {
        setStatus("error");
        setError("استجابة سحب غير صالحة");
        return null;
      }
      if (data.ok && data.snapshot) {
        // Pull: merge by id so offline local rows are not wiped by empty cloud
        applyLocalSnapshot(data.snapshot, { replaceCollections: false });
        if (data.userId) {
          setCloudUserId(data.userId);
          setUserId(data.userId);
        }
        setLastSyncedAt(data.lastSyncedAt || new Date().toISOString());
        setStatus(data.mode === "local_only" ? "local_only" : "ok");
        setMode(data.mode);
        setMessage(data.message || null);
      } else {
        setStatus(data.mode === "local_only" ? "local_only" : "error");
        setMode(data.mode);
        setError(data.error || data.message || null);
      }
      return data;
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message.includes("Failed to fetch")
            ? "تعذّر الاتصال بالسحابة"
            : e.message
          : "pull failed";
      setStatus("error");
      setError(msg);
      return null;
    }
  }, []);

  // Debounced background sync when local data changes
  useEffect(() => {
    if (!isBrowser()) return;

    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void syncNow();
      }, DEBOUNCE_MS);
    };

    const events = [
      "hafiz-activity",
      "hafiz-mem-updated",
      "hafiz-profile-updated",
      "hafiz-journey-updated",
      "hafiz-recitation-progress",
      "hafiz-learning-snapshot-updated",
    ];
    events.forEach((e) => window.addEventListener(e, schedule));

    // Initial soft sync after mount
    const t = setTimeout(() => void syncNow(), 4000);
    const interval = setInterval(() => void syncNow(), INTERVAL_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, schedule));
      clearTimeout(t);
      clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [syncNow]);

  // Sync when coming back online
  useEffect(() => {
    if (!isBrowser()) return;
    const onOnline = () => void syncNow({ forceApply: false });
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [syncNow]);

  const value = useMemo<SyncContextValue>(
    () => ({
      status,
      lastSyncedAt,
      userId,
      mode,
      message,
      error,
      syncNow,
      pullNow,
      isOnline,
    }),
    [
      status,
      lastSyncedAt,
      userId,
      mode,
      message,
      error,
      syncNow,
      pullNow,
      isOnline,
    ]
  );

  return (
    <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
  );
}

export function useSyncProgress(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    // Safe default when provider missing (e.g. isolated story)
    return {
      status: "idle",
      lastSyncedAt: null,
      userId: null,
      mode: null,
      message: null,
      error: null,
      syncNow: async () => null,
      pullNow: async () => null,
      isOnline: true,
    };
  }
  return ctx;
}
