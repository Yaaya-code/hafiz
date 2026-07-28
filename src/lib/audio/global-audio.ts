/**
 * App-wide audio singleton — only one track may play at a time.
 * Used by Quran reader, Qari previews, listen-memorize, revision sessions.
 *
 * Offline / network failure: soft toast event + optional fallbackUrl;
 * never throws — session UI stays intact.
 */

type EndHandler = () => void;

let current: HTMLAudioElement | null = null;
let generation = 0;
let onEndHandler: EndHandler | null = null;

export function isBrowserAudio(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

function isNavigatorOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function emitAudioNotice(message: string, kind: "offline" | "error" | "fallback") {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("hafiz-audio-notice", {
        detail: { message, kind, at: Date.now() },
      })
    );
  } catch {
    /* ignore */
  }
}

/** Hard-stop and clear any playing audio across the app */
export function stopGlobalAudio(): void {
  generation += 1;
  onEndHandler = null;
  if (!current) {
    emitStop();
    return;
  }
  try {
    current.onended = null;
    current.onerror = null;
    current.onpause = null;
    current.pause();
    current.removeAttribute("src");
    current.load();
  } catch {
    /* ignore teardown errors */
  }
  current = null;
  emitStop();
}

function emitStop() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("hafiz-audio-stop"));
}

function emitPlay(url: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("hafiz-audio-play", { detail: { url } }));
}

export type PlayGlobalAudioOpts = {
  onEnded?: EndHandler;
  onError?: (message: string) => void;
  loop?: boolean;
  /** Second URL if primary fails (e.g. Alafasy) — keeps scoped session alive */
  fallbackUrl?: string;
};

/**
 * Play a single URL. Stops any previous track first.
 * Returns the Audio element, or null if not in browser / play failed setup.
 *
 * Same-URL re-request (e.g. surah-mode qari playing ayah 1 then 2 of same file)
 * reuses the current element without restarting from the beginning.
 */
export function playGlobalAudio(
  url: string,
  opts?: PlayGlobalAudioOpts
): HTMLAudioElement | null {
  if (!isBrowserAudio()) return null;

  if (isNavigatorOffline()) {
    emitAudioNotice(
      "أنت غير متصل — الصوت يحتاج شبكة. تقدّم الجلسة والنص محفوظان محلياً.",
      "offline"
    );
    // Still attempt play (browser cache / service worker may serve);
    // if it fails, onError path below stays soft.
  }

  // Surah-mode: sequential ayah clicks share one file — keep playing
  if (current && !current.paused && current.src) {
    try {
      const curPath = new URL(current.src).pathname;
      const nextPath = new URL(url, "https://local.invalid").pathname;
      if (curPath === nextPath || current.src === url) {
        onEndHandler = opts?.onEnded ?? onEndHandler;
        return current;
      }
    } catch {
      if (current.src.includes(url) || url.includes(current.src)) {
        onEndHandler = opts?.onEnded ?? onEndHandler;
        return current;
      }
    }
  }

  stopGlobalAudio();
  const gen = generation;

  const startTrack = (src: string, isFallback: boolean): HTMLAudioElement | null => {
    if (gen !== generation) return null;
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.loop = Boolean(opts?.loop);
    current = audio;
    onEndHandler = opts?.onEnded ?? null;

    audio.onended = () => {
      if (gen !== generation) return;
      current = null;
      const h = onEndHandler;
      onEndHandler = null;
      h?.();
      emitStop();
    };

    const failSoft = (msg: string) => {
      if (gen !== generation) return;
      // Try fallback once if primary failed
      if (!isFallback && opts?.fallbackUrl && opts.fallbackUrl !== src) {
        emitAudioNotice(
          "تعذّر صوت القارئ — التحويل لقارئ احتياطي…",
          "fallback"
        );
        startTrack(opts.fallbackUrl, true);
        return;
      }
      current = null;
      onEndHandler = null;
      const soft =
        isNavigatorOffline()
          ? "انقطع الاتصال — أعد المحاولة عند عودة الشبكة. الجلسة لم تُلغَ."
          : msg || "تعذّر تشغيل الملف الصوتي";
      emitAudioNotice(soft, isNavigatorOffline() ? "offline" : "error");
      opts?.onError?.(soft);
      emitStop();
    };

    audio.onerror = () => failSoft("تعذّر تشغيل الملف الصوتي");

    emitPlay(src);
    void audio.play().catch((err) => {
      failSoft(
        err instanceof Error ? err.message : "تعذّر التشغيل — تحقق من الاتصال"
      );
    });

    return audio;
  };

  return startTrack(url, false);
}

export function getGlobalAudioElement(): HTMLAudioElement | null {
  return current;
}

export function isGlobalAudioPlaying(): boolean {
  return Boolean(current && !current.paused);
}

export function pauseGlobalAudio(): void {
  if (current && !current.paused) {
    current.pause();
    emitStop();
  }
}
