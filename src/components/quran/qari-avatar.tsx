"use client";

import { useEffect, useState } from "react";
import type { Qari } from "@/lib/quran/types";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "/qaris/placeholder.svg";

/**
 * Face-centered circular portrait.
 * Uses object-cover + object-top so faces aren't stretched or zoomed out.
 */
export function QariAvatar({
  qari,
  className,
  size = 64,
}: {
  qari: Qari;
  className?: string;
  size?: number;
}) {
  const [src, setSrc] = useState(qari.image || PLACEHOLDER);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(qari.image || PLACEHOLDER);
    setFailed(false);
  }, [qari.image]);

  return (
    <div
      className={cn(
        "w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden border-2 border-amber-500/30 flex-shrink-0 bg-slate-950 shadow-md shadow-black/50",
        className
      )}
      style={
        size !== 64
          ? { width: size, height: size, minWidth: size, minHeight: size }
          : undefined
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={failed ? PLACEHOLDER : src}
        alt={qari.nameAr}
        className="w-full h-full object-cover object-top rounded-full"
        onError={() => {
          if (!failed) {
            setFailed(true);
            setSrc(PLACEHOLDER);
          }
        }}
      />
    </div>
  );
}
