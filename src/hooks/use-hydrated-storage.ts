"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isBrowser,
  safeGetJSON,
  safeSetJSON,
  emitStorageEvent,
} from "@/lib/storage/safe-storage";

/**
 * Safe localStorage state for Next.js App Router.
 *
 * - First render always uses `fallback` (matches SSR HTML)
 * - After mount, reads from localStorage
 * - Writes optimistically to localStorage + state
 * - Optional cross-tab / custom-event sync
 */
export function useHydratedStorage<T>(
  key: string,
  fallback: T,
  options?: {
    /** Custom event name to listen for external updates */
    eventName?: string;
    /** Also listen to window "storage" (other tabs) */
    crossTab?: boolean;
  }
): {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  hydrated: boolean;
  refresh: () => void;
} {
  const [value, setValueState] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    if (!isBrowser()) return;
    setValueState(safeGetJSON<T>(key, fallback));
  }, [key, fallback]);

  useEffect(() => {
    setValueState(safeGetJSON<T>(key, fallback));
    setHydrated(true);

    const onCustom = () => {
      setValueState(safeGetJSON<T>(key, fallback));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) {
        setValueState(safeGetJSON<T>(key, fallback));
      }
    };

    if (options?.eventName) {
      window.addEventListener(options.eventName, onCustom);
    }
    if (options?.crossTab !== false) {
      window.addEventListener("storage", onStorage);
    }

    return () => {
      if (options?.eventName) {
        window.removeEventListener(options.eventName, onCustom);
      }
      if (options?.crossTab !== false) {
        window.removeEventListener("storage", onStorage);
      }
    };
    // fallback intentionally omitted if it's an unstable object reference —
    // callers should pass stable defaults or primitives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, options?.eventName, options?.crossTab]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const valueNext = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        safeSetJSON(key, valueNext);
        if (options?.eventName) {
          emitStorageEvent(options.eventName, valueNext);
        }
        return valueNext;
      });
    },
    [key, options?.eventName]
  );

  return { value, setValue, hydrated, refresh };
}

/**
 * Run a loader only after mount. First paint uses `fallback`.
 * Ideal for stores that already expose loadX() helpers.
 */
export function useClientStore<T>(
  load: () => T,
  fallback: T,
  eventNames: string[] = []
): { data: T; ready: boolean; refresh: () => void } {
  const [data, setData] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    if (!isBrowser()) return;
    setData(load());
  }, [load]);

  useEffect(() => {
    setData(load());
    setReady(true);
    const handlers = eventNames.map((name) => {
      const fn = () => setData(load());
      window.addEventListener(name, fn);
      return { name, fn };
    });
    return () => {
      handlers.forEach(({ name, fn }) => window.removeEventListener(name, fn));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, eventNames.join("|")]);

  return { data, ready, refresh };
}
