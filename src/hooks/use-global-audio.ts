"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  isGlobalAudioPlaying,
  playGlobalAudio,
  stopGlobalAudio,
  pauseGlobalAudio,
} from "@/lib/audio/global-audio";

/**
 * Global audio controls + auto-stop when the route changes.
 */
export function useGlobalAudio() {
  const pathname = usePathname();
  const [playing, setPlaying] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  // Tear down audio on every navigation
  useEffect(() => {
    stopGlobalAudio();
    setPlaying(false);
    setCurrentUrl(null);
    return () => {
      stopGlobalAudio();
    };
  }, [pathname]);

  useEffect(() => {
    const onPlay = (e: Event) => {
      const detail = (e as CustomEvent<{ url: string }>).detail;
      setPlaying(true);
      setCurrentUrl(detail?.url ?? null);
    };
    const onStop = () => {
      setPlaying(false);
      setCurrentUrl(null);
    };
    window.addEventListener("hafiz-audio-play", onPlay);
    window.addEventListener("hafiz-audio-stop", onStop);
    return () => {
      window.removeEventListener("hafiz-audio-play", onPlay);
      window.removeEventListener("hafiz-audio-stop", onStop);
    };
  }, []);

  const play = useCallback(
    (
      url: string,
      opts?: {
        onEnded?: () => void;
        onError?: (message: string) => void;
        loop?: boolean;
      }
    ) => {
      return playGlobalAudio(url, {
        ...opts,
        onEnded: () => {
          setPlaying(false);
          setCurrentUrl(null);
          opts?.onEnded?.();
        },
        onError: (msg) => {
          setPlaying(false);
          setCurrentUrl(null);
          opts?.onError?.(msg);
        },
      });
    },
    []
  );

  const stop = useCallback(() => {
    stopGlobalAudio();
    setPlaying(false);
    setCurrentUrl(null);
  }, []);

  const pause = useCallback(() => {
    pauseGlobalAudio();
    setPlaying(false);
  }, []);

  return {
    play,
    stop,
    pause,
    playing: playing || isGlobalAudioPlaying(),
    currentUrl,
  };
}
