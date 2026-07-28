export type UserRole = "STUDENT" | "TEACHER" | "ADMIN";

export type PageStatus =
  | "MASTERED"
  | "GOOD"
  | "NEEDS_REVIEW"
  | "WEAK"
  | "FORGOTTEN"
  | "NOT_MEMORIZED";

export type MistakeType =
  | "HARAKA"
  | "LETTER"
  | "WORD"
  | "SKIP"
  | "ORDER"
  | "MUTASHABIH"
  | "OTHER";

export type QuizType =
  | "FILL_BLANK"
  | "NEXT_AYAH"
  | "PREV_AYAH"
  | "ARRANGE"
  | "CHOOSE_WORD"
  | "IDENTIFY_SURAH"
  | "IDENTIFY_PAGE"
  | "IDENTIFY_JUZ"
  | "MUTASHABIH_CHALLENGE"
  | "SPEED"
  | "RANDOM"
  | "WEAK_PAGES"
  | "DAILY"
  | "TIMED";

export type GoalPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Surah {
  id: number;
  number: number;
  nameAr: string;
  nameEn: string;
  ayahCount: number;
  revelationType: "Meccan" | "Medinan";
  startPage: number;
  endPage: number;
}

export interface Ayah {
  id: number;
  surahId: number;
  number: number;
  text: string;
  page: number;
  juz: number;
  hizb: number;
}

export interface MushafPage {
  number: number;
  juz: number;
  hizb: number;
  startSurah: number;
  endSurah: number;
  status: PageStatus;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  easeFactor: number;
  intervalDays: number;
  mistakeCount: number;
  confidence: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  startPage: number;
  currentPage: number;
  pagesPerDay: number;
  revisionSessionsPerDay: number;
  dailyMinutes: number;
  memorizationStrength: 1 | 2 | 3 | 4 | 5;
  goals: string[];
  revisionStyle: "intensive" | "balanced" | "light";
  hafizScore: number;
  streak: number;
  longestStreak: number;
  onboardingComplete: boolean;
}

export interface RevisionItem {
  id: string;
  pageNumber: number;
  priority: number;
  reason: string;
  status: PageStatus;
  estimatedMinutes: number;
  surahName?: string;
}

export interface Mistake {
  id: string;
  ayahId?: number;
  pageNumber: number;
  surahId: number;
  surahName: string;
  type: MistakeType;
  difficulty: 1 | 2 | 3 | 4 | 5;
  frequency: number;
  note?: string;
  createdAt: string;
}

export interface MutashabihGroup {
  id: string;
  title: string;
  description: string;
  ayahs: {
    surahId: number;
    surahName: string;
    ayahNumber: number;
    text: string;
    highlightWords: string[];
    contextNote: string;
  }[];
  tips: string[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress: number;
  target: number;
}

export interface Goal {
  id: string;
  title: string;
  period: GoalPeriod;
  target: number;
  current: number;
  unit: string;
  completed: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: "reminder" | "prediction" | "achievement" | "social" | "system";
  read: boolean;
  createdAt: string;
}

export interface DailyAnalytics {
  date: string;
  reviewsCompleted: number;
  reviewsPlanned: number;
  quizScore: number;
  studyMinutes: number;
  mistakes: number;
  retentionRate: number;
}

export interface AISuggestion {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  href: string;
  urgency: "low" | "medium" | "high";
}

export interface ClassRoom {
  id: string;
  name: string;
  studentsCount: number;
  averageScore: number;
  attendanceRate: number;
}

export interface StudentSummary {
  id: string;
  name: string;
  hafizScore: number;
  streak: number;
  weakPages: number;
  lastActive: string;
  progressPercent: number;
}
