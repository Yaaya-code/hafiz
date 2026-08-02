"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
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
import { loginAction } from "@/lib/auth/actions";
import {
  applyLocalSnapshot,
  setCloudUserId,
} from "@/lib/sync/local-snapshot";
import { getOrCreateDeviceId } from "@/lib/storage/safe-storage";
import { clearLocalUserData } from "@/lib/user-data-reset";


function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await loginAction({ email, password });
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      // Always isolate: wipe prior local user, then restore this account from cloud
      clearLocalUserData();
      setCloudUserId(result.user.userId);
      try {
        const deviceId = getOrCreateDeviceId();
        const res = await fetch(
          `/api/v1/sync?deviceId=${encodeURIComponent(deviceId)}&guestKey=${encodeURIComponent(deviceId)}&userId=${encodeURIComponent(result.user.userId)}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data?.ok && data.snapshot) {
          // Cloud is source of truth for this account on this device
          applyLocalSnapshot(data.snapshot, { replaceCollections: true });
        }
      } catch {
        /* offline — empty local after wipe until next online pull */
      }

      // Simple UX: always land on dashboard (onboarding auto-bootstrapped)
      const { ensureSimpleProfileReady } = await import("@/lib/user-profile");
      ensureSimpleProfileReady();
      const dest = next.startsWith("/") ? next : "/dashboard";
      router.push(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الدخول");
      setLoading(false);
    }
  }

  return (
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
        <CardTitle className="text-2xl">مرحباً بعودتك</CardTitle>
        <CardDescription>
          سجّل الدخول للوصول لحفظك وتقدمك عبر أجهزتك
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={onSubmit}>
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">كلمة المرور</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                نسيتها؟
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              dir="ltr"
              className="text-start"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
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
            {loading ? "جاري الدخول…" : "دخول"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          ليس لديك حساب؟{" "}
          <Link
            href="/signup"
            className="font-medium text-primary hover:underline"
          >
            إنشاء حساب
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="mesh-bg flex min-h-dvh items-center justify-center p-4">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">جاري التحميل…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
