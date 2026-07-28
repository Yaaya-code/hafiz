"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { completeSession } from "@/application";
import { saveNote } from "@/lib/user-activity";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReflectSessionPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-lg" />}>
      <ReflectInner />
    </Suspense>
  );
}

function ReflectInner() {
  const params = useSearchParams();
  const router = useRouter();
  const stepId = params.get("step") || "reflect";
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  function finish() {
    if (text.trim()) {
      saveNote({
        content: text.trim(),
        tag: "تأمل-اليوم",
      });
      setSaved(true);
    }
    completeSession({
      sessionKind: "reflect",
      planItemId: stepId,
      outcome: "success",
      quality: 4,
      autoReplan: true,
    });
    router.push("/plans/journey");
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">تأمل وخاتمة اليوم</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            ماذا ثبّت اليوم؟ أين تعثّرت؟ ماذا تريد من جلسة الغد؟
          </p>
          <textarea
            className="w-full min-h-[140px] rounded-xl border bg-background p-3 text-sm"
            placeholder="اكتب تأملك هنا (اختياري)…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {saved && (
            <p className="text-xs text-[#D4AF37]">حُفظت ملاحظتك.</p>
          )}
          <Button type="button" variant="premium" className="w-full" onClick={finish}>
            حفظ وإكمال الخطوة
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
