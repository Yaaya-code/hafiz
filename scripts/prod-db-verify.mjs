import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

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
  process.env[k] = v;
}

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/prod-db-verify.mjs <email>");
  process.exit(1);
}

const p = new PrismaClient();
try {
  const user = await p.user.findUnique({ where: { email } });
  const mistakes = user
    ? await p.mistake.findMany({ where: { userId: user.id }, take: 10 })
    : [];
  console.log(
    JSON.stringify(
      {
        userFound: !!user,
        userId: user?.id ?? null,
        email: user?.email ?? null,
        mistakeRows: mistakes.length,
        e2eNote: mistakes.some((m) => (m.note || "").includes("E2E live sync")),
        notes: mistakes.map((m) => m.note).filter(Boolean),
      },
      null,
      2
    )
  );
  if (!user || !mistakes.some((m) => (m.note || "").includes("E2E live sync"))) {
    process.exit(1);
  }
} finally {
  await p.$disconnect();
}
