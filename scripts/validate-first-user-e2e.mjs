/**
 * Live first-user isolation E2E against Supabase (Prisma).
 * Simulates: clean signup → empty progress → session activity →
 * second account isolation → re-login restore.
 *
 * Run: node scripts/validate-first-user-e2e.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function loadEnvLocal() {
  const p = resolve(root, ".env.local");
  if (!existsSync(p)) throw new Error(".env.local missing");
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
  if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("\nHafiz — First-user E2E (DB isolation)\n");
  loadEnvLocal();
  assert(process.env.DATABASE_URL, "DATABASE_URL required");

  const { PrismaClient } = require("@prisma/client");
  const bcrypt = require("bcryptjs");
  const prisma = new PrismaClient();

  const email = `hafiz.firstuser.${Date.now()}@example.com`;
  const password = "FirstUser-E2E-99";
  const guestKey = `firstuser_dev_${Date.now()}`;
  let userId = null;
  let user2Id = null;

  try {
    await prisma.$queryRaw`SELECT 1 as ok`;
    console.log("  ✓ DB connected");

    // ── Create brand-new user (signup equivalent) ──
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: "First User",
        passwordHash,
        emailVerified: new Date(),
        guestKey,
        profile: {
          create: {
            onboardingComplete: false,
            preferredQariId: "alafasy",
            streak: 0,
            longestStreak: 0,
            hafizScore: 0,
          },
        },
        syncCursor: {
          create: { deviceId: guestKey, clientVersion: 1 },
        },
      },
    });
    userId = user.id;
    console.log("  ✓ Brand-new account created:", email);

    // ── New user must have empty progress tables ──
    const [
      mistakes,
      notes,
      bookmarks,
      achievements,
      learningSnap,
      ayahProg,
      journey,
    ] = await Promise.all([
      prisma.mistake.count({ where: { userId } }),
      prisma.note.count({ where: { userId } }),
      prisma.bookmark.count({ where: { userId } }),
      prisma.userAchievement.count({ where: { userId } }),
      prisma.learningStateSnapshot.findUnique({ where: { userId } }),
      prisma.ayahProgress.count({ where: { userId } }),
      prisma.journeyProgress.count({ where: { userId } }),
    ]);

    assert(mistakes === 0, "new user must have 0 mistakes");
    assert(notes === 0, "new user must have 0 notes");
    assert(bookmarks === 0, "new user must have 0 bookmarks");
    assert(achievements === 0, "new user must have 0 achievements");
    assert(!learningSnap, "new user must have no learning snapshot");
    assert(ayahProg === 0, "new user must have 0 ayah progress");
    assert(journey === 0, "new user must have 0 journey rows");
    console.log("  ✓ Cloud progress completely empty for new user");

    const profile = await prisma.profile.findUnique({ where: { userId } });
    assert(profile, "profile row exists");
    assert(profile.onboardingComplete === false, "onboarding incomplete");
    assert(profile.streak === 0, "streak starts at 0");
    assert(profile.hafizScore === 0, "hafiz score starts at 0");
    console.log("  ✓ Onboarding incomplete; streak=0; score=0");

    // ── Finish onboarding ──
    await prisma.profile.update({
      where: { userId },
      data: {
        onboardingComplete: true,
        pagesPerDay: 1,
        dailyMinutes: 45,
        preferences: { goals: ["الانتظام"], displayName: "First User" },
        memorizationSelection: {
          mode: "SURAH",
          surahSelections: [{ surah: 1, strength: "GOOD" }],
          juzSelections: [],
        },
      },
    });
    console.log("  ✓ Onboarding completed + profile saved");

    // ── Simulate one session ──
    const asOf = new Date().toISOString().slice(0, 10);
    await prisma.profile.update({
      where: { userId },
      data: {
        streak: 1,
        longestStreak: 1,
        lastStreakDate: new Date(asOf + "T00:00:00.000Z"),
        hafizScore: 120,
      },
    });
    await prisma.mistake.create({
      data: {
        userId,
        clientId: `mistake_fu_${Date.now()}`,
        surahId: 1,
        ayahNumber: 1,
        pageNumber: 1,
        type: "HARAKA",
        typeRaw: "HARAKA",
        difficulty: 2,
        frequency: 1,
        note: "first session",
      },
    });
    await prisma.learningStateSnapshot.upsert({
      where: { userId },
      create: {
        userId,
        payload: {
          version: 1,
          updatedAt: new Date().toISOString(),
          userState: { sessionCount: 1 },
          revisionMemory: [],
          planCache: {},
        },
        deviceId: guestKey,
        clientVersion: 1,
        clientUpdatedAt: new Date(),
      },
      update: {
        payload: {
          version: 1,
          updatedAt: new Date().toISOString(),
          userState: { sessionCount: 1 },
          revisionMemory: [],
          planCache: {},
        },
        clientUpdatedAt: new Date(),
      },
    });
    await prisma.journeyProgress.create({
      data: {
        userId,
        date: new Date(asOf + "T00:00:00.000Z"),
        completedStepIds: ["step_1"],
        finished: false,
      },
    });
    console.log("  ✓ Session activity recorded (streak=1, mistake, snapshot, journey)");

    const after = await prisma.profile.findUnique({ where: { userId } });
    assert(after?.streak === 1, "streak should be 1 after session");
    assert(after?.hafizScore === 120, "score should update after session");
    const mCount = await prisma.mistake.count({ where: { userId } });
    assert(mCount === 1, "one mistake after session");
    console.log("  ✓ Score + streak updated correctly");

    // ── Second brand-new account must be empty ──
    const email2 = `hafiz.firstuser.b.${Date.now()}@example.com`;
    const user2 = await prisma.user.create({
      data: {
        email: email2,
        name: "Second User",
        passwordHash: await bcrypt.hash(password, 10),
        emailVerified: new Date(),
        guestKey: `firstuser_b_${Date.now()}`,
        profile: {
          create: {
            onboardingComplete: false,
            preferredQariId: "alafasy",
            streak: 0,
            longestStreak: 0,
            hafizScore: 0,
          },
        },
        syncCursor: {
          create: {
            deviceId: `firstuser_b_${Date.now()}`,
            clientVersion: 1,
          },
        },
      },
    });
    user2Id = user2.id;
    const u2mistakes = await prisma.mistake.count({
      where: { userId: user2.id },
    });
    const u2profile = await prisma.profile.findUnique({
      where: { userId: user2.id },
    });
    assert(u2mistakes === 0, "second user isolated from first mistakes");
    assert(u2profile?.streak === 0, "second user streak 0");
    assert(u2profile?.hafizScore === 0, "second user score 0");
    assert(u2profile?.onboardingComplete === false, "second user onboarding open");
    console.log("  ✓ Account isolation: second brand-new user is empty");

    // ── Re-login path: first user's progress intact ──
    const reloaded = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
        mistakes: true,
        learningState: true,
        journeyProgress: true,
      },
    });
    assert(reloaded?.profile?.onboardingComplete === true, "profile restored");
    assert(reloaded?.profile?.streak === 1, "streak restored");
    assert(reloaded?.profile?.hafizScore === 120, "score restored");
    assert(reloaded?.mistakes?.length === 1, "mistakes restored");
    assert(reloaded?.learningState, "learning snapshot restored");
    assert(reloaded?.journeyProgress?.length === 1, "journey restored");
    console.log("  ✓ Re-login cloud restore has exact same progress");

    // cleanup
    await prisma.user.delete({ where: { id: user2Id } });
    user2Id = null;
    await prisma.user.delete({ where: { id: userId } });
    userId = null;
    console.log("  ✓ Cleanup done");

    console.log("\n=== FIRST-USER E2E PASSED ===\n");
  } catch (e) {
    console.error("\nFAILED:", e.message || e);
    process.exitCode = 1;
    for (const id of [user2Id, userId]) {
      if (!id) continue;
      try {
        await prisma.user.delete({ where: { id } });
      } catch {
        /* ignore */
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
