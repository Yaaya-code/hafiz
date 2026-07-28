import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { students, teacherClasses } from "@/lib/mock-data";
import { formatArabicNumber } from "@/lib/utils";

export const metadata = { title: "لوحة المعلم" };

export default function TeacherPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">لوحة المعلم</h1>
          <p className="text-sm text-muted-foreground">إدارة الحلقات وتتبع الطلاب</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">تصدير تقرير</Button>
          <Button variant="premium" size="sm">حلقة جديدة</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {teacherClasses.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{c.name}</CardTitle>
              <CardDescription>
                {formatArabicNumber(c.studentsCount)} طالب
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">متوسط الدرجة</span>
                <span className="font-semibold text-primary">
                  {formatArabicNumber(c.averageScore)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الحضور</span>
                <span className="font-semibold">
                  {formatArabicNumber(c.attendanceRate)}%
                </span>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="soft" className="flex-1">تعيين مراجعة</Button>
                <Button size="sm" variant="outline" className="flex-1">اختبار</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الطلاب</CardTitle>
          <CardDescription>نظرة سريعة على التقدم</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 text-start font-medium">الاسم</th>
                  <th className="py-2 text-start font-medium">الدرجة</th>
                  <th className="py-2 text-start font-medium">السلسلة</th>
                  <th className="py-2 text-start font-medium">صفحات ضعيفة</th>
                  <th className="py-2 text-start font-medium">التقدم</th>
                  <th className="py-2 text-start font-medium">آخر نشاط</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="py-3 font-medium">{s.name}</td>
                    <td className="py-3">{formatArabicNumber(s.hafizScore)}</td>
                    <td className="py-3">🔥 {formatArabicNumber(s.streak)}</td>
                    <td className="py-3">
                      <Badge variant={s.weakPages > 10 ? "danger" : "warning"}>
                        {formatArabicNumber(s.weakPages)}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${s.progressPercent}%` }}
                          />
                        </div>
                        <span className="text-xs">{formatArabicNumber(s.progressPercent)}%</span>
                      </div>
                    </td>
                    <td className="py-3 text-muted-foreground">{s.lastActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
