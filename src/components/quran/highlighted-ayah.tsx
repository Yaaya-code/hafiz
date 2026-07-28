"use client";

import { cn } from "@/lib/utils";
import type { HighlightToken, WordMark } from "@/lib/quran/mutashabihat-highlight";

/** Soft pastel amber — keeps original text contrast readable (no opaque gold wash). */
const MARK_CLASS: Record<WordMark, string> = {
  shared:
    "rounded-sm bg-amber-200/35 px-0.5 text-inherit dark:bg-amber-400/15 ring-1 ring-amber-300/25 dark:ring-amber-500/20",
  neutral: "",
};

interface HighlightedAyahProps {
  tokens: HighlightToken[];
  className?: string;
  size?: "md" | "lg";
}

/**
 * Renders ayah text. Consecutive shared tokens are merged visually
 * into one continuous green phrase highlight.
 */
export function HighlightedAyah({
  tokens,
  className,
  size = "lg",
}: HighlightedAyahProps) {
  // Merge consecutive shared (+ spaces between them) into one mark
  const chunks: { text: string; shared: boolean }[] = [];
  let buf = "";
  let bufShared = false;

  function flush() {
    if (!buf) return;
    chunks.push({ text: buf, shared: bufShared });
    buf = "";
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const isShared = tok.mark === "shared" && !tok.isSpace;
    const isSpaceBetweenShared =
      tok.isSpace &&
      bufShared &&
      i + 1 < tokens.length &&
      tokens[i + 1].mark === "shared";

    if (isShared || isSpaceBetweenShared) {
      if (!bufShared && buf) flush();
      bufShared = true;
      buf += tok.text;
    } else {
      if (bufShared) flush();
      bufShared = false;
      buf += tok.text;
    }
  }
  flush();

  return (
    <p
      className={cn(
        "font-quran leading-loose",
        size === "lg" ? "text-xl md:text-2xl" : "text-lg",
        className
      )}
      dir="rtl"
    >
      {chunks.map((c, i) =>
        c.shared ? (
          <mark
            key={i}
            className={cn(MARK_CLASS.shared, "text-inherit")}
            title="الجملة المتشابهة"
          >
            {c.text}
          </mark>
        ) : (
          <span key={i}>{c.text}</span>
        )
      )}
    </p>
  );
}

export function HighlightLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <mark className="rounded px-1.5 py-0.5 bg-amber-200/35 ring-1 ring-amber-300/25 dark:bg-amber-400/15">
          الجملة المتشابهة
        </mark>
        فقط العبارة المشتركة بالظبط
      </span>
    </div>
  );
}
