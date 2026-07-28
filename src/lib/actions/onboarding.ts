"use server";

import type { MemorizationSelection } from "@/lib/quran/types";
import { getSurah } from "@/lib/quran/surahs";
import { memSummaryAr } from "@/lib/memorization-summary";
import type { JourneyAnswers, OnboardingPayload } from "@/lib/onboarding-types";

// Re-export types only (values from this file must be async server actions)
export type { JourneyAnswers, OnboardingPayload };

const strengthLabelAr: Record<number, string> = {
  1: "ضعيف ويتفلّت",
  2: "يحتاج تثبيتاً",
  3: "متوسط — يحتاج انتظاماً",
  4: "متقن وثابت",
  5: "متقن وثابت جداً",
};

function countMemorizedUnits(sel: MemorizationSelection): number {
  if (sel.surahSelections.length) {
    return Math.max(
      1,
      sel.surahSelections.reduce((sum, s) => {
        const meta = getSurah(s.surah);
        return sum + (meta ? Math.ceil(meta.ayahCount / 15) : 1);
      }, 0)
    );
  }
  if (sel.mode === "JUZ") return Math.max(1, sel.juzSelections.length * 20);
  if (sel.mode === "RANGE" && sel.range) {
    return Math.max(1, (sel.range.toSurah - sel.range.fromSurah + 1) * 10);
  }
  return 1;
}

export async function saveOnboardingAction(payload: OnboardingPayload) {
  const memorizedUnits = countMemorizedUnits(payload.memorizationSelection);
  const surahCount = payload.memorizationSelection.surahSelections.length;

  const styleMultiplier =
    payload.revisionStyle === "intensive"
      ? 1.35
      : payload.revisionStyle === "light"
        ? 0.75
        : 1;

  const strengthMultiplier =
    payload.memorizationStrength <= 2
      ? 1.2
      : payload.memorizationStrength >= 4
        ? 0.9
        : 1;

  const revisionShare =
    payload.revisionStyle === "intensive"
      ? 0.72
      : payload.revisionStyle === "light"
        ? 0.55
        : 0.65;

  const revisionMinutes = Math.round(payload.dailyMinutes * revisionShare);
  const newMinutes = Math.max(0, payload.dailyMinutes - revisionMinutes);

  const dailyRevisionPages = Math.max(
    1,
    Math.round((revisionMinutes / 3) * styleMultiplier * strengthMultiplier)
  );

  const sessionLength = Math.max(
    10,
    Math.round(
      payload.dailyMinutes / Math.max(1, payload.revisionSessionsPerDay)
    )
  );

  const daysToCoverMemorized = Math.ceil(
    memorizedUnits / Math.max(1, dailyRevisionPages)
  );

  const primaryGoal =
    payload.goals[0] || "بناء عادة يومية منتظمة مع القرآن";

  const focus: string[] = [];
  if (surahCount === 0) {
    focus.push("نبدأ معك بلطف: تثبيت الفاتحة والسور القصار ثم التوسّع");
  } else {
    focus.push("أولوية لتثبيت ما حفظت قبل الإكثار من الجديد");
  }
  if (payload.memorizationStrength <= 2) {
    focus.push("مراجعة أهدأ ومتكررة — الأجر مضاعف مع المشقّة");
  }
  if (payload.learningStyle === "LISTENING" || payload.learningStyle === "LISTEN_AND_READ") {
    focus.push("أكثر من الاستماع للقارئ المفضّل قبل التسميع");
  }
  focus.push("السور القصيرة تُجمَّع معاً في ورد مراجعة واحد");

  const journey = payload.journey || {};
  const name =
    (journey.displayName || "").trim() || "صديق القرآن";

  const habitLabel = journey.habitTime || "موعد مرن يناسبك";

  const plan = {
    dailyNewPages: payload.pagesPerDay,
    dailyRevisionPages,
    sessions: payload.revisionSessionsPerDay,
    sessionLengthMinutes: sessionLength,
    revisionMinutes,
    newMinutes,
    memorizedUnits,
    estimatedDaysToFirstFullPass: daysToCoverMemorized,
    strengthSummary: strengthLabelAr[payload.memorizationStrength],
    styleSummary:
      payload.revisionStyle === "intensive"
        ? "مكثّف"
        : payload.revisionStyle === "light"
          ? "خفيف"
          : "متوازن",
    goals: payload.goals,
    focus,
    scheduleHint: [
      "الموعد المفضّل: " + habitLabel,
      "المراجعة أولاً ثم الحفظ الجديد",
      "التزم بالوقت ولو قلّ — الدوام أحبّ إلى الله",
    ],
    journey,
    welcomeMessage: {
      greeting: "مبارك البداية يا " + name + " 🌿",
      body:
        "هدفك: " +
        primaryGoal +
        ".\n" +
        "محفوظك: " +
        memSummaryAr(payload.memorizationSelection) +
        ".",
      closing: "توكّل على الله — كل آية تتقنها اليوم بذرة ثبات غداً.",
    },
    memorizationSummary: memSummaryAr(payload.memorizationSelection),
    titleAr: "خطتك القرآنية المباركة",
    motivationQuotes: [
      {
        type: "ayah" as const,
        text: "وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ",
        source: "القمر: ١٧",
      },
      {
        type: "hadith" as const,
        text: "خيركم من تعلّم القرآن وعلّمه",
        source: "رواه البخاري",
      },
    ],
    weeklyOutline: [
      {
        day: "يومياً",
        focus:
          "ورد مراجعة من محفوظك · ثم حفظ جديد بمقدار يومك · في حوالي " +
          payload.dailyMinutes +
          " دقيقة",
      },
    ],
    /** Clear cards for the summary UI */
    dailyCards: {
      revision: {
        title: "ورد المراجعة",
        detail:
          surahCount === 0
            ? "سور قصار مجمّعة للتثبيت (الفاتحة وما تيسّر)"
            : "من محفوظك (" +
              memSummaryAr(payload.memorizationSelection) +
              ") — السور القصيرة مجمّعة",
        minutes: revisionMinutes,
      },
      newHifz: {
        title: "ورد الحفظ الجديد",
        detail:
          payload.pagesPerDay === 0
            ? "مراجعة فقط اليوم — لا حفظ جديد"
            : payload.pagesPerDay < 1
              ? "نصف صفحة تقريباً أو آيات قليلة"
              : payload.pagesPerDay === 1
                ? "صفحة واحدة تقريباً"
                : payload.pagesPerDay + " صفحات تقريباً",
        minutes: newMinutes,
      },
      time: {
        title: "الوقت والموعد",
        detail:
          payload.dailyMinutes +
          " دقيقة · " +
          habitLabel,
        minutes: payload.dailyMinutes,
      },
    },
    primaryGoal,
    surahCount,
  };

  return {
    ok: true as const,
    profileId: "profile_" + Date.now(),
    plan,
  };
}
