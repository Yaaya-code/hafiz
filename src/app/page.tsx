import Link from "next/link";
import {
  BookOpen,
  Cloud,
  Mic,
  Sparkles,
  Target,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Mic,
    title: "التسميع الصوتي المباشر",
    desc: "سَمّع آياتك بصوتك مع تصحيح لحظي للكلمات والخطأ.",
  },
  {
    icon: Target,
    title: "بنك الأخطاء والمراجعة",
    desc: "نظام يحدد نقاط الضعف والمتشابهات لضمان عدم نسيان ما حفظت.",
  },
  {
    icon: Sparkles,
    title: "اختبارات وتحديات ذكية",
    desc: "اختبارات تفاعلية متعددة مستويات الصعوبة لترسيخ الحفظ.",
  },
  {
    icon: Cloud,
    title: "مزامنة سحابية كاملة",
    desc: "حفظك ومستواك متصلان دائماً عبر جميع أجهزتك.",
  },
];

const quietValues = [
  "تسميع آلي دقيق بالذكاء الاصطناعي",
  "مراجعة ذكية قائمة على نقاط ضعفك",
  "جدول يومي متكيف مع قدرتك على الحفظ",
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-[#020408] text-white">
      {/* Header — logo + auth only */}
      <header className="sticky top-0 z-50 border-b border-[#D4AF37]/10 bg-[#020408]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="حافظ"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl object-cover shadow-md shadow-[0_0_18px_rgba(212,175,55,0.35)] ring-1 ring-[#D4AF37]/40"
            />
            <span className="text-lg font-bold tracking-tight">حافظ</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-xl px-3 sm:px-4 text-sm font-medium text-[#CBD5E1] hover:bg-[#D4AF37]/10 hover:text-white transition-colors"
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-10 items-center rounded-xl bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] px-3 sm:px-4 text-sm font-semibold text-[#020408] shadow-lg shadow-[0_0_20px_rgba(212,175,55,0.25)]"
            >
              إنشاء حساب
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.18), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-16 text-center md:pb-24 md:pt-24">
          <p className="mb-6 text-xs font-medium tracking-wide text-[#D4AF37]/90 sm:text-sm">
            مجاني بالكامل · لخدمة كتاب الله
          </p>
          <h1 className="text-3xl font-extrabold leading-[1.35] tracking-tight sm:text-4xl md:text-5xl">
            حافظ — رفيقك الذكي لحفظ القرآن الكريم ومراجعته
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#CBD5E1]/85 sm:text-lg">
            منصة تفاعلية تساعدك على ضبط حفظك، التسميع الصوتي المباشر، وتتبع
            مراجعتك اليومية بدقة وسهولة.
          </p>
          <div className="mt-10">
            <Link
              href="/signup"
              className="inline-flex h-12 min-w-[12rem] items-center justify-center rounded-2xl bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] px-8 text-base font-bold text-[#020408] shadow-xl shadow-[0_0_28px_rgba(212,175,55,0.3)] transition hover:brightness-110 active:scale-[0.98]"
            >
              ابدأ رحلتك الآن
            </Link>
          </div>

          {/* Quiet value strip */}
          <div className="mx-auto mt-14 flex max-w-3xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
            {quietValues.map((v) => (
              <span
                key={v}
                className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-4 py-2 text-xs text-[#f0d78c]/90 sm:text-[13px]"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Core features */}
      <section className="border-t border-[#D4AF37]/10 bg-[#0A0F1A]/50 py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">لماذا حافظ؟</h2>
            <p className="mt-3 text-sm text-[#CBD5E1]/70 md:text-base">
              أدوات هادئة وعملية — تركز على الإتقان لا على التعقيد
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <Card
                key={f.title}
                className="border-[#D4AF37]/15 bg-[#0A0F1A]/80 transition-all hover:border-[#D4AF37]/35 hover:shadow-[0_0_24px_rgba(212,175,55,0.12)]"
              >
                <CardContent className="p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#D4AF37]/12 text-[#D4AF37]">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#CBD5E1]/75">
                    {f.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Soft closing CTA */}
      <section className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
        <BookOpen className="mx-auto h-9 w-9 text-[#D4AF37]/80" />
        <h2 className="mt-4 text-2xl font-bold md:text-3xl">
          ابدأ رحلتك مع كتاب الله اليوم
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#CBD5E1]/75 md:text-base">
          أنشئ حساباً مجانياً، واحصل على ورد يومي وتسميع ومراجعة تلائم مستواك.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-[#9a7b2c] to-[#D4AF37] px-8 text-base font-bold text-[#020408] shadow-lg shadow-[0_0_24px_rgba(212,175,55,0.25)]"
        >
          ابدأ رحلتك الآن
        </Link>
      </section>

      {/* Sadaqah jariyah dedication */}
      <section className="border-t border-[#D4AF37]/10 px-4 py-12">
        <div className="mx-auto max-w-2xl rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-b from-[#D4AF37]/8 to-transparent px-6 py-8 text-center">
          <p className="text-[11px] font-medium tracking-wide text-[#D4AF37]/90">
            صدقة جارية
          </p>
          <p className="mt-3 text-sm leading-loose text-[#CBD5E1]/85 md:text-[15px]">
            هذا العمل صدقة جارية، نسأل الله أن يتقبّله خالصاً لوجهه الكريم، وأن
            يجعله في ميزان حسناتي ولوالديّ.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#D4AF37]/10 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 text-sm text-[#CBD5E1]/55 sm:flex-row">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg object-cover opacity-90"
            />
            <span>حافظ © {new Date().getFullYear()}</span>
          </div>
          <p className="text-center text-xs sm:text-sm">
            مجاني بالكامل · مبني بعناية لخدمة كتاب الله
          </p>
        </div>
      </footer>
    </div>
  );
}
