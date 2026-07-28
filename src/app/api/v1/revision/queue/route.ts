import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import {
  buildRevisionQueueFromMemory,
  type MemoryRow,
} from "@/lib/api/learning-api-data";

/**
 * GET /api/v1/revision/queue
 * Real SRS queue from LearningStateSnapshot (cloud) when authenticated + DB.
 * Without auth/DB: returns empty local_only payload (client uses local engine).
 */
export async function GET(req: NextRequest) {
  const asOf =
    req.nextUrl.searchParams.get("asOf") ||
    new Date().toISOString().slice(0, 10);
  const limit = Math.min(
    40,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 16))
  );

  try {
    const session = await getSession();

    if (!session?.userId || !isDatabaseConfigured() || !prisma) {
      return NextResponse.json({
        data: {
          queue: [],
          predictive: [],
          generatedAt: new Date().toISOString(),
          asOfDate: asOf,
          totalMemory: 0,
          source: "local_only",
          message:
            "لا جلسة سحابية — استخدم محرّك الجهاز المحلي (لوحة التحكم / رحلة اليوم).",
        },
      });
    }

    const row = await prisma.learningStateSnapshot.findUnique({
      where: { userId: session.userId },
    });

    const payload = (row?.payload || {}) as {
      revisionMemory?: MemoryRow[];
    };
    const memory = Array.isArray(payload.revisionMemory)
      ? payload.revisionMemory
      : [];

    const built = buildRevisionQueueFromMemory(memory, {
      asOfDate: asOf,
      limit,
    });

    return NextResponse.json({
      data: {
        queue: built.queue,
        predictive: built.predictive,
        generatedAt: new Date().toISOString(),
        asOfDate: built.asOfDate,
        totalMemory: built.totalMemory,
        source: "learning_snapshot",
        userId: session.userId,
      },
    });
  } catch (err) {
    console.error("[api/revision/queue]", err);
    return NextResponse.json(
      {
        error: {
          code: "REVISION_QUEUE_FAILED",
          message:
            err instanceof Error ? err.message : "تعذّر تحميل طابور المراجعة",
        },
        data: {
          queue: [],
          predictive: [],
          generatedAt: new Date().toISOString(),
          source: "error",
        },
      },
      { status: 500 }
    );
  }
}
