import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import {
  buildHafizScoreFromSignals,
  type MemoryRow,
} from "@/lib/api/learning-api-data";

/**
 * GET /api/v1/analytics/hafiz-score
 * Real score from cloud learning snapshot + profile streak when available.
 * Without auth/DB: local_only empty (client uses computeLocalHafizScore).
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session?.userId || !isDatabaseConfigured() || !prisma) {
      return NextResponse.json({
        data: {
          score: 0,
          tier: "محلي",
          trend: "stable",
          history: [],
          streak: 0,
          longestStreak: 0,
          source: "local_only",
          message:
            "احسب الدرجة محلياً على الجهاز، أو سجّل الدخول مع قاعدة بيانات للمزامنة.",
        },
      });
    }

    const [state, profile, mistakeAgg] = await Promise.all([
      prisma.learningStateSnapshot.findUnique({
        where: { userId: session.userId },
      }),
      prisma.profile.findUnique({ where: { userId: session.userId } }),
      prisma.mistake.aggregate({
        where: { userId: session.userId, resolved: false },
        _sum: { frequency: true },
        _count: true,
      }),
    ]);

    const payload = (state?.payload || {}) as {
      revisionMemory?: MemoryRow[];
    };
    const memory = Array.isArray(payload.revisionMemory)
      ? payload.revisionMemory
      : [];

    const built = buildHafizScoreFromSignals({
      revisionMemory: memory,
      streak: {
        current: profile?.streak ?? 0,
        longest: profile?.longestStreak ?? 0,
        totalDays: profile?.streak ?? 0,
      },
      mistakeHits: mistakeAgg._sum.frequency ?? 0,
      mistakesCount: mistakeAgg._count ?? 0,
      practiceSessions: memory.reduce(
        (s, m) => s + (m.reviewCount ?? 0),
        0
      ),
      mutashabihatAccuracy:
        memory.length > 0
          ? Math.round(
              (memory.reduce((s, m) => s + (m.successRate ?? 0.5), 0) /
                memory.length) *
                100
            )
          : undefined,
    });

    return NextResponse.json({
      data: {
        ...built,
        source: "learning_snapshot",
        userId: session.userId,
      },
    });
  } catch (err) {
    console.error("[api/analytics/hafiz-score]", err);
    return NextResponse.json(
      {
        error: {
          code: "HAFIZ_SCORE_FAILED",
          message:
            err instanceof Error ? err.message : "تعذّر حساب درجة الحافظ",
        },
        data: {
          score: 0,
          tier: "—",
          trend: "stable",
          history: [],
          source: "error",
        },
      },
      { status: 500 }
    );
  }
}
