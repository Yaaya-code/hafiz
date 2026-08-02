"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { signupAction } from "@/lib/auth/actions";
import {
  applyLocalSnapshot,
  setCloudUserId,
} from "@/lib/sync/local-snapshot";
import { getOrCreateDeviceId } from "@/lib/storage/safe-storage";
import {
  clearLocalUserData,
  isAccountBoundLocally,
} from "@/lib/user-data-reset";


export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Pure guest → account: keep local progress (cloud will merge via guestKey).
      // Switching from another account without logout: wipe first.
      const pureGuest = !isAccountBoundLocally();
      if (!pureGuest) {
        clearLocalUserData();
      }

      const result = await signupAction({
        name,
        email,
        password,
        guestKey: getOrCreateDeviceId(),
      });
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setCloudUserId(result.user.userId);
      // Simple UX: bootstrap complete profile with safe defaults (skip long onboarding)
      {
        const { ensureSimpleProfileReady } = await import("@/lib/user-profile");
        ensureSimpleProfileReady({ name: result.user.name || undefined });
      }
      // Pull cloud (empty for brand-new; guest upgrade restores cloud progress)
      try {
        const deviceId = getOrCreateDeviceId();
        const res = await fetch(
          "/api/v1/sync?deviceId=" +
            encodeURIComponent(deviceId) +
            "&guestKey=" +
            encodeURIComponent(deviceId),
          { credentials: "include" }
        );
        const data = await res.json();
        if (data?.ok && data.snapshot) {
          // Guest upgrade: merge so offline local rows survive empty cloud.
          // Account switch: replace after wipe (cloud is source of truth).
          applyLocalSnapshot(data.snapshot, {
            replaceCollections: !pureGuest,
          });
        }
      } catch {
        /* offline — pure guest keeps local; account switch already wiped */
      }

      router.push(result.redirectTo || "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إنشاء الحساب");
      setLoading(false);
    }
  }

  return (
    <div className="mesh-bg flex min-h-dvh items-center justify-center p-4">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md border-border/60 shadow-xl">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto mb-2 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="حافظ"
              width={56}
              height={56}
              className="h-14 w-14 rounded-2xl object-cover shadow-lg shadow-[0_0_24px_rgba(212,175,55,0.35)] ring-1 ring-[#D4AF37]/40"
            />
          </Link>
          <CardTitle className="text-2xl">انضم إلى حافظ</CardTitle>
          <CardDescription>
            أنشئ حساباً لحفظ تقدمك ومزامنته عبر أجهزتك تلقائياً
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">الاسم</Label>
              <Input
                id="name"
                placeholder="أحمد محمد"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                dir="ltr"
                className="text-start"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                className="text-start"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <p className="text-[11px] text-muted-foreground">
                ٨ أحرف على الأقل
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button
              type="submit"
              variant="premium"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading ? "جاري الإنشاء…" : "إنشاء الحساب"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            لديك حساب؟{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              تسجيل الدخول
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
