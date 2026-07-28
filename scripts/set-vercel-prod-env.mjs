/**
 * Push Production env vars from .env.local to Vercel (non-interactive).
 * Usage: node scripts/set-vercel-prod-env.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const root = process.cwd();
const raw = readFileSync(join(root, ".env.local"), "utf8");
const env = {};
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
  ) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const required = ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET"];
for (const k of required) {
  if (!env[k]) {
    console.error("Missing", k, "in .env.local");
    process.exit(1);
  }
}

function run(cmd) {
  console.log(">", cmd.replace(env.DATABASE_URL, "[DATABASE_URL]").replace(env.DIRECT_URL, "[DIRECT_URL]").replace(env.AUTH_SECRET, "[AUTH_SECRET]"));
  execSync(cmd, { stdio: "inherit", shell: true, cwd: root });
}

// Remove existing production vars if present (ignore errors)
for (const k of required) {
  try {
    execSync(`npx vercel env rm ${k} production -y`, {
      stdio: "pipe",
      shell: true,
      cwd: root,
    });
    console.log("removed existing", k);
  } catch {
    /* not present */
  }
}

for (const k of required) {
  const tmp = join(root, `.tmp-env-${k}.txt`);
  writeFileSync(tmp, env[k], "utf8");
  try {
    // pipe value into vercel env add
    execSync(`npx vercel env add ${k} production < "${tmp}"`, {
      stdio: "inherit",
      shell: true,
      cwd: root,
    });
    console.log("added", k, "→ production");
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

console.log("OK: Production env vars set on Vercel.");
