"use server";

/**
 * Server actions: signup / login / logout / guest.
 * Graceful when database is not configured.
 */

import { prisma, isDatabaseConfigured } from "@/lib/prisma";
import {
  hashPassword,
  validateEmail,
  validatePasswordStrength,
  verifyPassword,
} from "./password";
import {
  clearSessionCookie,
  createSessionToken,
  setGuestCookie,
  setSessionCookie,
  getSession,
  type SessionPayload,
} from "./session";
import { isAuthConfigured } from "./config";

export type AuthActionResult =
  | { ok: true; user: SessionPayload; redirectTo?: string }
  | { ok: false; error: string };

export async function signupAction(input: {
  name: string;
  email: string;
  password: string;
  /** Device guest key — upgrades guest cloud row instead of orphaning progress */
  guestKey?: string;
}): Promise<AuthActionResult> {
  if (!isAuthConfigured()) {
    return {
      ok: false,
      error: "نظام الحسابات غير مُعدّ — أضف AUTH_SECRET في البيئة",
    };
  }
  if (!isDatabaseConfigured() || !prisma) {
    return {
      ok: false,
      error:
        "قاعدة البيانات غير مُعدّة — أضف DATABASE_URL (Supabase/Postgres) للتسجيل",
    };
  }

  const emailErr = validateEmail(input.email);
  if (emailErr) return { ok: false, error: emailErr };
  const passErr = validatePasswordStrength(input.password);
  if (passErr) return { ok: false, error: passErr };

  const email = input.email.trim().toLowerCase();
  const name = (input.name || "").trim().slice(0, 80) || email.split("@")[0];
  const guestKey = (input.guestKey || "").trim().slice(0, 128) || undefined;
  const passwordHash = await hashPassword(input.password);

  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail?.passwordHash) {
    return { ok: false, error: "هذا البريد مسجّل مسبقاً — سجّل الدخول" };
  }

  let userId: string;

  // Upgrade guest device row (preserves synced progress under guestKey)
  if (guestKey) {
    const guestUser = await prisma.user.findUnique({ where: { guestKey } });
    if (guestUser && !guestUser.passwordHash) {
      if (existingByEmail && existingByEmail.id !== guestUser.id) {
        return {
          ok: false,
          error: "البريد مرتبط بحساب آخر — سجّل الدخول بذلك الحساب",
        };
      }
      const updated = await prisma.user.update({
        where: { id: guestUser.id },
        data: {
          email,
          passwordHash,
          name: name || guestUser.name,
          emailVerified: new Date(),
        },
      });
      userId = updated.id;
      const session: SessionPayload = {
        userId,
        email,
        name: updated.name,
        role: updated.role,
      };
      const token = await createSessionToken(session);
      if (!token) return { ok: false, error: "تعذّر إنشاء الجلسة" };
      await setSessionCookie(token);
      return { ok: true, user: session, redirectTo: "/dashboard" };
    }
  }

  if (existingByEmail && !existingByEmail.passwordHash) {
    // Email-less guest that already had email attached somehow — set password
    const updated = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        passwordHash,
        name: name || existingByEmail.name,
        emailVerified: new Date(),
        guestKey: guestKey || existingByEmail.guestKey,
      },
    });
    userId = updated.id;
  } else {
    // If guestKey already belongs to a full account, omit it (avoid unique crash)
    let guestKeyToUse = guestKey;
    if (guestKey) {
      const owner = await prisma.user.findUnique({ where: { guestKey } });
      if (owner?.passwordHash) {
        guestKeyToUse = undefined;
      }
    }
    try {
      const created = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          emailVerified: new Date(),
          guestKey: guestKeyToUse || undefined,
          profile: {
            create: {
              onboardingComplete: false,
              preferredQariId: "alafasy",
            },
          },
          syncCursor: {
            create: {
              clientVersion: 1,
              deviceId: guestKeyToUse || guestKey || undefined,
            },
          },
        },
      });
      userId = created.id;
    } catch (err) {
      // guestKey unique race — attach to existing guest or retry without guestKey
      if (guestKey) {
        const g = await prisma.user.findUnique({ where: { guestKey } });
        if (g && !g.passwordHash) {
          const updated = await prisma.user.update({
            where: { id: g.id },
            data: {
              email,
              passwordHash,
              name,
              emailVerified: new Date(),
            },
          });
          userId = updated.id;
        } else {
          // Retry create without guestKey (collision with full account)
          try {
            const created = await prisma.user.create({
              data: {
                email,
                name,
                passwordHash,
                emailVerified: new Date(),
                profile: {
                  create: {
                    onboardingComplete: false,
                    preferredQariId: "alafasy",
                  },
                },
                syncCursor: {
                  create: { clientVersion: 1 },
                },
              },
            });
            userId = created.id;
          } catch {
            console.error("[auth/signup]", err);
            return {
              ok: false,
              error: "تعذّر إنشاء الحساب — حاول مجدداً",
            };
          }
        }
      } else {
        console.error("[auth/signup]", err);
        return { ok: false, error: "تعذّر إنشاء الحساب — حاول مجدداً" };
      }
    }
  }

  const session: SessionPayload = {
    userId,
    email,
    name,
    role: "STUDENT",
  };
  try {
    const token = await createSessionToken(session);
    if (!token) {
      return {
        ok: false,
        error: "تعذّر إنشاء الجلسة — تحقق من AUTH_SECRET",
      };
    }
    await setSessionCookie(token);
  } catch (e) {
    console.error("[auth/signup session]", e);
    return { ok: false, error: "تعذّر تسجيل الدخول — حاول مجدداً" };
  }

  return { ok: true, user: session, redirectTo: "/onboarding" };
}

export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  try {
    if (!isAuthConfigured()) {
      return {
        ok: false,
        error: "نظام الحسابات غير مُعدّ — أضف AUTH_SECRET",
      };
    }
    if (!isDatabaseConfigured() || !prisma) {
      return {
        ok: false,
        error: "قاعدة البيانات غير مُعدّة — أضف DATABASE_URL",
      };
    }

    const emailErr = validateEmail(input.email);
    if (emailErr) return { ok: false, error: emailErr };

    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      return { ok: false, error: "بيانات الدخول غير صحيحة" };
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) return { ok: false, error: "بيانات الدخول غير صحيحة" };

    const session: SessionPayload = {
      userId: user.id,
      email: user.email || email,
      name: user.name,
      role: user.role,
    };
    const token = await createSessionToken(session);
    if (!token) {
      return {
        ok: false,
        error: "تعذّر إنشاء الجلسة — تحقق من AUTH_SECRET",
      };
    }
    await setSessionCookie(token);

    return { ok: true, user: session, redirectTo: "/dashboard" };
  } catch (e) {
    console.error("[auth/login]", e);
    return {
      ok: false,
      error: "تعذّر تسجيل الدخول — حاول مجدداً",
    };
  }
}

export async function logoutAction(): Promise<{ ok: true }> {
  await clearSessionCookie();
  return { ok: true };
}

export async function continueAsGuestAction(): Promise<{ ok: true }> {
  await clearSessionCookie();
  await setGuestCookie();
  return { ok: true };
}

export async function getSessionAction(): Promise<SessionPayload | null> {
  return getSession();
}
