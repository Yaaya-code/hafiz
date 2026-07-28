"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  Home,
  Settings,
  Sparkles,
  Target,
  BarChart3,
  Headphones,
  BookText,
  Sprout,
  AlertTriangle,
  Trophy,
  ClipboardCheck,
  BookOpen,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTIVE_GOLD, ICON_BOUNCE, SHINE_GOLD_TEXT } from "@/lib/ui-active";

const studentNav = [
  { href: "/dashboard", label: "لوحة التحكم", icon: Home },
  { href: "/plans/journey", label: "رحلة اليوم", icon: GraduationCap },
  { href: "/quran", label: "القرآن", icon: BookText },
  { href: "/plans/revision", label: "ورد المراجعة", icon: BookOpen },
  { href: "/plans/new", label: "ورد الحفظ", icon: Sprout },
  { href: "/listen-memorize", label: "الحفظ بالاستماع", icon: Headphones },
  { href: "/mutashabihat", label: "المتشابهات", icon: Sparkles },
  { href: "/mistakes", label: "الأخطاء", icon: AlertTriangle },
  { href: "/quiz", label: "الاختبارات", icon: ClipboardCheck },
  { href: "/qaris", label: "القرّاء", icon: Headphones },
  { href: "/stats", label: "الإحصائيات", icon: BarChart3 },
  { href: "/achievements", label: "الإنجازات", icon: Trophy },
  { href: "/goals", label: "الأهداف", icon: Target },
];

const otherNav = [
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm border-s-4 cursor-pointer touch-manipulation transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
        active
          ? cn(ACTIVE_GOLD, "border-s-[#D4AF37]")
          : "text-[#CBD5E1]/70 border-transparent hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] hover:drop-shadow-[0_0_8px_rgba(212,175,55,0.6)] active:bg-[#D4AF37]/15"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          ICON_BOUNCE,
          "group-hover:-translate-x-2",
          active && SHINE_GOLD_TEXT
        )}
      />
      <span
        className={cn(
          "transition-transform duration-300 ease-in-out group-hover:-translate-x-2",
          active && "drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]"
        )}
      >
        {label}
      </span>
    </Link>
  );
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-full max-w-[18rem] sm:w-64 flex-col border-r border-[#D4AF37]/10 bg-[#020408]">
      <div className="flex items-center gap-3 border-b border-[#D4AF37]/10 px-5 py-5 group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="حافظ"
          width={40}
          height={40}
          className="h-10 w-10 rounded-2xl object-cover shadow-[0_0_20px_rgba(212,175,55,0.55)] ring-1 ring-[#D4AF37]/50 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(212,175,55,0.7)]"
        />
        <div>
          <p className="font-bold text-lg leading-none text-white">حافظ</p>
          <p className="text-xs text-[#CBD5E1]/70 mt-1">رفيق الحفظ والمراجعة</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <p className="mb-2 px-3 text-[11px] font-semibold text-[#CBD5E1]/50">
            رحلة القرآن
          </p>
          <ul className="space-y-1">
            {studentNav.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <NavLink
                    {...item}
                    active={active}
                    onNavigate={onNavigate}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="mb-2 px-3 text-[11px] font-semibold text-[#CBD5E1]/50">
            الحساب
          </p>
          <ul className="space-y-1">
            {otherNav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <NavLink
                    {...item}
                    active={active}
                    onNavigate={onNavigate}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="border-t border-[#D4AF37]/10 p-4">
        <div
          className={cn(
            "group cursor-pointer rounded-2xl border border-[#D4AF37]/15 bg-[#0A0F1A]/90 p-4 backdrop-blur-2xl",
            "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
            "hover:-translate-y-2 hover:scale-[1.03] hover:border-[#D4AF37] hover:shadow-[0_15px_40px_-10px_rgba(212,175,55,0.5)] hover:bg-gradient-to-br hover:from-[#0A0F1A] hover:to-[#D4AF37]/5",
            "relative overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-to-tr after:from-transparent after:via-white/5 after:to-transparent after:translate-x-[-100%] hover:after:translate-x-[100%] after:transition-transform after:duration-700"
          )}
        >
          <div className={cn("relative z-[2] flex items-center gap-2 text-sm", SHINE_GOLD_TEXT)}>
            <Brain className={cn("h-4 w-4", ICON_BOUNCE, "group-hover:-translate-x-2")} />
            وردك اليوم
          </div>
          <p className="relative z-[2] mt-2 text-xs text-[#CBD5E1]/70 leading-relaxed group-hover:text-[#CBD5E1] transition-colors duration-300">
            ابدأ رحلة اليوم: مراجعة ثم حفظ ثم استماع.
          </p>
          <Link
            href="/plans/journey"
            onClick={onNavigate}
            className={cn(
              "relative z-[2] mt-3 inline-flex text-xs transition-all duration-300 hover:scale-105",
              SHINE_GOLD_TEXT
            )}
          >
            افتح رحلة اليوم ←
          </Link>
        </div>
      </div>
    </aside>
  );
}
