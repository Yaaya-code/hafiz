/**
 * State Adapter — map app progress DTOs → core UserState.
 * Mapping only. No rule logic. No I/O.
 */

import type {
  HifzState,
  LearningState,
  MistakeCategory,
  MistakeHistory,
  MistakeRecord,
  MemorizationStrengthLevel,
  MushafPointer,
  PlanningState,
  QuranSlice,
  RevisionQueueItem,
  RevisionState,
  SessionHistory,
  SessionOutcome,
  SessionRecord,
  UserProfile,
  UserState,
} from "../models";
import type {
  AppMistakeItem,
  AppProgressSource,
  AppQuranSlice,
  AppRevisionQueueItem,
  AppSessionItem,
  HafizProfileSource,
  StateAdapterOptions,
} from "./types";
import { adaptHafizProfileToUserProfile } from "./profile-adapter";

const MISTAKE_CATS: readonly MistakeCategory[] = [
  "HARAKA",
  "LETTER",
  "WORD",
  "SKIP",
  "ORDER",
  "MUTASHABIH",
  "OTHER",
];

function isoDay(d: Date | string | undefined, fallback: string): string {
  if (!d) return fallback;
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const parsed = new Date(d);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return fallback;
  }
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toISOString().slice(0, 10);
}

function clampStrengthScore(n: unknown, fallback: 1 | 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 | 5 {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  const v = Math.round(n);
  if (v <= 1) return 1;
  if (v === 2) return 2;
  if (v === 3) return 3;
  if (v === 4) return 4;
  return 5;
}

function strengthFromScore(score: 1 | 2 | 3 | 4 | 5): MemorizationStrengthLevel {
  if (score <= 2) return "WEAK";
  if (score === 3) return "NEEDS_REVIEW";
  if (score === 4) return "GOOD";
  return "STRONG";
}

function mapEffectiveStrength(
  raw: unknown,
  score: 1 | 2 | 3 | 4 | 5
): MemorizationStrengthLevel {
  const s = String(raw ?? "").toUpperCase();
  if (s === "STRONG" || s === "GOOD" || s === "NEEDS_REVIEW" || s === "WEAK") {
    return s;
  }
  if (s === "MASTERED") return "STRONG";
  return strengthFromScore(score);
}

function mapPointer(
  raw: AppProgressSource["hifzPointer"] | undefined,
  fallback: MushafPointer
): MushafPointer {
  if (!raw) return { ...fallback };
  const surah =
    typeof raw.surah === "number" && raw.surah >= 1 && raw.surah <= 114
      ? raw.surah
      : fallback.surah;
  const ayah =
    typeof raw.ayah === "number" && raw.ayah >= 1 ? raw.ayah : fallback.ayah;
  return { surah, ayah };
}

function mapHifzTrack(
  raw: unknown,
  progressionMode?: string
): HifzState["track"] {
  const s = String(raw ?? "").toLowerCase();
  if (s === "bottom_up") return "bottom_up";
  if (s === "from_start") return "from_start";
  if (s === "continue_forward") return "continue_forward";
  if (s === "top_down") return "top_down";
  if (progressionMode === "from_start") return "from_start";
  return "continue_forward";
}

function mapSlice(raw: AppQuranSlice | undefined, index: number): QuranSlice {
  if (!raw) {
    return { labelAr: `وحدة ${index + 1}`, pagesApprox: 0.25 };
  }
  return {
    labelAr: raw.labelAr ?? `وحدة ${index + 1}`,
    pagesApprox:
      typeof raw.pagesApprox === "number" && Number.isFinite(raw.pagesApprox)
        ? Math.max(0, raw.pagesApprox)
        : 0.25,
    range: raw.range
      ? {
          surah: raw.range.surah,
          fromAyah: raw.range.fromAyah,
          toAyah: raw.range.toAyah,
        }
      : undefined,
    span: raw.span
      ? { fromSurah: raw.span.fromSurah, toSurah: raw.span.toSurah }
      : undefined,
    startPage: raw.startPage,
    endPage: raw.endPage,
  };
}

function mapQueueItem(
  raw: AppRevisionQueueItem,
  index: number
): RevisionQueueItem {
  const sourceRaw = String(raw.source ?? "memorized_corpus");
  const source: RevisionQueueItem["source"] =
    sourceRaw === "foundation" ||
    sourceRaw === "near_carry" ||
    sourceRaw === "weekly_anchor" ||
    sourceRaw === "memorized_corpus"
      ? sourceRaw
      : "memorized_corpus";

  return {
    id: raw.id ?? `rev_${index}`,
    slice: mapSlice(raw.slice, index),
    priority: typeof raw.priority === "number" ? raw.priority : 0,
    timesServed:
      typeof raw.timesServed === "number" ? Math.max(0, raw.timesServed) : 0,
    lastServedDate: raw.lastServedDate,
    source,
  };
}

function mapMistakeCategory(raw: unknown): MistakeCategory {
  const s = String(raw ?? "OTHER").toUpperCase();
  if ((MISTAKE_CATS as readonly string[]).includes(s)) {
    return s as MistakeCategory;
  }
  // App free-form types
  if (s.includes("HARAKA") || s.includes("VOWEL")) return "HARAKA";
  if (s.includes("LETTER")) return "LETTER";
  if (s.includes("WORD") || s.includes("MISSING")) return "WORD";
  if (s.includes("SKIP")) return "SKIP";
  if (s.includes("ORDER")) return "ORDER";
  if (s.includes("MUTASHABIH")) return "MUTASHABIH";
  return "OTHER";
}

function mapMistake(
  raw: AppMistakeItem,
  userId: string,
  index: number
): MistakeRecord {
  const surah = raw.surahNumber ?? raw.surah ?? 1;
  const last =
    raw.lastOccurredAt ??
    raw.updatedAt ??
    raw.createdAt ??
    new Date().toISOString().slice(0, 10);

  return {
    id: raw.id ?? `mistake_${index}`,
    userId,
    surah: Number(surah) || 1,
    ayah: raw.ayahNumber ?? raw.ayah,
    page: raw.pageNumber ?? raw.page,
    category: mapMistakeCategory(raw.category ?? raw.type),
    frequency:
      typeof raw.frequency === "number" && raw.frequency > 0
        ? raw.frequency
        : 1,
    lastOccurredAt: isoDay(last, new Date().toISOString().slice(0, 10)),
    note: raw.note,
  };
}

function mapSessionOutcome(raw: unknown): SessionOutcome {
  const s = String(raw ?? "completed").toLowerCase();
  if (s === "partial" || s === "skipped" || s === "failed") return s;
  return "completed";
}

function mapSessionKind(
  raw: unknown
): SessionRecord["kind"] {
  const s = String(raw ?? "new_hifz").toLowerCase();
  if (
    s === "new_hifz" ||
    s === "near_revision" ||
    s === "far_revision" ||
    s === "foundation_revision" ||
    s === "weekly_anchor" ||
    s === "listening" ||
    s === "quiz" ||
    s === "mutashabihat" ||
    s === "reflection" ||
    s === "rest"
  ) {
    return s as SessionRecord["kind"];
  }
  if (s.includes("revision")) return "near_revision";
  if (s.includes("listen")) return "listening";
  if (s.includes("quiz")) return "quiz";
  return "new_hifz";
}

function mapSession(
  raw: AppSessionItem,
  userId: string,
  index: number
): SessionRecord {
  const date = isoDay(
    raw.date ?? raw.createdAt,
    new Date().toISOString().slice(0, 10)
  );
  return {
    id: raw.id ?? `session_${index}`,
    userId: raw.userId ?? userId,
    date,
    kind: mapSessionKind(raw.kind),
    surahNumber: raw.surahNumber,
    outcome: mapSessionOutcome(raw.outcome),
    durationMinutes: raw.durationMinutes,
    notes: raw.notes,
    createdAt: raw.createdAt ?? `${date}T12:00:00.000Z`,
    target: raw.target
      ? {
          surah: raw.target.surah ?? 1,
          fromAyah: raw.target.fromAyah ?? 1,
          toAyah: raw.target.toAyah ?? raw.target.fromAyah ?? 1,
        }
      : undefined,
  };
}

/**
 * Infer weak mistake signals from ayah progress (mapping only, not pedagogy).
 */
function mistakesFromAyahProgress(
  map: AppProgressSource["ayahProgress"],
  userId: string
): MistakeRecord[] {
  if (!map) return [];
  const out: MistakeRecord[] = [];
  let i = 0;
  for (const [key, p] of Object.entries(map)) {
    const fails = p.failTests ?? 0;
    const status = String(p.status ?? "").toUpperCase();
    if (fails <= 0 && status !== "WEAK" && status !== "NEEDS_REVIEW") continue;
    const [sStr, aStr] = key.split(":");
    const surah = p.surahNumber ?? (Number(sStr) || 1);
    const ayah = p.ayahNumber ?? (Number(aStr) || undefined);
    out.push({
      id: `ayah_m_${i++}`,
      userId,
      surah,
      ayah,
      category: "OTHER",
      frequency: Math.max(1, fails || 1),
      lastOccurredAt: isoDay(
        p.lastRevisedAt,
        new Date().toISOString().slice(0, 10)
      ),
      note: status || undefined,
    });
  }
  return out;
}

function resolveProfileDefaults(
  options: StateAdapterOptions
): UserProfile | null {
  if (!options.profile) return null;
  // Already a core UserProfile?
  if (
    "userId" in options.profile &&
    "memorizationSelection" in options.profile &&
    "displayName" in options.profile
  ) {
    return options.profile as UserProfile;
  }
  return adaptHafizProfileToUserProfile(
    options.profile as HafizProfileSource,
    { userId: options.userId }
  );
}

/**
 * Convert app progress → core UserState.
 */
export function adaptAppProgressToUserState(
  source: AppProgressSource | null | undefined,
  options: StateAdapterOptions = {}
): UserState {
  const s = source ?? {};
  const profile = resolveProfileDefaults(options);
  const today = isoDay(options.asOfDate, new Date().toISOString().slice(0, 10));

  const userId =
    options.userId ??
    s.userId ??
    profile?.userId ??
    "anonymous";

  const strengthScore = clampStrengthScore(
    s.strengthScore ?? profile?.memorizationStrength,
    profile?.memorizationStrength ?? 3
  );

  const defaultPointer: MushafPointer =
    profile?.progressionMode === "from_start"
      ? { surah: 1, ayah: 1 }
      : { surah: 114, ayah: 1 };

  const pointer = mapPointer(s.hifzPointer, defaultPointer);

  const hifz: HifzState = {
    currentPointer: pointer,
    track: mapHifzTrack(s.hifzTrack, profile?.progressionMode),
    paused: s.hifzPaused === true,
    weekHifzLog: (s.weekHifzLog ?? []).map((x, i) => mapSlice(x, i)),
    lastCompletedSlice: s.lastCompletedSlice
      ? mapSlice(s.lastCompletedSlice, 0)
      : undefined,
    lastAdvancedDate: s.lastAdvancedDate
      ? isoDay(s.lastAdvancedDate, today)
      : undefined,
  };

  const revision: RevisionState = {
    nearStack: (s.nearStack ?? []).map(mapQueueItem),
    farQueue: (s.farQueue ?? []).map(mapQueueItem),
    farIndex: typeof s.farIndex === "number" ? Math.max(0, s.farIndex) : 0,
    weekLog: (s.weekLog ?? []).map(mapQueueItem),
    nearStackMax:
      typeof s.nearStackMax === "number" && s.nearStackMax > 0
        ? s.nearStackMax
        : 7,
  };

  const learning: LearningState = {
    effectiveStrength: mapEffectiveStrength(s.effectiveStrength, strengthScore),
    strengthScore,
    learningStyle: (s.learningStyle as LearningState["learningStyle"]) ??
      profile?.learningStyle ??
      "LISTEN_AND_READ",
    revisionStyle: (s.revisionStyle as LearningState["revisionStyle"]) ??
      profile?.revisionStyle ??
      "balanced",
    newHifzEnabled: s.newHifzEnabled ?? true,
    dailyPageCapacity:
      typeof s.dailyPageCapacity === "number"
        ? Math.max(0, s.dailyPageCapacity)
        : profile?.pagesPerDay ?? 1,
    dailyMinuteCapacity:
      typeof s.dailyMinuteCapacity === "number"
        ? Math.max(0, s.dailyMinuteCapacity)
        : profile?.dailyMinutes ?? 45,
    activeScenarioId: s.activeScenarioId,
  };

  // Normalize learning styles if raw strings slipped through
  if (
    learning.learningStyle !== "LISTENING" &&
    learning.learningStyle !== "READING" &&
    learning.learningStyle !== "WRITING" &&
    learning.learningStyle !== "LISTEN_AND_READ" &&
    learning.learningStyle !== "WITH_TEACHER"
  ) {
    learning.learningStyle = "LISTEN_AND_READ";
  }
  if (
    learning.revisionStyle !== "intensive" &&
    learning.revisionStyle !== "balanced" &&
    learning.revisionStyle !== "light"
  ) {
    learning.revisionStyle = "balanced";
  }

  const planning: PlanningState = {
    scenarioId: (() => {
      const id = String(s.planningScenarioId ?? "unknown");
      if (
        id === "foundation_builder" ||
        id === "continue_forward" ||
        id === "from_start" ||
        id === "balanced" ||
        id === "unknown"
      ) {
        return id;
      }
      return "unknown";
    })(),
    currentHifzPointer: { ...pointer },
    nearStack: [...revision.nearStack],
    farQueue: [...revision.farQueue],
    farIndex: revision.farIndex,
    weekHifzLog: [...hifz.weekHifzLog],
    generatedDayCount:
      typeof s.generatedDayCount === "number"
        ? Math.max(0, s.generatedDayCount)
        : 0,
    horizonStartDate: s.horizonStartDate
      ? isoDay(s.horizonStartDate, today)
      : undefined,
    hifzEnabled: s.planningHifzEnabled ?? learning.newHifzEnabled,
    dailyPageCapacity: s.planningDailyPageCapacity ?? learning.dailyPageCapacity,
  };

  const explicitMistakes = (s.mistakes ?? []).map((m, i) =>
    mapMistake(m, userId, i)
  );
  const fromAyah = mistakesFromAyahProgress(s.ayahProgress, userId);
  const mistakes: MistakeHistory = {
    records: [...explicitMistakes, ...fromAyah],
    maxRecords: 500,
  };

  const sessions: SessionHistory = {
    records: (s.sessions ?? []).map((sess, i) => mapSession(sess, userId, i)),
    maxRecords: 200,
  };

  return {
    userId,
    lastPlannedDate: s.lastPlannedDate
      ? isoDay(s.lastPlannedDate, today)
      : undefined,
    streakDays:
      typeof s.streakDays === "number" && s.streakDays >= 0 ? s.streakDays : 0,
    hifz,
    revision,
    learning,
    planning,
    sessions,
    mistakes,
    stateVersion:
      typeof s.stateVersion === "number" && s.stateVersion > 0
        ? s.stateVersion
        : 1,
    updatedAt: isoDay(s.updatedAt, today),
  };
}

/**
 * Convenience: empty progress → default UserState for a profile.
 */
export function createDefaultUserState(
  profile: UserProfile,
  asOfDate?: Date | string
): UserState {
  return adaptAppProgressToUserState(
    {},
    { profile, userId: profile.userId, asOfDate }
  );
}
