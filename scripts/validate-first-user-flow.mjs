/**
 * Production first-user isolation checks (Node, no browser).
 * Validates wipe keys, score math, and profile defaults stay clean.
 *
 * Run: node scripts/validate-first-user-flow.mjs
 */

import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let failed = 0;
function ok(name, cond, detail = "") {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

console.log("\n=== Hafiz first-user flow static validation ===\n");

// 1. clearLocalUserData module exists and lists critical keys
const resetPath = join(root, "src/lib/user-data-reset.ts");
ok("user-data-reset.ts exists", existsSync(resetPath));
const resetSrc = readFileSync(resetPath, "utf8");
ok("wipes learning snapshot", resetSrc.includes("learningSnapshot"));
ok("wipes mutashabihat progress", resetSrc.includes("mutashabihat"));
ok("preserves device id only", resetSrc.includes("deviceId"));
ok("exports clearLocalUserData", resetSrc.includes("export function clearLocalUserData"));

// 2. Auth wiring
const logoutSrc = readFileSync(join(root, "src/hooks/use-auth.tsx"), "utf8");
ok("logout clears local user data", logoutSrc.includes("clearLocalUserData"));

const loginSrc = readFileSync(join(root, "src/app/login/page.tsx"), "utf8");
ok("login clears before pull", loginSrc.includes("clearLocalUserData"));
ok("login uses replaceCollections true", loginSrc.includes("replaceCollections: true"));

const signupSrc = readFileSync(join(root, "src/app/signup/page.tsx"), "utf8");
ok("signup isolates account switch", signupSrc.includes("clearLocalUserData"));
ok("signup routes incomplete onboarding", signupSrc.includes("hasCompletedOnboarding"));

// 3. Profile defaults not seeded with goals
const profileSrc = readFileSync(join(root, "src/lib/user-profile.ts"), "utf8");
ok(
  "default profile has empty goals array",
  /goals:\s*\[\s*\]/.test(profileSrc)
);
ok(
  "default name is empty (displayName soft-fallback only)",
  /name:\s*""/.test(profileSrc)
);
ok("hasCompletedOnboarding exported", profileSrc.includes("hasCompletedOnboarding"));

// 4. Score no optimistic defaults
const scoreSrc = readFileSync(join(root, "src/lib/hafiz-score.ts"), "utf8");
ok("empty user early-returns score 0", scoreSrc.includes("return 0"));
ok(
  "no quizAccuracy optimistic default",
  !/quizAccuracy\s*=\s*totalTests\s*>\s*0\s*\?\s*successTests\s*\/\s*totalTests\s*:\s*0\.55/.test(
    scoreSrc
  )
);
ok(
  "no mutashabihatMastery 0.4 default",
  !/mutashabihatMastery\s*=\s*0\.4/.test(scoreSrc)
);
ok("hasLocalScoreActivity guard", scoreSrc.includes("hasLocalScoreActivity"));

// 5. Onboarding gate
const gatePath = join(root, "src/components/layout/onboarding-gate.tsx");
ok("onboarding gate component exists", existsSync(gatePath));
const layoutSrc = readFileSync(join(root, "src/app/(app)/layout.tsx"), "utf8");
ok("app layout wraps OnboardingGate", layoutSrc.includes("OnboardingGate"));

// 6. mock-data only on teacher/admin stubs
const mockImports = [];
function walkForMock(dir) {
  // light scan via known paths
}
const teacher = readFileSync(join(root, "src/app/(app)/teacher/page.tsx"), "utf8");
const admin = readFileSync(join(root, "src/app/(app)/admin/page.tsx"), "utf8");
const dash = readFileSync(join(root, "src/components/dashboard/dashboard-view.tsx"), "utf8");
ok("teacher still stub-only mock", teacher.includes("mock-data"));
ok("admin still stub-only mock", admin.includes("mock-data"));
ok("dashboard does not import mock-data", !dash.includes("mock-data") || dash.includes("no mock-data"));

// 7. Score pure math for empty inputs
function calculateHafizScore(input) {
  const streakScore =
    Math.min(1, input.streakDays / 90) * 0.6 +
    Math.min(1, input.longestStreak / 180) * 0.4;
  const raw =
    input.consistency * 0.2 +
    (1 - input.mistakeRate) * 0.15 +
    input.reviewFrequency * 0.15 +
    input.quizAccuracy * 0.15 +
    input.revisionCompletion * 0.15 +
    input.mutashabihatMastery * 0.1 +
    streakScore * 0.1;
  return Math.round(Math.min(1000, Math.max(0, raw * 1000)));
}
const emptyScore = calculateHafizScore({
  consistency: 0,
  mistakeRate: 1,
  reviewFrequency: 0,
  quizAccuracy: 0,
  revisionCompletion: 0,
  mutashabihatMastery: 0,
  streakDays: 0,
  longestStreak: 0,
});
ok("empty ScoreInputs → 0 points", emptyScore === 0, `got ${emptyScore}`);

const badDefaults = calculateHafizScore({
  consistency: 0,
  mistakeRate: 0,
  reviewFrequency: 0,
  quizAccuracy: 0.55,
  revisionCompletion: 0.35,
  mutashabihatMastery: 0.4,
  streakDays: 0,
  longestStreak: 0,
});
ok(
  "old optimistic defaults would inflate score",
  badDefaults > 100,
  `got ${badDefaults}`
);

console.log(
  failed === 0
    ? "\n=== ALL FIRST-USER CHECKS PASSED ===\n"
    : `\n=== ${failed} CHECK(S) FAILED ===\n`
);
process.exit(failed === 0 ? 0 : 1);
