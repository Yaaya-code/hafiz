import { PlanRevealView } from "@/components/onboarding/plan-reveal-view";

export const metadata = {
  title: "خطتك الشخصية | حافظ",
  description: "كشف خطتك المبنية من محرّك حافظ بعد الإعداد",
};

/**
 * First-time wow route (outside main app chrome for focus).
 * After onboarding → /plan-reveal → dashboard / journey.
 */
export default function PlanRevealPage() {
  return (
    <div className="min-h-screen bg-[#020408] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.12),_transparent_55%)]" />
      <div className="relative">
        <header className="border-b border-[#D4AF37]/15 px-4 py-4">
          <div className="mx-auto max-w-3xl flex items-center justify-between">
            <span className="text-sm font-bold tracking-wide text-[#D4AF37]">
              حافظ
            </span>
            <span className="text-xs text-[#CBD5E1]/60">خطتك الشخصية</span>
          </div>
        </header>
        <PlanRevealView />
      </div>
    </div>
  );
}
