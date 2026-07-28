"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, Bookmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  loadBookmarks,
  removeBookmark,
  type BookmarkItem,
} from "@/lib/user-activity";
import { FadeIn } from "@/components/motion/fade-in";

export default function BookmarksPage() {
  const [items, setItems] = useState<BookmarkItem[]>([]);

  useEffect(() => {
    setItems(loadBookmarks());
    const on = () => setItems(loadBookmarks());
    window.addEventListener("hafiz-activity", on);
    return () => window.removeEventListener("hafiz-activity", on);
  }, []);

  return (
    <div className="mx-auto max-w-6xl xl:max-w-7xl space-y-6">
      <FadeIn>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bookmark className="h-6 w-6 text-primary" />
            الإشارات المرجعية
          </h1>
          <p className="text-sm text-muted-foreground">
            آيات وصفحات محفوظة من القارئ ووضع الحفظ
          </p>
        </div>
      </FadeIn>

      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            لا إشارات بعد. من صفحة القرآن اضغط «إشارة» على أي آية.
          </p>
        )}
        {items.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{b.label}</p>
                <div className="mt-1 flex gap-2">
                  <Badge variant="muted">{b.type}</Badge>
                  {b.surahNumber && b.ayahNumber && (
                    <Link
                      href={
                        "/session/revision?mode=memorize&surah=" +
                        b.surahNumber +
                        "&from=" +
                        b.ayahNumber +
                        "&to=" +
                        b.ayahNumber
                      }
                      className="text-xs text-primary hover:underline"
                    >
                      حفظ
                    </Link>
                  )}
                  <Link
                    href="/quran"
                    className="text-xs text-primary hover:underline"
                  >
                    قراءة
                  </Link>
                </div>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-white"
                onClick={() => setItems(removeBookmark(b.id))}
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
