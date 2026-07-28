/**
 * Server-side Local ↔ Prisma merge for Hafiz progress.
 * Gracefully no-ops when DATABASE_URL / Prisma is unavailable.
 */

import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import type {
  LearningSnapshotCloud,
  ProgressSnapshot,
  SyncPushBody,
  SyncPullResult,
} from "@/lib/sync/types";
import type { HafizProfile } from "@/lib/user-profile";
import type { MistakeType, Prisma, RevisionStyle } from "@prisma/client";
import {
  mergeLearningSnapshots,
  stripForecast,
  validateLearningSnapshotCloud,
  isForecastOnlyLearningSnapshot,
} from "@/lib/sync/learning-merge";

/** Prisma JSON columns reject branded object types — strip via unknown. */
function asJson(
  value: unknown
): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

function mapRevisionStyle(s?: string): RevisionStyle {
  if (s === "intensive") return "INTENSIVE";
  if (s === "light") return "LIGHT";
  return "BALANCED";
}

function mapMistakeType(raw: string): MistakeType {
  const allowed: MistakeType[] = [
    "HARAKA",
    "LETTER",
    "WORD",
    "SKIP",
    "ORDER",
    "MUTASHABIH",
    "OTHER",
  ];
  if (allowed.includes(raw as MistakeType)) return raw as MistakeType;
  if (raw === "MISSING_WORD" || raw === "WRONG_WORD") return "WORD";
  if (raw === "QUIZ_WRONG") return "OTHER";
  return "OTHER";
}

function dayDate(isoOrDay: string): Date {
  const day = isoOrDay.slice(0, 10);
  return new Date(day + "T00:00:00.000Z");
}

/**
 * Resolve cloud user id for a sync push.
 * Security: never trust client-supplied body.userId without a verified session.
 * Identity order: session → guestKey → create guest (no bare email claim of accounts).
 */
async function resolveUser(
  body: SyncPushBody,
  sessionUserId?: string | null
): Promise<string | null> {
  if (!prisma) return null;

  const guestKey =
    (body.guestKey || body.deviceId || "").trim().slice(0, 128) || null;

  // 1) Authenticated session is authoritative
  if (sessionUserId) {
    const bySession = await prisma.user.findUnique({
      where: { id: sessionUserId },
    });
    if (bySession) {
      if (guestKey && !bySession.guestKey) {
        try {
          await prisma.user.update({
            where: { id: bySession.id },
            data: { guestKey },
          });
        } catch {
          /* unique conflict — device already linked elsewhere */
        }
      }
      return bySession.id;
    }
  }

  // 2) Guest device identity only (not email spoofing of existing accounts)
  if (guestKey) {
    const byGuest = await prisma.user.findUnique({ where: { guestKey } });
    if (byGuest) return byGuest.id;
  }

  // 3) Create anonymous guest for local-first sync (no password, no email claim)
  const created = await prisma.user.create({
    data: {
      guestKey: guestKey || undefined,
      email: null,
      name: body.name || body.snapshot.profile?.name || null,
      profile: {
        create: {
          onboardingComplete: Boolean(body.snapshot.profile?.onboardingComplete),
          pagesPerDay: body.snapshot.profile?.pagesPerDay ?? 1,
          dailyMinutes: body.snapshot.profile?.dailyMinutes ?? 45,
          preferredQariId: body.snapshot.profile?.preferredQariId ?? "alafasy",
          revisionStyle: mapRevisionStyle(body.snapshot.profile?.revisionStyle),
          targetPlan: asJson(body.snapshot.profile?.plan),
          memorizationSelection: asJson(
            body.snapshot.profile?.memorizationSelection
          ),
          streak: body.snapshot.streak?.current ?? 0,
          longestStreak: body.snapshot.streak?.longest ?? 0,
          preferences: body.snapshot.profile
            ? buildProfilePreferences(body.snapshot.profile)
            : undefined,
        },
      },
      syncCursor: {
        create: {
          deviceId: body.deviceId,
          clientVersion: body.clientVersion ?? 1,
        },
      },
    },
  });
  return created.id;
}

/** Reject absurd payloads that could DoS the sync merge loop. */
function validateSyncBody(body: SyncPushBody): string | null {
  if (!body.deviceId || body.deviceId.length > 128) {
    return "deviceId invalid";
  }
  if (!body.snapshot || body.snapshot.version !== 1) {
    return "snapshot.version must be 1";
  }
  const s = body.snapshot;
  if ((s.mistakes?.length ?? 0) > 5000) return "mistakes payload too large";
  if ((s.notes?.length ?? 0) > 5000) return "notes payload too large";
  if ((s.bookmarks?.length ?? 0) > 5000) return "bookmarks payload too large";
  if (Object.keys(s.ayahProgress || {}).length > 20000) {
    return "ayahProgress payload too large";
  }
  return null;
}

export async function pushAndMergeProgress(
  body: SyncPushBody,
  options?: { sessionUserId?: string | null }
): Promise<SyncPullResult> {
  if (!isDatabaseConfigured() || !prisma) {
    return {
      ok: true,
      mode: "local_only",
      synced: false,
      message:
        "قاعدة البيانات غير مُعدّة — التقدم محفوظ محلياً فقط. أضف DATABASE_URL (Supabase) للمزامنة السحابية.",
      snapshot: body.snapshot,
    };
  }

  try {
    const validationError = validateSyncBody(body);
    if (validationError) {
      return {
        ok: false,
        mode: "cloud",
        synced: false,
        error: validationError,
      };
    }

    const userId = await resolveUser(body, options?.sessionUserId);
    if (!userId) {
      return {
        ok: false,
        mode: "cloud",
        synced: false,
        error: "تعذّر إنشاء/ربط المستخدم",
      };
    }

    const snap = body.snapshot;

    // Profile + preferences
    if (snap.profile) {
      await prisma.profile.upsert({
        where: { userId },
        create: {
          userId,
          pagesPerDay: snap.profile.pagesPerDay ?? 1,
          revisionSessionsPerDay: snap.profile.revisionSessionsPerDay ?? 2,
          dailyMinutes: snap.profile.dailyMinutes ?? 45,
          memorizationStrength: snap.profile.memorizationStrength ?? 3,
          revisionStyle: mapRevisionStyle(snap.profile.revisionStyle),
          onboardingComplete: snap.profile.onboardingComplete,
          preferredQariId: snap.profile.preferredQariId ?? "alafasy",
          targetPlan: asJson(snap.profile.plan),
          memorizationSelection: asJson(snap.profile.memorizationSelection),
          preferences: buildProfilePreferences(snap.profile),
          streak: snap.streak?.current ?? 0,
          longestStreak: snap.streak?.longest ?? 0,
          lastStreakDate: snap.streak?.lastActiveDate
            ? dayDate(snap.streak.lastActiveDate)
            : undefined,
        },
        update: {
          pagesPerDay: snap.profile.pagesPerDay ?? 1,
          revisionSessionsPerDay: snap.profile.revisionSessionsPerDay ?? 2,
          dailyMinutes: snap.profile.dailyMinutes ?? 45,
          memorizationStrength: snap.profile.memorizationStrength ?? 3,
          revisionStyle: mapRevisionStyle(snap.profile.revisionStyle),
          // Sticky true: never downgrade completed onboarding from a stale client push
          ...(snap.profile.onboardingComplete === true
            ? { onboardingComplete: true }
            : {}),
          preferredQariId: snap.profile.preferredQariId ?? "alafasy",
          // Only write plan when present — do not null out a completed plan
          ...(snap.profile.plan
            ? { targetPlan: asJson(snap.profile.plan) }
            : {}),
          ...(snap.profile.memorizationSelection
            ? {
                memorizationSelection: asJson(
                  snap.profile.memorizationSelection
                ),
              }
            : {}),
          preferences: buildProfilePreferences(snap.profile),
          streak: snap.streak?.current ?? undefined,
          longestStreak: snap.streak?.longest ?? undefined,
          lastStreakDate: snap.streak?.lastActiveDate
            ? dayDate(snap.streak.lastActiveDate)
            : undefined,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { name: snap.profile.name || undefined },
      });
    }

    // Journey
    if (snap.journey?.date) {
      await prisma.journeyProgress.upsert({
        where: {
          userId_date: {
            userId,
            date: dayDate(snap.journey.date),
          },
        },
        create: {
          userId,
          date: dayDate(snap.journey.date),
          completedStepIds: snap.journey.completedStepIds || [],
          finished: snap.journey.finished,
          streakCount: snap.streak?.current ?? 0,
          startedAt: snap.journey.startedAt
            ? new Date(snap.journey.startedAt)
            : undefined,
          finishedAt: snap.journey.finishedAt
            ? new Date(snap.journey.finishedAt)
            : undefined,
          payload: snap.journey as object,
        },
        update: {
          completedStepIds: snap.journey.completedStepIds || [],
          finished: snap.journey.finished,
          streakCount: snap.streak?.current ?? 0,
          startedAt: snap.journey.startedAt
            ? new Date(snap.journey.startedAt)
            : undefined,
          finishedAt: snap.journey.finishedAt
            ? new Date(snap.journey.finishedAt)
            : undefined,
          payload: snap.journey as object,
        },
      });
    }

    // Mistakes (by clientId)
    for (const m of snap.mistakes || []) {
      await prisma.mistake.upsert({
        where: {
          userId_clientId: { userId, clientId: m.id },
        },
        create: {
          userId,
          clientId: m.id,
          surahId: m.surahNumber,
          ayahNumber: m.ayahNumber,
          pageNumber: m.pageNumber ?? 0,
          type: mapMistakeType(m.type),
          typeRaw: m.type,
          difficulty: m.difficulty ?? 3,
          frequency: m.frequency ?? 1,
          note: m.note,
          createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
          updatedAt: m.updatedAt ? new Date(m.updatedAt) : undefined,
        },
        update: {
          frequency: m.frequency ?? 1,
          note: m.note,
          difficulty: m.difficulty ?? 3,
          type: mapMistakeType(m.type),
          typeRaw: m.type,
          ayahNumber: m.ayahNumber,
          pageNumber: m.pageNumber ?? 0,
          updatedAt: m.updatedAt ? new Date(m.updatedAt) : new Date(),
        },
      });
    }

    // Bookmarks
    for (const b of snap.bookmarks || []) {
      await prisma.bookmark.upsert({
        where: {
          userId_clientId: { userId, clientId: b.id },
        },
        create: {
          userId,
          clientId: b.id,
          type: b.type,
          surahId: b.surahNumber,
          ayahNumber: b.ayahNumber,
          pageNumber: b.pageNumber,
          label: b.label,
          createdAt: b.createdAt ? new Date(b.createdAt) : undefined,
        },
        update: {
          type: b.type,
          surahId: b.surahNumber,
          ayahNumber: b.ayahNumber,
          pageNumber: b.pageNumber,
          label: b.label,
        },
      });
    }

    // Notes
    for (const n of snap.notes || []) {
      await prisma.note.upsert({
        where: {
          userId_clientId: { userId, clientId: n.id },
        },
        create: {
          userId,
          clientId: n.id,
          content: n.content,
          surahId: n.surahNumber,
          ayahNumber: n.ayahNumber,
          pageNumber: n.pageNumber,
          tag: n.tag,
          createdAt: n.createdAt ? new Date(n.createdAt) : undefined,
          updatedAt: n.updatedAt ? new Date(n.updatedAt) : undefined,
        },
        update: {
          content: n.content,
          surahId: n.surahNumber,
          ayahNumber: n.ayahNumber,
          pageNumber: n.pageNumber,
          tag: n.tag,
          updatedAt: n.updatedAt ? new Date(n.updatedAt) : new Date(),
        },
      });
    }

    // Ayah progress
    for (const [key, p] of Object.entries(snap.ayahProgress || {})) {
      const [s, a] = key.split(":").map(Number);
      const surahNumber = p.surahNumber || s;
      const ayahNumber = p.ayahNumber || a;
      if (!surahNumber || !ayahNumber) continue;
      await prisma.ayahProgress.upsert({
        where: {
          userId_surahNumber_ayahNumber: {
            userId,
            surahNumber,
            ayahNumber,
          },
        },
        create: {
          userId,
          surahNumber,
          ayahNumber,
          listenCount: p.listenCount ?? 0,
          practiceCount: p.practiceCount ?? 0,
          successTests: p.successTests ?? 0,
          failTests: p.failTests ?? 0,
          confidence: p.confidence ?? 0,
          status: p.status ?? "NOT_STARTED",
          memorizedAt: p.memorizedAt ? new Date(p.memorizedAt) : undefined,
          lastRevisedAt: p.lastRevisedAt
            ? new Date(p.lastRevisedAt)
            : undefined,
          attemptsToMaster: p.attemptsToMaster,
        },
        update: {
          listenCount: p.listenCount ?? 0,
          practiceCount: p.practiceCount ?? 0,
          successTests: p.successTests ?? 0,
          failTests: p.failTests ?? 0,
          confidence: p.confidence ?? 0,
          status: p.status ?? "NOT_STARTED",
          memorizedAt: p.memorizedAt ? new Date(p.memorizedAt) : undefined,
          lastRevisedAt: p.lastRevisedAt
            ? new Date(p.lastRevisedAt)
            : undefined,
          attemptsToMaster: p.attemptsToMaster,
        },
      });
    }

    // Recitation progress per surah
    for (const r of Object.values(snap.recitationProgress || {})) {
      await prisma.recitationProgress.upsert({
        where: {
          userId_surahNumber: {
            userId,
            surahNumber: r.surahNumber,
          },
        },
        create: {
          userId,
          surahNumber: r.surahNumber,
          lastCompletedAyah: r.lastCompletedAyah ?? 0,
          continueFromAyah: r.continueFromAyah ?? 1,
          totalAyahs: r.totalAyahs ?? 0,
          accuracy: r.accuracy,
          mistakesCount: r.mistakesCount,
          lastSessionAt: r.lastSessionAt
            ? new Date(r.lastSessionAt)
            : undefined,
        },
        update: {
          lastCompletedAyah: r.lastCompletedAyah ?? 0,
          continueFromAyah: r.continueFromAyah ?? 1,
          totalAyahs: r.totalAyahs ?? 0,
          accuracy: r.accuracy,
          mistakesCount: r.mistakesCount,
          lastSessionAt: r.lastSessionAt
            ? new Date(r.lastSessionAt)
            : undefined,
        },
      });
    }

    // Application LearningSnapshot — structured merge (never pure LWW on cursor)
    if (snap.learningSnapshot) {
      const validation = validateLearningSnapshotCloud(snap.learningSnapshot);
      if (!validation.ok) {
        console.warn(
          "[sync] rejected invalid learningSnapshot:",
          validation.errors.join("; ")
        );
      } else if (!isForecastOnlyLearningSnapshot(snap.learningSnapshot)) {
        const clientUpdatedAt = snap.learningSnapshot.updatedAt
          ? new Date(snap.learningSnapshot.updatedAt)
          : new Date(snap.updatedAt || Date.now());
        const existing = await prisma.learningStateSnapshot.findUnique({
          where: { userId },
        });
        const existingPayload =
          (existing?.payload as LearningSnapshotCloud | null) || null;
        const incoming = stripForecast(snap.learningSnapshot);
        // Merge Actual: cursor never regresses; SRS by id; forecast dropped
        const mergedLearning =
          mergeLearningSnapshots(existingPayload, incoming) || incoming;

        await prisma.learningStateSnapshot.upsert({
          where: { userId },
          create: {
            userId,
            payload: asJson(mergedLearning) as Prisma.InputJsonValue,
            deviceId: body.deviceId,
            clientVersion: body.clientVersion ?? 1,
            clientUpdatedAt,
          },
          update: {
            payload: asJson(mergedLearning) as Prisma.InputJsonValue,
            deviceId: body.deviceId,
            clientVersion: body.clientVersion ?? 1,
            clientUpdatedAt: new Date(
              Math.max(
                clientUpdatedAt.getTime(),
                existing?.clientUpdatedAt?.getTime() ?? 0
              )
            ),
          },
        });
      }
    }

    const now = new Date();
    await prisma.syncCursor.upsert({
      where: { userId },
      create: {
        userId,
        lastSyncedAt: now,
        clientVersion: body.clientVersion ?? 1,
        deviceId: body.deviceId,
      },
      update: {
        lastSyncedAt: now,
        clientVersion: body.clientVersion ?? 1,
        deviceId: body.deviceId,
      },
    });

    const merged = await pullSnapshotForUser(userId, body.deviceId);

    return {
      ok: true,
      mode: "cloud",
      synced: true,
      userId,
      lastSyncedAt: now.toISOString(),
      snapshot: merged,
      message: "تمت مزامنة تقدمك مع السحابة",
    };
  } catch (err) {
    console.error("[sync]", err);
    return {
      ok: false,
      mode: "cloud",
      synced: false,
      error: err instanceof Error ? err.message : "فشل المزامنة",
      snapshot: body.snapshot,
    };
  }
}

export async function pullSnapshotForUser(
  userId: string,
  deviceId: string
): Promise<ProgressSnapshot> {
  if (!prisma) {
    return {
      version: 1,
      deviceId,
      updatedAt: new Date().toISOString(),
      profile: null,
      journey: null,
      streak: null,
      mistakes: [],
      bookmarks: [],
      notes: [],
      achievements: {},
      ayahProgress: {},
      memStats: null,
      recitationProgress: {},
      readerPos: null,
      learningSnapshot: null,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      mistakes: true,
      bookmarks: true,
      notes: true,
      ayahProgress: true,
      recitationProgress: true,
      learningState: true,
      journeyProgress: {
        orderBy: { date: "desc" },
        take: 1,
      },
    },
  });

  const profile = user?.profile;
  const journeyRow = user?.journeyProgress[0];

  const ayahProgress: ProgressSnapshot["ayahProgress"] = {};
  for (const p of user?.ayahProgress || []) {
    ayahProgress[`${p.surahNumber}:${p.ayahNumber}`] = {
      surahNumber: p.surahNumber,
      ayahNumber: p.ayahNumber,
      listenCount: p.listenCount,
      practiceCount: p.practiceCount,
      successTests: p.successTests,
      failTests: p.failTests,
      confidence: p.confidence,
      status: p.status as ProgressSnapshot["ayahProgress"][string]["status"],
      memorizedAt: p.memorizedAt?.toISOString(),
      lastRevisedAt: p.lastRevisedAt?.toISOString(),
      attemptsToMaster: p.attemptsToMaster ?? undefined,
    };
  }

  const recitationProgress: ProgressSnapshot["recitationProgress"] = {};
  for (const r of user?.recitationProgress || []) {
    recitationProgress[String(r.surahNumber)] = {
      surahNumber: r.surahNumber,
      lastCompletedAyah: r.lastCompletedAyah,
      continueFromAyah: r.continueFromAyah,
      totalAyahs: r.totalAyahs,
      lastSessionAt: r.lastSessionAt?.toISOString() || new Date().toISOString(),
      accuracy: r.accuracy ?? undefined,
      mistakesCount: r.mistakesCount ?? undefined,
    };
  }

  const prefs = (profile?.preferences || {}) as {
    goals?: string[];
    learningStyle?: HafizProfile["learningStyle"];
    journey?: HafizProfile["journey"];
    learningGoalId?: HafizProfile["learningGoalId"];
    progressionMode?: HafizProfile["progressionMode"];
    intentUpdatedAt?: string;
    revisionPagesPerDay?: number;
  };

  const rebuiltProfile: HafizProfile | null = profile
    ? {
        version: 2,
        completedAt: profile.updatedAt.toISOString(),
        name: user?.name || "",
        pagesPerDay: profile.pagesPerDay,
        revisionSessionsPerDay: profile.revisionSessionsPerDay,
        revisionPagesPerDay: prefs.revisionPagesPerDay,
        dailyMinutes: profile.dailyMinutes,
        memorizationStrength: Math.min(
          5,
          Math.max(1, profile.memorizationStrength)
        ) as 1 | 2 | 3 | 4 | 5,
        revisionStyle:
          profile.revisionStyle === "INTENSIVE"
            ? "intensive"
            : profile.revisionStyle === "LIGHT"
              ? "light"
              : "balanced",
        goals: prefs.goals || [],
        onboardingComplete: profile.onboardingComplete,
        preferredQariId: profile.preferredQariId || "alafasy",
        plan: (profile.targetPlan as unknown as HafizProfile["plan"]) || undefined,
        memorizationSelection:
          (profile.memorizationSelection as unknown as HafizProfile["memorizationSelection"]) ||
          undefined,
        learningStyle: prefs.learningStyle,
        journey: prefs.journey,
        // User Intent — restored fully from preferences
        learningGoalId: prefs.learningGoalId,
        progressionMode: prefs.progressionMode,
        intentUpdatedAt: prefs.intentUpdatedAt,
      }
    : null;

  return {
    version: 1,
    deviceId,
    updatedAt: new Date().toISOString(),
    profile: rebuiltProfile,
    journey: journeyRow
      ? {
          date: journeyRow.date.toISOString().slice(0, 10),
          completedStepIds: journeyRow.completedStepIds,
          finished: journeyRow.finished,
          startedAt: journeyRow.startedAt?.toISOString(),
          finishedAt: journeyRow.finishedAt?.toISOString(),
        }
      : null,
    streak: profile
      ? {
          current: profile.streak,
          longest: profile.longestStreak,
          lastActiveDate: profile.lastStreakDate
            ? profile.lastStreakDate.toISOString().slice(0, 10)
            : "",
          totalDays: profile.streak,
        }
      : null,
    mistakes: (user?.mistakes || []).map(
      (m: {
        clientId: string | null;
        id: string;
        surahId: number;
        ayahNumber: number | null;
        pageNumber: number | null;
        typeRaw: string | null;
        type: string;
        difficulty: number;
        frequency: number;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        id: m.clientId || m.id,
        surahNumber: m.surahId,
        ayahNumber: m.ayahNumber ?? undefined,
        pageNumber: m.pageNumber || undefined,
        type: m.typeRaw || m.type,
        difficulty: m.difficulty,
        frequency: m.frequency,
        note: m.note ?? undefined,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })
    ),
    bookmarks: (user?.bookmarks || []).map(
      (b: {
        clientId: string | null;
        id: string;
        type: string;
        surahId: number | null;
        ayahNumber: number | null;
        pageNumber: number | null;
        label: string | null;
        createdAt: Date;
      }) => ({
        id: b.clientId || b.id,
        type: b.type as "ayah" | "surah" | "page" | "session",
        surahNumber: b.surahId ?? undefined,
        ayahNumber: b.ayahNumber ?? undefined,
        pageNumber: b.pageNumber ?? undefined,
        label: b.label || "",
        createdAt: b.createdAt.toISOString(),
      })
    ),
    notes: (user?.notes || []).map(
      (n: {
        clientId: string | null;
        id: string;
        content: string;
        surahId: number | null;
        ayahNumber: number | null;
        pageNumber: number | null;
        tag: string | null;
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        id: n.clientId || n.id,
        content: n.content,
        surahNumber: n.surahId ?? undefined,
        ayahNumber: n.ayahNumber ?? undefined,
        pageNumber: n.pageNumber ?? undefined,
        tag: n.tag ?? undefined,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })
    ),
    achievements: {},
    ayahProgress,
    memStats: null,
    recitationProgress,
    readerPos: null,
    learningSnapshot: stripForecast(
      (user?.learningState?.payload as LearningSnapshotCloud | null) || null
    ),
  };
}

/** Persist full User Intent into Profile.preferences JSON (no schema migration). */
function buildProfilePreferences(
  profile: HafizProfile
): Prisma.InputJsonValue {
  return {
    goals: profile.goals,
    learningStyle: profile.learningStyle,
    journey: profile.journey,
    learningGoalId: profile.learningGoalId,
    progressionMode: profile.progressionMode,
    revisionPagesPerDay: profile.revisionPagesPerDay,
    intentUpdatedAt:
      profile.intentUpdatedAt ||
      profile.completedAt ||
      new Date().toISOString(),
  } as Prisma.InputJsonValue;
}
