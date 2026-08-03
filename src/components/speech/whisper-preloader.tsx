"use client";

/**
 * Silent background preload of free in-browser Whisper (WASM).
 * Runs after first paint on mobile only — never blocks UI / navigation.
 *
 * Uses requestIdleCallback (or delayed setTimeout) so scroll/click stay smooth.
 * Model files are cached by the browser (Cache API / HTTP cache) for next visits.
 * Does NOT use Service Worker for inference (SW can't easily run ONNX here);
 * SW/PWA still helps cache static assets of the app shell.
 */

import { useEffect, useRef } from "react";
import {
  isMobileSpeechEnvironment,
} from "@/lib/quran/speech-recognition";
import { isWasmSpeechSupported } from "@/lib/quran/wasm-whisper-session";

const PRELOAD_FLAG = "hafiz_whisper_preload_v1";

function scheduleIdle(fn: () => void, timeoutMs: number) {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & {
    requestIdleCallback?: (
      cb: (deadline: { timeRemaining: () => number }) => void,
      opts?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(
      () => {
        fn();
      },
      { timeout: timeoutMs }
    );
    return () => w.cancelIdleCallback?.(id);
  }

  const t = window.setTimeout(fn, Math.min(timeoutMs, 2500));
  return () => window.clearTimeout(t);
}

export function WhisperPreloader() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (typeof window === "undefined") return;

    // Desktop uses Web Speech — no need to download Whisper
    if (!isMobileSpeechEnvironment()) return;
    if (!isWasmSpeechSupported()) return;

    // Already preloaded this browser session
    try {
      if (sessionStorage.getItem(PRELOAD_FLAG) === "1") return;
    } catch {
      /* private mode */
    }

    started.current = true;

    // Wait for first paint + a bit of idle time so home/dashboard stays snappy
    const cancel = scheduleIdle(() => {
      // Double-rAF ensures we're past first meaningful paint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void (async () => {
            try {
              // Dynamic import — code-split, main bundle stays light
              const { preloadWhisperModel } = await import(
                "@/lib/quran/wasm-whisper-session"
              );
              await preloadWhisperModel(() => {
                // Silent: no UI toast. Network runs in background.
              });
              try {
                sessionStorage.setItem(PRELOAD_FLAG, "1");
              } catch {
                /* ignore */
              }
            } catch {
              // Soft fail — user can still load on "ابدأ التسميع"
            }
          })();
        });
      });
    }, 4000);

    return cancel;
  }, []);

  return null;
}
