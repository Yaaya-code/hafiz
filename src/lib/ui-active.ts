/**
 * Universal "Shining Metallic Gold" — True Kiswa.
 * Never use flat gold alone; always pair text with drop-shadow glow.
 */

/** Glowing gold text/icons (never flat) */
export const SHINE_GOLD_TEXT =
  "text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold";

/**
 * Ultimate glowing active state — matches «ابدأ منهج الاستماع» energy.
 * Use on active tabs, selected cards, sidebar links, badges.
 */
export const ACTIVE_GOLD =
  "bg-[#D4AF37]/10 border border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.6)] ring-1 ring-[#D4AF37]/50 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold backdrop-blur-md";

/** Soft pill / badge active */
export const ACTIVE_GOLD_SOFT = ACTIVE_GOLD;

/** Inactive selectable surface + hyper hover */
export const INACTIVE_SURFACE =
  "border border-[#D4AF37]/15 bg-[#0A0F1A]/50 text-[#CBD5E1] hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/5";

/** Solid gold CTA fill with glow */
export const GOLD_FILL =
  "bg-[#D4AF37] text-[#020408] shadow-[0_0_20px_rgba(212,175,55,0.6)] ring-1 ring-[#D4AF37]/50";

export const GOLD_BORDER = "border-[#D4AF37]/15";

/**
 * Hyper-interactive hover: lift, scale, cinematic gold glow, metallic shine sweep.
 */
export const HYPER_INTERACTIVE =
  "relative overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-2 hover:scale-[1.03] hover:shadow-[0_15px_40px_-10px_rgba(212,175,55,0.5)] after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-to-tr after:from-transparent after:via-white/5 after:to-transparent after:translate-x-[-100%] hover:after:translate-x-[100%] after:transition-transform after:duration-700";

/** Icon micro-bounce on group hover */
export const ICON_BOUNCE =
  "transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3";
