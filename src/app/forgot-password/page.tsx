import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "استعادة كلمة المرور" };

export default function ForgotPasswordPage() {
  return (
    <div className="mesh-bg flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>نسيت كلمة المرور؟</CardTitle>
          <CardDescription>أدخل بريدك وسنرسل لك رابط الاستعادة</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" dir="ltr" className="text-start" />
            </div>
            <Button type="button" variant="premium" className="w-full">
              إرسال الرابط
            </Button>
          </form>
          <p className="text-center text-sm">
            <Link href="/login" className="text-primary hover:underline">
              العودة لتسجيل الدخول
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
