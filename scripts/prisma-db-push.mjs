import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";

const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
const env = { ...process.env };
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

if (!env.DATABASE_URL || !env.DIRECT_URL) {
  console.error("Missing DATABASE_URL or DIRECT_URL");
  process.exit(1);
}

const r = spawnSync("npx", ["prisma", "db", "push"], {
  env,
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
});
process.exit(r.status ?? 1);
