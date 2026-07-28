"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Registers the service worker and optional install prompt (PWA).
 * Works on desktop Chrome/Edge and Android Chrome.
 */
export function PwaRegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Service worker — register in production; also allow localhost testing
    if ("serviceWorker" in navigator) {
      const allowSw =
        process.env.NODE_ENV === "production" ||
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1";
      if (allowSw) {
        navigator.serviceWorker.register("/sw.js").catch(() => {
          /* ignore reg failures */
        });
      }
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const onInstalled = () => {
      setShowInstall(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    setShowInstall(false);
  }

  if (!showInstall || !deferred) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 mx-auto max-w-md rounded-2xl border border-[#D4AF37]/30 bg-card/95 p-4 shadow-xl backdrop-blur">
      <p className="text-sm font-medium">ثبّت تطبيق حافظ على جهازك</p>
      <p className="mt-1 text-xs text-muted-foreground">
        يعمل بدون اتصال جزئياً — مثالي للمراجعة اليومية
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="premium" size="sm" onClick={install}>
          تثبيت
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowInstall(false)}
        >
          لاحقاً
        </Button>
      </div>
    </div>
  );
}
