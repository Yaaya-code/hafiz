"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Settings,
  Headphones,
  Mic,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTIVE_GOLD, ICON_BOUNCE, SHINE_GOLD_TEXT } from "@/lib/ui-active";

/** Simplified primary nav — Phase A simple UX */
const primaryNav = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/dashboard#direct", label: "تسميع مباشر", icon: Mic },
  { href: "/dashboard#talqeen", label: "تلقين", icon: Headphones },
  { href: "/mistakes", label: "الأخطاء", icon: AlertTriangle },
];

const otherNav = [
  { href: "/settings", label: "الإعدادات", icon: Settings },
  {
    href: "/plans/journey",
    label: "المزيد (رحلة اليوم)",
    icon: MoreHorizontal,
  },
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
          <p className="text-xs text-[#CBD5E1]/70 mt-1">تسميع وتلقين مبسّط</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <p className="mb-2 px-3 text-[11px] font-semibold text-[#CBD5E1]/50">
            ابدأ هنا
          </p>
          <ul className="space-y-1">
            {primaryNav.map((item) => {
              const isHome = item.href === "/dashboard";
              const isActive = isHome
                ? pathname === "/dashboard"
                : !item.href.includes("#") &&
                  (pathname === item.href ||
                    pathname.startsWith(item.href + "/"));
              return (
                <li key={item.href + item.label}>
                  <NavLink
                    {...item}
                    active={isActive}
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
      </nav>

      <div className="border-t border-[#D4AF37]/10 p-4">
        <div className="rounded-2xl border border-[#D4AF37]/15 bg-[#0A0F1A]/90 p-4 backdrop-blur-2xl">
          <p className={cn("text-sm font-medium", SHINE_GOLD_TEXT)}>
            ابدأ فوراً
          </p>
          <p className="mt-2 text-xs text-[#CBD5E1]/70 leading-relaxed">
            اختر سورة ونطاقاً من الرئيسية — تسميع أو تلقين.
          </p>
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className={cn(
              "mt-3 inline-flex text-xs transition-all duration-300 hover:scale-105",
              SHINE_GOLD_TEXT
            )}
          >
            الرئيسية ←
          </Link>
        </div>
      </div>
    </aside>
  );
}
