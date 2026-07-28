/**
 * Production field test: signup → sync mistakes → login → verify DB row.
 * Does not print secrets.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const BASE = process.env.PROD_URL || "https://hafiz-brown.vercel.app";
const email = `hafiz.e2e.${Date.now()}@example.com`;
const password = "HafizE2E_Test_2026!";
const name = "E2E Sync Tester";

function loadEnvLocal() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      env[k] = v;
    }
  } catch {
    /* ignore */
  }
  return env;
}

function parseSetCookie(res) {
  // Node fetch may expose getSetCookie
  const headers = res.headers;
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeader(setCookies) {
  return setCookies
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function main() {
  console.log("BASE", BASE);
  console.log("EMAIL", email);

  // 1) Health / me before login
  const me0 = await fetch(`${BASE}/api/v1/auth/me`, { credentials: "include" });
  const me0j = await me0.json().catch(() => ({}));
  console.log("ME_BEFORE", me0.status, {
    databaseConfigured: me0j.databaseConfigured,
    authenticated: me0j.authenticated ?? me0j.user != null,
  });

  // 2) Signup
  const signupRes = await fetch(`${BASE}/api/v1/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  const signupBody = await signupRes.json().catch(() => ({}));
  const signupCookies = parseSetCookie(signupRes);
  const jar1 = cookieHeader(signupCookies);
  console.log("SIGNUP", signupRes.status, {
    ok: signupBody.ok,
    error: signupBody.error,
    userId: signupBody.user?.id || signupBody.userId,
    hasCookie: jar1.includes("hafiz_session"),
  });
  if (!signupRes.ok) {
    console.error("SIGNUP_FAILED", signupBody);
    process.exit(1);
  }

  const userId = signupBody.user?.id || signupBody.userId;

  // 3) Sync with a mistake (browser A simulation)
  const snap = {
    version: 1,
    deviceId: "e2e_device_A",
    updatedAt: new Date().toISOString(),
    profile: {
      version: 2,
      name,
      onboardingComplete: true,
      pagesPerDay: 1,
      revisionSessionsPerDay: 2,
      dailyMinutes: 30,
      memorizationStrength: 3,
      revisionStyle: "balanced",
      goals: ["e2e"],
      preferredQariId: "alafasy",
      completedAt: new Date().toISOString(),
    },
    journey: null,
    streak: {
      current: 2,
      longest: 2,
      lastActiveDate: new Date().toISOString().slice(0, 10),
      totalDays: 2,
    },
    mistakes: [
      {
        id: `e2e_mistake_${Date.now()}`,
        surahNumber: 2,
        ayahNumber: 5,
        type: "WRONG_WORD",
        difficulty: 4,
        frequency: 1,
        note: "E2E live sync test · expected يُؤْمِنُونَ",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    bookmarks: [],
    notes: [],
    achievements: {},
    ayahProgress: {},
    memStats: null,
    recitationProgress: {},
    readerPos: null,
    learningSnapshot: null,
  };

  const syncRes = await fetch(`${BASE}/api/v1/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: jar1,
    },
    body: JSON.stringify({
      deviceId: "e2e_device_A",
      guestKey: "e2e_device_A",
      snapshot: snap,
      clientVersion: 1,
    }),
  });
  const syncBody = await syncRes.json().catch(() => ({}));
  console.log("SYNC_A", syncRes.status, {
    ok: syncBody.ok,
    mode: syncBody.mode,
    synced: syncBody.synced,
    error: syncBody.error,
    mistakeCount: syncBody.snapshot?.mistakes?.length,
  });
  if (!syncBody.ok || syncBody.mode === "local_only") {
    console.error("SYNC_NOT_CLOUD", syncBody);
    process.exit(1);
  }

  // 4) Login as browser B (fresh cookie)
  const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  const jar2 = cookieHeader(parseSetCookie(loginRes));
  console.log("LOGIN_B", loginRes.status, {
    ok: loginBody.ok,
    hasCookie: jar2.includes("hafiz_session"),
    error: loginBody.error,
  });
  if (!loginRes.ok) {
    process.exit(1);
  }

  // 5) Pull via sync with empty-ish local on B — should return cloud mistakes
  const pullRes = await fetch(`${BASE}/api/v1/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: jar2,
    },
    body: JSON.stringify({
      deviceId: "e2e_device_B",
      guestKey: "e2e_device_B",
      snapshot: {
        version: 1,
        deviceId: "e2e_device_B",
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
      },
      clientVersion: 1,
    }),
  });
  const pullBody = await pullRes.json().catch(() => ({}));
  const cloudMistakes = pullBody.snapshot?.mistakes || [];
  const hasE2E = cloudMistakes.some(
    (m) => m.note && String(m.note).includes("E2E live sync")
  );
  console.log("PULL_B", pullRes.status, {
    ok: pullBody.ok,
    mode: pullBody.mode,
    mistakes: cloudMistakes.length,
    hasE2EMistake: hasE2E,
  });

  // 6) Direct DB verification via Prisma
  const env = loadEnvLocal();
  const r = spawnSync(
    "node",
    ["scripts/prod-db-verify.mjs", email],
    {
      env,
      encoding: "utf8",
      shell: true,
      cwd: process.cwd(),
    }
  );
  console.log("DB_CHECK", (r.stdout || "").trim());
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(1);
  }

  const db = JSON.parse((r.stdout || "").trim());
  if (!db.userFound || !db.e2eNote || !hasE2E) {
    console.error("FIELD_TEST_FAILED");
    process.exit(1);
  }

  console.log("FIELD_TEST_PASS 100%");
  console.log(
    JSON.stringify({
      productionUrl: BASE,
      testEmail: email,
      cloudMode: syncBody.mode,
      crossBrowserMistakeVisible: hasE2E,
      supabaseUserRow: true,
      supabaseMistakeRow: true,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
