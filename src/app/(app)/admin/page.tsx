import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { pageStats } from "@/lib/mock-data";
import { formatArabicNumber } from "@/lib/utils";

export const metadata = { title: "لوحة الإدارة" };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة الإدارة</h1>
        <p className="text-sm text-muted-foreground">إدارة النظام والمحتوى</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "المستخدمون", value: "١٬٢٤٨" },
          { label: "المعلمون", value: "٨٦" },
          { label: "مجموعات متشابهات", value: "٣١٢" },
          { label: "جلسات اليوم", value: "٤٬٥٦٠" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">إدارة المحتوى</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {["المتشابهات", "الإعلانات", "الإنجازات", "إعدادات النظام"].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm"
              >
                <span>{item}</span>
                <Button size="sm" variant="outline">إدارة</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">إحصاءات المصحف (عامة)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>صفحات متقنة إجمالاً (عينة): {formatArabicNumber(pageStats.mastered)}</p>
            <p>صفحات ضعيفة: {formatArabicNumber(pageStats.weak)}</p>
            <p>غير محفوظة: {formatArabicNumber(pageStats.notMemorized)}</p>
            <Button className="mt-4" variant="premium" size="sm">
              عرض التحليلات الكاملة
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
