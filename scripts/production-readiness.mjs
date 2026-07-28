/**
 * Hafiz production readiness checks (no live DB required).
 * Run: node scripts/production-readiness.mjs
 *
 * Exit 0 = code-level ready for first deploy (still need real DATABASE_URL for cloud).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const issues = [];
const warnings = [];
const ok = [];

function pass(msg) {
  ok.push(msg);
  console.log("  ✓", msg);
}
function warn(msg) {
  warnings.push(msg);
  console.log("  ⚠", msg);
}
function fail(msg) {
  issues.push(msg);
  console.log("  ✗", msg);
}

console.log("\nHafiz — Production readiness audit\n");

// 1) Schema
const schemaPath = resolve(root, "prisma/schema.prisma");
if (!existsSync(schemaPath)) {
  fail("prisma/schema.prisma missing");
} else {
  const schema = readFileSync(schemaPath, "utf8");
  if (schema.includes('provider  = "postgresql"') || schema.includes('provider = "postgresql"')) {
    pass("Prisma provider is postgresql");
  } else {
    fail("Prisma provider is not postgresql");
  }
  if (schema.includes("env(\"DATABASE_URL\")")) pass("DATABASE_URL wired in schema");
  else fail("DATABASE_URL not in schema");
  if (schema.includes("env(\"DIRECT_URL\")")) pass("DIRECT_URL wired in schema (Supabase migrations)");
  else warn("DIRECT_URL not in schema");
  if (schema.includes("model LearningStateSnapshot")) pass("LearningStateSnapshot model present");
  else fail("LearningStateSnapshot model missing");
  if (schema.includes("passwordHash")) pass("User.passwordHash present for credentials auth");
  else fail("User.passwordHash missing");
  if (schema.includes("guestKey")) pass("User.guestKey present for guest sync");
  else fail("User.guestKey missing");
  if (schema.includes("model SyncCursor")) pass("SyncCursor model present");
  else warn("SyncCursor missing");
  if (schema.includes("model Profile")) pass("Profile model present");
  else fail("Profile model missing");
}

// 2) Env example
const envEx = resolve(root, ".env.example");
if (!existsSync(envEx)) {
  fail(".env.example missing");
} else {
  const env = readFileSync(envEx, "utf8");
  for (const key of ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET"]) {
    if (env.includes(key)) pass(`.env.example documents ${key}`);
    else fail(`.env.example missing ${key}`);
  }
  if (env.includes("REQUIRE_AUTH")) pass(".env.example documents REQUIRE_AUTH");
  else warn("REQUIRE_AUTH not documented");
}

// 3) Critical source files
const requiredFiles = [
  "src/lib/auth/actions.ts",
  "src/lib/auth/session.ts",
  "src/lib/auth/password.ts",
  "src/lib/auth/config.ts",
  "src/lib/sync/server-sync.ts",
  "src/lib/sync/local-snapshot.ts",
  "src/app/api/v1/sync/route.ts",
  "src/app/api/v1/auth/login/route.ts",
  "src/app/api/v1/auth/signup/route.ts",
  "src/middleware.ts",
  "docs/PRODUCTION.md",
];
for (const f of requiredFiles) {
  if (existsSync(resolve(root, f))) pass(`exists ${f}`);
  else fail(`missing ${f}`);
}

// 4) Auth production guards
const authConfig = readFileSync(resolve(root, "src/lib/auth/config.ts"), "utf8");
if (authConfig.includes("change-me") && authConfig.includes("production")) {
  pass("Auth rejects insecure secrets in production");
} else {
  warn("Could not confirm production AUTH_SECRET rejection");
}

// 4b) Sync identity security
const serverSync = readFileSync(resolve(root, "src/lib/sync/server-sync.ts"), "utf8");
if (
  serverSync.includes("never trust client-supplied body.userId") ||
  !serverSync.match(/if \(body\.userId\)[\s\S]{0,80}findUnique/)
) {
  pass("Sync does not trust unauthenticated body.userId");
} else {
  fail("Sync may accept untrusted body.userId — security risk");
}
if (serverSync.includes("validateSyncBody")) {
  pass("Sync payload size validation present");
} else {
  warn("Sync payload validation not detected");
}

// 4c) Guest upgrade path
const authActions = readFileSync(resolve(root, "src/lib/auth/actions.ts"), "utf8");
if (authActions.includes("guestKey") && authActions.includes("passwordHash")) {
  pass("Signup supports guestKey → account upgrade");
} else {
  warn("Guest→account upgrade path unclear");
}

// 5) Local-first prisma
const prismaTs = readFileSync(resolve(root, "src/lib/prisma.ts"), "utf8");
if (prismaTs.includes("DATABASE_URL") && prismaTs.includes("null")) {
  pass("Prisma client null-safe without DATABASE_URL");
} else {
  warn("Prisma null-safety unclear");
}

// 6) Live env (optional)
const hasDb = Boolean(process.env.DATABASE_URL);
const hasAuth = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
if (hasDb) pass("DATABASE_URL is set in this process");
else warn("DATABASE_URL not set — cloud E2E cannot run in this environment");
if (hasAuth) pass("AUTH_SECRET is set in this process");
else warn("AUTH_SECRET not set — using dev fallback only in non-production");

console.log("\n── Summary ──");
console.log(`  OK: ${ok.length}  Warnings: ${warnings.length}  Failures: ${issues.length}`);
if (issues.length) {
  console.log("\nBlockers:");
  issues.forEach((i) => console.log("  -", i));
  process.exit(1);
}
if (!hasDb) {
  console.log(
    "\nCode-level readiness: PASS\nLive cloud E2E: PENDING (set DATABASE_URL + AUTH_SECRET, then prisma db push)\nSee docs/PRODUCTION.md"
  );
}
console.log("");
process.exit(0);
