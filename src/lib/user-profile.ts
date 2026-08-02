/**
 * Client-side user profile from onboarding.
 */
import type { JourneyAnswers } from "@/lib/onboarding-types";
import type {
  LearningStyle,
  MemorizationSelection,
  MemorizationStrength,
} from "@/lib/quran/types";
import {
  STORAGE_KEYS,
  safeGetJSON,
  safeSetJSON,
  safeRemoveItem,
  isBrowser,
  emitStorageEvent,
} from "@/lib/storage/safe-storage";

export type StoredPlan = {
  dailyNewPages: number;
  dailyRevisionPages: number;
  sessions: number;
  sessionLengthMinutes: number;
  revisionMinutes: number;
  newMinutes: number;
  memorizedUnits: number;
  estimatedDaysToFirstFullPass: number;
  strengthSummary: string;
  styleSummary: string;
  goals: string[];
  focus: string[];
  scheduleHint: string[];
  welcomeMessage: {
    greeting: string;
    body: string;
    closing: string;
  };
  journey?: JourneyAnswers;
  memorizationSummary?: string;
  titleAr?: string;
  motivationQuotes?: {
    type: "hadith" | "ayah";
    text: string;
    source: string;
  }[];
  weeklyOutline?: { day: string; focus: string }[];
  primaryGoal?: string;
  surahCount?: number;
  dailyCards?: {
    revision: { title: string; detail: string; minutes: number };
    newHifz: { title: string; detail: string; minutes: number };
    time: { title: string; detail: string; minutes: number };
  };
};

export type HafizProfile = {
  version: 2;
  completedAt: string;
  name: string;
  startPage?: number;
  currentPage?: number;
  startSurah?: string;
  currentSurah?: string;
  pagesPerDay: number;
  /** Target revision volume (pages/day) — separate from new hifz */
  revisionPagesPerDay?: number;
  revisionSessionsPerDay: number;
  dailyMinutes: number;
  memorizationStrength: 1 | 2 | 3 | 4 | 5;
  revisionStyle: "intensive" | "balanced" | "light";
  goals: string[];
  /** complete_quran | selected_surahs | revision_only */
  learningGoalId?: "complete_quran" | "selected_surahs" | "revision_only" | string;
  journey?: JourneyAnswers;
  plan?: StoredPlan;
  onboardingComplete: boolean;
  preferredQariId: string;
  memorizationSelection?: MemorizationSelection;
  learningStyle?: LearningStyle;
  /**
   * New-hifz routing:
   * continue_forward | from_start | bottom_up | complete_nearby
   */
  progressionMode?:
    | "continue_forward"
    | "from_start"
    | "bottom_up"
    | "complete_nearby";
  /**
   * Product usage track (onboarding multi-path).
   * Default AUTOMATIC_PLAN when omitted (backward compat).
   */
  usageTrack?:
    | "AUTOMATIC_PLAN"
    | "EXTERNAL_TRACKER"
    | "FREE_EXPLORER";
  /** False = free explorer / no scheduled plan */
  hasActivePlan?: boolean;
  /**
   * Scattered-map NEW_HIFZ start preference (spec names).
   */
  hifzStartPreference?:
    | "START_FROM_BEGINNING"
    | "START_FROM_REVERSE"
    | "START_FROM_CUSTOM_SURAH"
    | "CONTINUE_FORWARD";
  /** When hifzStartPreference = START_FROM_CUSTOM_SURAH */
  customStartSurah?: number;
  /**
   * EXTERNAL_TRACKER: user-picked current wird (manual).
   */
  manualWird?: {
    surah: number;
    fromAyah: number;
    toAyah: number;
    labelAr?: string;
    updatedAt?: string;
  };
  /**
   * When intent fields (goal / progression / capacity) last changed.
   * Used by cloud Intent merge (newest wins). Optional for backward compat.
   */
  intentUpdatedAt?: string;
};

const STORAGE_KEY = STORAGE_KEYS.profile;

/**
 * Empty first-run shell — no seeded goals or display name.
 * Soft UI labels (e.g. "صديق القرآن") live in displayName() only.
 */
export function getDefaultProfile(): HafizProfile {
  return {
    version: 2,
    completedAt: "",
    name: "",
    pagesPerDay: 1,
    revisionPagesPerDay: 3,
    revisionSessionsPerDay: 2,
    dailyMinutes: 45,
    memorizationStrength: 3,
    revisionStyle: "balanced",
    goals: [],
    onboardingComplete: false,
    preferredQariId: "alafasy",
    learningStyle: "LISTEN_AND_READ",
    usageTrack: "AUTOMATIC_PLAN",
    hasActivePlan: true,
    hifzStartPreference: "CONTINUE_FORWARD",
    memorizationSelection: {
      mode: "JUZ",
      juzSelections: [],
      surahSelections: [],
    },
  };
}

/** Minimal plan shell so stats / dashboard cards never see null plan fields */
export function getSimplePlanShell(displayName?: string): StoredPlan {
  const name = (displayName || "").trim();
  return {
    dailyNewPages: 1,
    dailyRevisionPages: 3,
    sessions: 2,
    sessionLengthMinutes: 20,
    revisionMinutes: 25,
    newMinutes: 15,
    memorizedUnits: 0,
    estimatedDaysToFirstFullPass: 0,
    strengthSummary: "متوسط — يحتاج انتظاماً",
    styleSummary: "استخدام مبسّط",
    goals: ["حفظ ومراجعة منتظمة"],
    focus: ["تسميع مباشر", "تلقين (اسمع ثم ردّد)"],
    scheduleHint: ["اختر سورة ونطاقاً وابدأ فوراً"],
    welcomeMessage: {
      greeting: name ? "مرحباً يا " + name : "مرحباً بك",
      body: "ابدأ بالتسميع المباشر أو وضع التلقين — بدون خطط معقّدة.",
      closing: "وفقك الله",
    },
    primaryGoal: "حفظ ومراجعة مبسّطة",
    surahCount: 0,
    dailyCards: {
      revision: {
        title: "تسميع مباشر",
        detail: "اختر نطاقاً وسمّع آية بآية",
        minutes: 20,
      },
      newHifz: {
        title: "تلقين",
        detail: "اسمع الشيخ ثم ردّد",
        minutes: 20,
      },
      time: {
        title: "وقت مرن",
        detail: "حسب ما يناسبك",
        minutes: 30,
      },
    },
  };
}

/**
 * Safe completed profile for the simplified UX path.
 * Fills every field stats / profile screens may read so nothing is null.
 */
export function buildSimpleReadyProfile(
  base?: Partial<HafizProfile> | HafizProfile
): HafizProfile {
  const now = new Date().toISOString();
  const merged: HafizProfile = {
    ...getDefaultProfile(),
    ...base,
    version: 2,
  };
  const name = (merged.name || base?.name || "").trim();
  const strength = ([1, 2, 3, 4, 5] as const).includes(
    merged.memorizationStrength as 1 | 2 | 3 | 4 | 5
  )
    ? (merged.memorizationStrength as 1 | 2 | 3 | 4 | 5)
    : 3;

  return normalizeProfile({
    ...merged,
    name,
    completedAt: merged.completedAt || now,
    onboardingComplete: true,
    pagesPerDay:
      typeof merged.pagesPerDay === "number" && merged.pagesPerDay >= 0
        ? merged.pagesPerDay
        : 1,
    revisionPagesPerDay:
      typeof merged.revisionPagesPerDay === "number"
        ? merged.revisionPagesPerDay
        : 3,
    revisionSessionsPerDay:
      typeof merged.revisionSessionsPerDay === "number" &&
      merged.revisionSessionsPerDay > 0
        ? merged.revisionSessionsPerDay
        : 2,
    dailyMinutes:
      typeof merged.dailyMinutes === "number" && merged.dailyMinutes > 0
        ? merged.dailyMinutes
        : 30,
    memorizationStrength: strength,
    revisionStyle: merged.revisionStyle || "balanced",
    goals:
      Array.isArray(merged.goals) && merged.goals.length > 0
        ? merged.goals
        : ["حفظ ومراجعة منتظمة"],
    preferredQariId: merged.preferredQariId || "alafasy",
    learningStyle: merged.learningStyle || "LISTEN_AND_READ",
    /** Simplified product path — no forced auto plan */
    usageTrack: "FREE_EXPLORER",
    hasActivePlan: false,
    hifzStartPreference: merged.hifzStartPreference || "CONTINUE_FORWARD",
    progressionMode: merged.progressionMode || "continue_forward",
    learningGoalId: merged.learningGoalId || "complete_quran",
    memorizationSelection: merged.memorizationSelection ?? {
      mode: "JUZ",
      juzSelections: [],
      surahSelections: [],
    },
    plan: merged.plan || getSimplePlanShell(name),
    journey: {
      habitTime: "موعد مرن",
      ...(merged.journey || {}),
      displayName:
        merged.journey?.displayName?.trim() || name || undefined,
    },
    intentUpdatedAt: now,
  });
}

/**
 * Idempotent bootstrap for simple UX:
 * - Marks onboarding complete
 * - Injects safe defaults for any missing critical fields
 * Persists when a write is needed. Safe to call on every app entry.
 */
export function ensureSimpleProfileReady(opts?: {
  name?: string;
}): HafizProfile {
  if (!isBrowser()) {
    return buildSimpleReadyProfile({ name: opts?.name || "" });
  }
  const current = loadProfile();
  const wasComplete = hasCompletedOnboarding(current);
  const needsBootstrap = !wasComplete;
  const needsHeal = !profileHasSafeDefaults(current);

  if (!needsBootstrap && !needsHeal) {
    return current;
  }

  const ready = buildSimpleReadyProfile({
    ...current,
    name: opts?.name?.trim() || current.name,
  });
  // Preserve existing completed users' track/plan if they already finished full onboarding
  if (wasComplete && current.usageTrack === "AUTOMATIC_PLAN") {
    ready.usageTrack = "AUTOMATIC_PLAN";
    ready.hasActivePlan = current.hasActivePlan !== false;
    if (current.plan) ready.plan = current.plan;
  }
  saveProfile(ready);
  return ready;
}

function profileHasSafeDefaults(p: HafizProfile): boolean {
  return (
    typeof p.pagesPerDay === "number" &&
    typeof p.dailyMinutes === "number" &&
    typeof p.memorizationStrength === "number" &&
    typeof p.revisionSessionsPerDay === "number" &&
    Boolean(p.preferredQariId) &&
    Boolean(p.learningStyle) &&
    Boolean(p.memorizationSelection) &&
    Boolean(p.revisionStyle) &&
    Array.isArray(p.goals) &&
    Boolean(p.plan) &&
    p.onboardingComplete === true
  );
}

/**
 * True only after the user finished onboarding on this device (or restored from cloud).
 * Also treats completedAt + plan as completed (recovery if a flag was race-reset).
 */
export function hasCompletedOnboarding(profile?: HafizProfile): boolean {
  const p = profile ?? loadProfile();
  if (p.onboardingComplete === true) return true;
  // Recovery signal: plan was generated and completion timestamp exists
  if (Boolean(p.completedAt) && Boolean(p.plan)) return true;
  return false;
}

/**
 * Normalize a profile so completion is sticky and consistent.
 * Call before every write; also used by load for recovery.
 */
export function normalizeProfile(profile: HafizProfile): HafizProfile {
  const next: HafizProfile = { ...profile, version: 2 };
  if (
    next.onboardingComplete === true ||
    (Boolean(next.completedAt) && Boolean(next.plan))
  ) {
    next.onboardingComplete = true;
  }
  return next;
}

export function loadProfile(): HafizProfile {
  if (!isBrowser()) return getDefaultProfile();
  const parsed = safeGetJSON<HafizProfile | null>(STORAGE_KEY, null);
  if (!parsed) return getDefaultProfile();
  const normalized = normalizeProfile({
    ...getDefaultProfile(),
    ...parsed,
    version: 2,
  });
  // Heal storage if a race left complete plan with a false flag
  if (
    parsed.onboardingComplete !== true &&
    normalized.onboardingComplete === true
  ) {
    safeSetJSON(STORAGE_KEY, normalized);
  }
  return normalized;
}

export function saveProfile(profile: HafizProfile): void {
  if (!isBrowser()) return;
  const normalized = normalizeProfile(profile);
  // Stamp intent time for cloud Intent merge (newest wins)
  if (!normalized.intentUpdatedAt) {
    normalized.intentUpdatedAt =
      normalized.completedAt || new Date().toISOString();
  }
  safeSetJSON(STORAGE_KEY, normalized);
  emitStorageEvent("hafiz-profile-updated", normalized);
}

export function clearProfile(): void {
  if (!isBrowser()) return;
  safeRemoveItem(STORAGE_KEY);
  emitStorageEvent("hafiz-profile-updated", null);
}

export function displayName(profile: HafizProfile): string {
  return (
    profile.journey?.displayName?.trim() ||
    profile.name?.trim() ||
    "صديق القرآن"
  );
}

export function strengthLabelAr(s: MemorizationStrength): string {
  switch (s) {
    case "STRONG":
      return "قوي";
    case "GOOD":
      return "جيد";
    case "NEEDS_REVIEW":
      return "يحتاج مراجعة";
    case "WEAK":
      return "ضعيف";
  }
}

export function summarizeMemorization(sel?: MemorizationSelection): string {
  if (!sel) return "لم يُحدَّد بعد";
  const n = sel.surahSelections?.length || 0;
  if (n === 114) return "القرآن كاملاً (١١٤ سورة)";
  if (n === 1) return "سورة واحدة";
  if (n > 1) return n + " سورة";
  if (sel.mode === "JUZ" && sel.juzSelections.length) {
    const j = sel.juzSelections.length;
    return j === 1 ? "جزء واحد" : j + " أجزاء";
  }
  if (sel.mode === "RANGE" && sel.range) {
    return (
      "من السورة " +
      sel.range.fromSurah +
      " إلى السورة " +
      sel.range.toSurah
    );
  }
  return "لم يُحدَّد بعد";
}

export function buildPersonalizedReminders(profile: HafizProfile) {
  const items: {
    id: string;
    title: string;
    body: string;
    type: "reminder" | "prediction" | "system" | "motivation";
  }[] = [];
  const j = profile.journey;
  const name = displayName(profile);

  if (j?.habitTime) {
    items.push({
      id: "habit",
      title: "وقت تواصلك مع القرآن",
      body: name + "، عادةً: " + j.habitTime + ". اجعل جلسة اليوم في هذا الوقت.",
      type: "reminder",
    });
  }
  if (j?.topChallenge) {
    items.push({
      id: "challenge",
      title: "اولويتك مع حافظ",
      body: "نركز اليوم على: " + j.topChallenge + ".",
      type: "system",
    });
  }
  if (profile.memorizationSelection) {
    items.push({
      id: "mem",
      title: "ما حفظته",
      body: "تتبعك: " + summarizeMemorization(profile.memorizationSelection) + ".",
      type: "system",
    });
  }
  if (profile.plan?.dailyRevisionPages) {
    items.push({
      id: "today",
      title: "خطة اليوم",
      body:
        "مراجعة: ~" +
        profile.plan.dailyRevisionPages +
        " وحدة · حفظ جديد حسب هدفك.",
      type: "system",
    });
  }
  return items.filter(function (i) {
    return Boolean(i.body);
  });
}

export function buildPersonalizedSuggestions(profile: HafizProfile) {
  const j = profile.journey;
  const list: {
    id: string;
    title: string;
    body: string;
    actionLabel: string;
    href: string;
    urgency: "low" | "medium" | "high";
  }[] = [];

  const challenge = j?.topChallenge || "";

  list.push({
    id: "s-mem",
    title: "ورد الحفظ",
    body: "ابدأ مقطع اليوم مباشرة — استمع · كرر · اختبر · أتقن.",
    actionLabel: "ابدأ الحفظ",
    href: "/plans/new",
    urgency: "high",
  });

  if (challenge.indexOf("متشابه") >= 0) {
    list.push({
      id: "s-mut",
      title: "متشابهاتك",
      body: "محرك موسع مع انواع التشابه والفلاتر.",
      actionLabel: "المتشابهات",
      href: "/mutashabihat",
      urgency: "high",
    });
  } else {
    list.push({
      id: "s-rev",
      title: "مراجعة اليوم",
      body: "قائمة مرتبة تلقائيا للاضعف اولا.",
      actionLabel: "المراجعة",
      href: "/plans/journey",
      urgency: "medium",
    });
  }

  list.push({
    id: "s-audio",
    title: "مكتبة القراء",
    body: "قارئك الحالي مفضل للحفظ السمعي.",
    actionLabel: "اختر قارئا",
    href: "/qaris",
    urgency: "low",
  });

  return list.slice(0, 3);
}
