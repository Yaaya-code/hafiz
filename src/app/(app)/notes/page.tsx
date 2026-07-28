"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadNotes,
  saveNote,
  deleteNote,
  type NoteItem,
  recordActivity,
} from "@/lib/user-activity";
import { SURAHS } from "@/lib/quran";
import { formatArabicNumber } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [content, setContent] = useState("");
  const [surah, setSurah] = useState(1);
  const [ayah, setAyah] = useState(1);

  useEffect(() => {
    setNotes(loadNotes());
    const on = () => setNotes(loadNotes());
    window.addEventListener("hafiz-activity", on);
    return () => window.removeEventListener("hafiz-activity", on);
  }, []);

  function add() {
    if (!content.trim()) return;
    setNotes(
      saveNote({
        content,
        surahNumber: surah,
        ayahNumber: ayah,
      })
    );
    recordActivity();
    setContent("");
  }

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <FadeIn>
        <div>
          <h1 className="text-2xl font-bold">الملاحظات</h1>
          <p className="text-sm text-muted-foreground">
            على آيات وسور — تظهر أثناء القراءة والمراجعة
          </p>
        </div>
      </FadeIn>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">السورة</Label>
              <select
                className="flex h-10 w-full rounded-xl border bg-background px-3 text-sm"
                value={surah}
                onChange={(e) => setSurah(Number(e.target.value))}
              >
                {SURAHS.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number}. {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الآية</Label>
              <Input
                type="number"
                min={1}
                value={ayah}
                onChange={(e) => setAyah(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <Input
            placeholder="اكتب ملاحظتك..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button variant="premium" onClick={add}>
            حفظ الملاحظة
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {notes.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            لا ملاحظات بعد — أضف أول ملاحظة من هنا أو من قارئ القرآن
          </p>
        )}
        {notes.map((n) => (
          <Card key={n.id}>
            <CardContent className="p-4 flex gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed">{n.content}</p>
                <p className="mt-2 text-xs text-primary">
                  {n.surahNumber
                    ? (SURAHS.find((s) => s.number === n.surahNumber)?.nameAr ||
                        n.surahNumber) +
                      (n.ayahNumber
                        ? " · آية " + formatArabicNumber(n.ayahNumber)
                        : "")
                    : "عامة"}
                </p>
                {n.surahNumber && (
                  <Link
                    href={
                      "/quran"
                    }
                    className="text-[11px] text-muted-foreground hover:underline"
                  >
                    افتح في المصحف
                  </Link>
                )}
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-white"
                onClick={() => setNotes(deleteNote(n.id))}
                aria-label="حذف"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
