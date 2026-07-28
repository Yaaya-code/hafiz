/**
 * Hafiz REST / Server Action API surface
 * Base: /api/v1  (and mirror via server actions in src/lib/actions)
 */

export const API = {
  auth: {
    login: "POST /api/v1/auth/login",
    signup: "POST /api/v1/auth/signup",
    google: "POST /api/v1/auth/google",
    forgot: "POST /api/v1/auth/forgot-password",
    me: "GET /api/v1/auth/me",
  },
  profile: {
    get: "GET /api/v1/profile",
    update: "PATCH /api/v1/profile",
    onboarding: "POST /api/v1/profile/onboarding",
  },
  progress: {
    pages: "GET /api/v1/progress/pages",
    page: "GET /api/v1/progress/pages/:number",
    rate: "POST /api/v1/progress/pages/:number/rate",
  },
  revision: {
    queue: "GET /api/v1/revision/queue",
    start: "POST /api/v1/revision/sessions",
    complete: "POST /api/v1/revision/sessions/:id/complete",
    predictive: "GET /api/v1/revision/predictive",
  },
  mistakes: {
    list: "GET /api/v1/mistakes",
    create: "POST /api/v1/mistakes",
    history: "GET /api/v1/mistakes/:id/history",
  },
  mutashabihat: {
    list: "GET /api/v1/mutashabihat",
    search: "GET /api/v1/mutashabihat/search?q=",
    group: "GET /api/v1/mutashabihat/:id",
  },
  quiz: {
    start: "POST /api/v1/quiz/start",
    answer: "POST /api/v1/quiz/:attemptId/answer",
    finish: "POST /api/v1/quiz/:attemptId/finish",
  },
  analytics: {
    daily: "GET /api/v1/analytics/daily",
    score: "GET /api/v1/analytics/hafiz-score",
    heatmap: "GET /api/v1/analytics/heatmap",
  },
  goals: {
    list: "GET /api/v1/goals",
    create: "POST /api/v1/goals",
    update: "PATCH /api/v1/goals/:id",
  },
  social: {
    friends: "GET /api/v1/social/friends",
    challenges: "GET /api/v1/social/challenges",
    leaderboard: "GET /api/v1/social/leaderboard",
  },
  teacher: {
    classes: "GET /api/v1/teacher/classes",
    students: "GET /api/v1/teacher/classes/:id/students",
    assign: "POST /api/v1/teacher/classes/:id/assignments",
    report: "GET /api/v1/teacher/classes/:id/report",
  },
  admin: {
    users: "GET /api/v1/admin/users",
    content: "GET /api/v1/admin/content",
    announcements: "POST /api/v1/admin/announcements",
  },
  search: "GET /api/v1/search?q=&type=",
  notes: {
    list: "GET /api/v1/notes",
    create: "POST /api/v1/notes",
  },
  bookmarks: {
    list: "GET /api/v1/bookmarks",
    create: "POST /api/v1/bookmarks",
  },
  voice: {
    // Future
    session: "POST /api/v1/voice/sessions",
    analyze: "POST /api/v1/voice/analyze",
  },
} as const;
