"use client";

import { useEffect, useState } from "react";
import { Bell, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatArabicNumber, cn } from "@/lib/utils";
import Link from "next/link";
import { useHafizProfile } from "@/hooks/use-hafiz-profile";
import { useAuth } from "@/hooks/use-auth";
import { useSyncProgress } from "@/hooks/use-sync-progress";
import {
  buildPersonalizedReminders,
  displayName,
} from "@/lib/user-profile";
import { SHINE_GOLD_TEXT } from "@/lib/ui-active";
import { loadStreak } from "@/lib/user-activity";
import {
  computeLocalHafizScore,
  type LocalScoreMemoryHint,
} from "@/lib/hafiz-score";
import {
  getLearningSnapshot,
  LEARNING_SNAPSHOT_EVENT,
} from "@/application";

export function AppHeader({ onMenu }: { onMenu?: () => void }) {
  const { profile, ready } = useHafizProfile();
  const auth = useAuth();
  const sync = useSyncProgress();
  const name = ready
    ? displayName(profile)
    : auth.user?.name || "صديق القرآن";
  const accountSynced =
    Boolean(auth.user) &&
    auth.databaseConfigured &&
    sync.isOnline &&
    (sync.status === "ok" || sync.status === "idle" || sync.mode === "cloud");

  const [streak, setStreak] = useState(0);
  const [hafizScore, setHafizScore] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      const s = loadStreak();
      setStreak(s.current);
      let memory: LocalScoreMemoryHint[] | undefined;
      try {
        memory = getLearningSnapshot().revisionMemory as LocalScoreMemoryHint[];
      } catch {
        memory = undefined;
      }
      setHafizScore(computeLocalHafizScore(memory));
      setReminderCount(buildPersonalizedReminders(profile).length);
    };
    refresh();
    window.addEventListener("hafiz-activity", refresh);
    window.addEventListener("hafiz-mem-updated", refresh);
    window.addEventListener("hafiz-profile-updated", refresh);
    window.addEventListener(LEARNING_SNAPSHOT_EVENT, refresh);
    return () => {
      window.removeEventListener("hafiz-activity", refresh);
      window.removeEventListener("hafiz-mem-updated", refresh);
      window.removeEventListener("hafiz-profile-updated", refresh);
      window.removeEventListener(LEARNING_SNAPSHOT_EVENT, refresh);
    };
  }, [profile]);

  return (
    <header className="sticky top-0 z-40 flex h-14 sm:h-16 min-w-0 items-center justify-between gap-2 sm:gap-4 border-b border-[#D4AF37]/10 bg-[#020408]/90 px-3 sm:px-4 backdrop-blur-2xl md:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-11 w-11 shrink-0 touch-manipulation"
          onClick={onMenu}
          aria-label="القائمة"
        >
          <Menu className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" />
        </Button>
        <div className="min-w-0">
          <p className="hidden sm:block text-sm text-[#CBD5E1]/70">
            مرحباً بعودتك
          </p>
          <p className="truncate max-w-[9rem] sm:max-w-[14rem] font-semibold leading-tight text-white text-sm sm:text-base transition-all duration-300 hover:text-[#D4AF37] hover:drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]">
            {name}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {/* Compact streak on small phones */}
        <div
          className={cn(
            "flex sm:hidden items-center gap-1 rounded-full px-2 py-1 text-[10px]",
            "bg-[#D4AF37]/10 border border-[#D4AF37]/40"
          )}
          title="السلسلة"
        >
          <span className={SHINE_GOLD_TEXT}>
            🔥 {formatArabicNumber(streak)}
          </span>
        </div>
        <div
          className={cn(
            "hidden md:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs",
            "bg-[#D4AF37]/10 border border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.6)] ring-1 ring-[#D4AF37]/50 backdrop-blur-md",
            "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:scale-[1.03] hover:shadow-[0_15px_40px_-10px_rgba(212,175,55,0.5)]"
          )}
        >
          <span className="text-[#CBD5E1]/70">سلسلة</span>
          <span className={cn(SHINE_GOLD_TEXT, "animate-pulse")}>
            🔥 {formatArabicNumber(streak)}
          </span>
          <span className="mx-1 text-slate-700">|</span>
          <span className="text-[#CBD5E1]/70">درجة الحافظ</span>
          <span className={SHINE_GOLD_TEXT}>
            {formatArabicNumber(hafizScore)}
          </span>
        </div>

        {auth.user && (
          <span
            className={cn(
              "hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] sm:text-[11px]",
              accountSynced
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : !sync.isOnline
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                  : "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#f0d78c]"
            )}
            title={
              accountSynced
                ? "الحساب متصل ومُزامن"
                : !sync.isOnline
                  ? "غير متصل — سيُحفظ التقدم عند عودة الشبكة"
                  : "جاري الاتصال…"
            }
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                accountSynced
                  ? "bg-emerald-400"
                  : !sync.isOnline
                    ? "bg-amber-400"
                    : "bg-[#D4AF37] animate-pulse"
              )}
            />
            {accountSynced
              ? "الحساب متصل ومُزامن"
              : !sync.isOnline
                ? "غير متصل"
                : "متصل"}
          </span>
        )}

        <ThemeToggle />

        <Link
          href="/settings"
          aria-label="الإعدادات والتذكيرات"
          className="group relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:scale-110 hover:bg-[#D4AF37]/10 hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]"
          title="الإعدادات"
        >
          <Bell className="h-4 w-4 text-[#CBD5E1] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12 group-hover:text-[#D4AF37] group-hover:drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
          {reminderCount > 0 && (
            <span className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.8)] animate-pulse" />
          )}
        </Link>

        <Link
          href="/settings"
          className="flex items-center gap-2 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:scale-105 active:scale-95"
        >
          <Avatar name={name} className="h-9 w-9" />
        </Link>
      </div>
    </header>
  );
}
