"use client";

import { useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { SyncStatusBanner } from "@/components/sync-status-banner";
import { WhisperPreloader } from "@/components/speech/whisper-preloader";
import { cn } from "@/lib/utils";

/** True Kiswa canvas — seamless deep obsidian */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen max-w-[100vw] overflow-x-hidden bg-[#020408] text-foreground">
      {/* Silent mobile Whisper model preload — after idle, never blocks UI */}
      <WhisperPreloader />
      <div className="hidden lg:block sticky top-0 h-screen z-20 shrink-0">
        <AppSidebar />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute inset-y-0 start-0 w-[min(18rem,88vw)] max-w-full shadow-2xl shadow-black/60 animate-in slide-in-from-right duration-300"
            role="dialog"
            aria-modal="true"
            aria-label="قائمة التنقل"
          >
            <AppSidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden bg-[#020408]">
        <AppHeader onMenu={() => setOpen(true)} />
        <SyncStatusBanner />
        <main
          className={cn(
            "flex-1 w-full min-w-0 max-w-6xl xl:max-w-7xl mx-auto",
            "px-3 sm:px-4 md:px-8 py-4 sm:py-6 page-enter",
            // Safe area for notched phones (PWA standalone)
            "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
