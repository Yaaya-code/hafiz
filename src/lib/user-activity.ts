/**
 * Client-side activity: notes, bookmarks, mistakes, streaks, achievements.
 * Local-first; syncs to Prisma via useSyncProgress /api/v1/sync.
 */

import { getSurah } from "@/lib/quran/surahs";
import {
  STORAGE_KEYS,
  isBrowser,
  safeGetJSON,
  safeSetJSON,
  emitStorageEvent,
} from "@/lib/storage/safe-storage";

const NOTES_KEY = STORAGE_KEYS.notes;
const BM_KEY = STORAGE_KEYS.bookmarks;
const MISTAKES_KEY = STORAGE_KEYS.mistakes;
const STREAK_KEY = STORAGE_KEYS.streak;
const ACH_KEY = STORAGE_KEYS.achievements;

export type NoteItem = {
  id: string;
  content: string;
  surahNumber?: number;
  ayahNumber?: number;
  pageNumber?: number;
  tag?: string;
  createdAt: string;
  updatedAt: string;
};

export type BookmarkItem = {
  id: string;
  type: "ayah" | "surah" | "page" | "session";
  surahNumber?: number;
  ayahNumber?: number;
  pageNumber?: number;
  label: string;
  createdAt: string;
};

export type MistakeItem = {
  id: string;
  surahNumber: number;
  ayahNumber?: number;
  pageNumber?: number;
  type: string;
  difficulty: number;
  frequency: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type StreakState = {
  current: number;
  longest: number;
  lastActiveDate: string; // YYYY-MM-DD
  totalDays: number;
};

export type AchievementState = {
  id: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress: number;
  target: number;
};

function uid() {
  return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function emit(name: string) {
  emitStorageEvent(name);
}

// ——— Notes ———
export function loadNotes(): NoteItem[] {
  if (!isBrowser()) return [];
  return safeGetJSON<NoteItem[]>(NOTES_KEY, []);
}

export function saveNote(input: {
  content: string;
  surahNumber?: number;
  ayahNumber?: number;
  pageNumber?: number;
  tag?: string;
  id?: string;
}): NoteItem[] {
  const list = loadNotes();
  const now = new Date().toISOString();
  if (input.id) {
    const i = list.findIndex((n) => n.id === input.id);
    if (i >= 0) {
      list[i] = {
        ...list[i],
        content: input.content,
        updatedAt: now,
        tag: input.tag ?? list[i].tag,
      };
    }
  } else {
    list.unshift({
      id: uid(),
      content: input.content.trim(),
      surahNumber: input.surahNumber,
      ayahNumber: input.ayahNumber,
      pageNumber: input.pageNumber,
      tag: input.tag,
      createdAt: now,
      updatedAt: now,
    });
  }
  safeSetJSON(NOTES_KEY, list);
  emit("hafiz-activity");
  return list;
}

export function deleteNote(id: string): NoteItem[] {
  const list = loadNotes().filter((n) => n.id !== id);
  safeSetJSON(NOTES_KEY, list);
  emit("hafiz-activity");
  return list;
}

export function notesForAyah(surah: number, ayah: number): NoteItem[] {
  return loadNotes().filter(
    (n) => n.surahNumber === surah && n.ayahNumber === ayah
  );
}

// ——— Bookmarks ———
export function loadBookmarks(): BookmarkItem[] {
  if (!isBrowser()) return [];
  return safeGetJSON<BookmarkItem[]>(BM_KEY, []);
}

export function toggleAyahBookmark(
  surahNumber: number,
  ayahNumber: number
): BookmarkItem[] {
  const list = loadBookmarks();
  const i = list.findIndex(
    (b) =>
      b.type === "ayah" &&
      b.surahNumber === surahNumber &&
      b.ayahNumber === ayahNumber
  );
  if (i >= 0) list.splice(i, 1);
  else {
    const name = getSurah(surahNumber)?.nameAr || "سورة " + surahNumber;
    list.unshift({
      id: uid(),
      type: "ayah",
      surahNumber,
      ayahNumber,
      label: name + " : " + ayahNumber,
      createdAt: new Date().toISOString(),
    });
  }
  safeSetJSON(BM_KEY, list);
  emit("hafiz-activity");
  return list;
}

export function isAyahBookmarked(surah: number, ayah: number): boolean {
  return loadBookmarks().some(
    (b) =>
      b.type === "ayah" && b.surahNumber === surah && b.ayahNumber === ayah
  );
}

export function removeBookmark(id: string): BookmarkItem[] {
  const list = loadBookmarks().filter((b) => b.id !== id);
  safeSetJSON(BM_KEY, list);
  emit("hafiz-activity");
  return list;
}

// ——— Mistakes ———
export function loadMistakes(): MistakeItem[] {
  if (!isBrowser()) return [];
  return safeGetJSON<MistakeItem[]>(MISTAKES_KEY, []);
}

export function logMistake(input: {
  surahNumber: number;
  ayahNumber?: number;
  pageNumber?: number;
  type: string;
  difficulty?: number;
  note?: string;
}): MistakeItem[] {
  const list = loadMistakes();
  const existing = list.find(
    (m) =>
      m.surahNumber === input.surahNumber &&
      m.ayahNumber === input.ayahNumber &&
      m.type === input.type
  );
  const now = new Date().toISOString();
  if (existing) {
    existing.frequency += 1;
    existing.updatedAt = now;
    if (input.note) existing.note = input.note;
  } else {
    list.unshift({
      id: uid(),
      surahNumber: input.surahNumber,
      ayahNumber: input.ayahNumber,
      pageNumber: input.pageNumber,
      type: input.type,
      difficulty: input.difficulty ?? 3,
      frequency: 1,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    });
  }
  safeSetJSON(MISTAKES_KEY, list);
  bumpStreak();
  bumpAchievements({ mistakeLogged: true });
  emit("hafiz-activity");
  return list;
}

export function resolveMistake(id: string): MistakeItem[] {
  const list = loadMistakes().filter((m) => m.id !== id);
  safeSetJSON(MISTAKES_KEY, list);
  emit("hafiz-activity");
  return list;
}

// ——— Streak ———
export function loadStreak(): StreakState {
  const empty = {
    current: 0,
    longest: 0,
    lastActiveDate: "",
    totalDays: 0,
  };
  if (!isBrowser()) return empty;
  return {
    ...empty,
    ...safeGetJSON<Partial<StreakState>>(STREAK_KEY, {}),
  };
}

export function bumpStreak(): StreakState {
  const s = loadStreak();
  const today = todayStr();
  if (s.lastActiveDate === today) return s;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.toISOString().slice(0, 10);

  if (s.lastActiveDate === y) s.current += 1;
  else s.current = 1;

  s.longest = Math.max(s.longest, s.current);
  s.lastActiveDate = today;
  s.totalDays += 1;
  safeSetJSON(STREAK_KEY, s);
  bumpAchievements({ streak: s.current });
  emit("hafiz-activity");
  return s;
}

// ——— Achievements ———
const ACH_DEFS: {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
}[] = [
  {
    id: "first_review",
    title: "أول مراجعة",
    description: "أكملت أول جلسة مراجعة — بداية الرحلة",
    icon: "🌱",
    target: 1,
  },
  {
    id: "reviews_100",
    title: "مئة نشاط قرآني",
    description: "وصلت إلى ١٠٠ نشاط في الحفظ والمراجعة",
    icon: "📖",
    target: 100,
  },
  {
    id: "streak_7",
    title: "حافظت على وردك ٧ أيام",
    description: "أسبوع متواصل من الانتظام",
    icon: "🔥",
    target: 7,
  },
  {
    id: "streak_30",
    title: "حافظت على وردك ٣٠ يوماً",
    description: "شهر كامل من الالتزام بوردك",
    icon: "💎",
    target: 30,
  },
  {
    id: "notes_5",
    title: "ملاحظات تدبّر",
    description: "كتبت ٥ ملاحظات على آيات",
    icon: "📝",
    target: 5,
  },
  {
    id: "bookmarks_10",
    title: "إشارات للحفظ",
    description: "أضفت ١٠ إشارات في المصحف",
    icon: "🔖",
    target: 10,
  },
  {
    id: "no_mistakes_day",
    title: "يوم بلا أخطاء",
    description: "يوم مراجعة ناجح بدون أخطاء مسجّلة",
    icon: "🎯",
    target: 1,
  },
  {
    id: "quiz_perfect",
    title: "اختبار مثالي",
    description: "حصلت على ١٠٠٪ في أي اختبار",
    icon: "⭐",
    target: 1,
  },
  {
    id: "quiz_10",
    title: "عشرة اختبارات",
    description: "أنهيت ١٠ اختبارات من نظام التسميع",
    icon: "🧠",
    target: 10,
  },
  {
    id: "hardcore_pass",
    title: "صمود الامتحان الصعب",
    description: "نجحت في الامتحان الشامل الصعب",
    icon: "🔥",
    target: 1,
  },
];

export function loadAchievements(): (AchievementState & {
  title: string;
  description: string;
  icon: string;
})[] {
  const state = isBrowser()
    ? safeGetJSON<Record<string, AchievementState>>(ACH_KEY, {})
    : {};
  return ACH_DEFS.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    icon: d.icon,
    target: d.target,
    progress: state[d.id]?.progress ?? 0,
    unlocked: state[d.id]?.unlocked ?? false,
    unlockedAt: state[d.id]?.unlockedAt,
  }));
}

function bumpAchievements(opts: {
  streak?: number;
  mistakeLogged?: boolean;
  activity?: boolean;
  quizPerfect?: boolean;
  quizCompleted?: boolean;
  hardcorePass?: boolean;
}) {
  if (!isBrowser()) return;
  const state = safeGetJSON<Record<string, AchievementState>>(ACH_KEY, {});

  function setProg(id: string, progress: number, target: number) {
    const prev = state[id] || {
      id,
      unlocked: false,
      progress: 0,
      target,
    };
    const unlocked = progress >= target;
    state[id] = {
      id,
      progress: Math.min(progress, target),
      target,
      unlocked,
      unlockedAt: unlocked
        ? prev.unlockedAt || new Date().toISOString()
        : prev.unlockedAt,
    };
  }

  const notes = loadNotes().length;
  const bms = loadBookmarks().length;
  const streak = opts.streak ?? loadStreak().current;

  setProg("notes_5", notes, 5);
  setProg("bookmarks_10", bms, 10);
  setProg("streak_7", streak, 7);
  setProg("streak_30", streak, 30);

  const first = state["first_review"];
  setProg(
    "first_review",
    first?.unlocked ? 1 : opts.activity || opts.mistakeLogged ? 1 : first?.progress || 0,
    1
  );

  const act =
    (state["reviews_100"]?.progress || 0) +
    (opts.activity || opts.mistakeLogged || opts.quizCompleted ? 1 : 0);
  setProg("reviews_100", act, 100);

  if (opts.quizPerfect) {
    setProg("quiz_perfect", 1, 1);
  } else {
    setProg(
      "quiz_perfect",
      state["quiz_perfect"]?.progress || 0,
      1
    );
  }

  const quizCount =
    (state["quiz_10"]?.progress || 0) + (opts.quizCompleted ? 1 : 0);
  setProg("quiz_10", quizCount, 10);

  if (opts.hardcorePass) {
    setProg("hardcore_pass", 1, 1);
  } else {
    setProg(
      "hardcore_pass",
      state["hardcore_pass"]?.progress || 0,
      1
    );
  }

  // Keep no_mistakes_day sticky if already unlocked
  setProg(
    "no_mistakes_day",
    state["no_mistakes_day"]?.progress || 0,
    1
  );

  safeSetJSON(ACH_KEY, state);
  emit("hafiz-achievements-updated");
}

export function recordActivity() {
  bumpStreak();
  bumpAchievements({ activity: true });
  emit("hafiz-activity");
}

/**
 * Event-driven quiz completion — updates achievements, streak hooks, and
 * notifies Dashboard / Analytics listeners (passQuiz sync).
 */
export function recordQuizResult(input: {
  modeId: string;
  score: number;
  total: number;
  perfect?: boolean;
  hardcore?: boolean;
}) {
  if (!isBrowser()) return;
  const pct = input.total > 0 ? input.score / input.total : 0;
  const perfect = input.perfect ?? pct >= 1;
  const hardcorePass = !!input.hardcore && pct >= 0.8;

  bumpAchievements({
    activity: true,
    quizCompleted: true,
    quizPerfect: perfect,
    hardcorePass,
  });
  emit("hafiz-activity");
  emitStorageEvent("hafiz-quiz-completed", {
    modeId: input.modeId,
    score: input.score,
    total: input.total,
    perfect,
    hardcorePass,
    at: new Date().toISOString(),
  });
}

export function buildSmartNotifications(): {
  id: string;
  title: string;
  body: string;
  type: string;
  href?: string;
}[] {
  const items: {
    id: string;
    title: string;
    body: string;
    type: string;
    href?: string;
  }[] = [];
  const streak = loadStreak();
  const mistakes = loadMistakes();
  const notes = loadNotes();

  if (streak.current > 0) {
    items.push({
      id: "streak",
      title: "سلسلتك مستمرة",
      body: "يوم " + streak.current + " — لا تكسر السلسلة اليوم.",
      type: "motivation",
      href: "/dashboard",
    });
  } else {
    items.push({
      id: "start-streak",
      title: "ابدأ سلسلة اليوم",
      body: "جلسة مراجعة قصيرة تكفي لبدء سلسلتك.",
      type: "reminder",
      href: "/plans/journey",
    });
  }

  if (mistakes.length) {
    const top = mistakes[0];
    const name = getSurah(top.surahNumber)?.nameAr || top.surahNumber;
    items.push({
      id: "mistake",
      title: "خطأ يحتاج انتباهاً",
      body:
        name +
        (top.ayahNumber ? " :" + top.ayahNumber : "") +
        " · تكرر " +
        top.frequency +
        " مرات",
      type: "prediction",
      href: "/mistakes",
    });
  }

  if (notes.length === 0) {
    items.push({
      id: "notes-tip",
      title: "نصيحة",
      body: "اكتب ملاحظة على آية صعبة — تظهر تلقائياً لاحقاً.",
      type: "system",
      href: "/notes",
    });
  }

  items.push({
    id: "mut",
    title: "تمرين متشابهات",
    body: "١٠ دقائق على المتشابهات تثبّت الحفظ الضعيف.",
    type: "reminder",
    href: "/mutashabihat/practice",
  });

  return items;
}
