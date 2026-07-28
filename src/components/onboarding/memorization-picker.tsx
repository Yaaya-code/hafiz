"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { JUZ_LIST, surahNamesInJuz } from "@/lib/quran/juz";
import { SURAHS, searchSurahs } from "@/lib/quran/surahs";
import type {
  MemorizationSelection,
  MemorizationStrength,
  MemorizationSelectionMode,
} from "@/lib/quran/types";
import { strengthLabelAr } from "@/lib/user-profile";

const STRENGTHS: MemorizationStrength[] = [
  "STRONG",
  "GOOD",
  "NEEDS_REVIEW",
  "WEAK",
];

const strengthColor: Record<MemorizationStrength, string> = {
  STRONG:
    "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.4)] ring-1 ring-[#D4AF37]/50",
  GOOD:
    "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.4)] ring-1 ring-[#D4AF37]/50",
  NEEDS_REVIEW:
    "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.4)] ring-1 ring-[#D4AF37]/50",
  WEAK:
    "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.4)] ring-1 ring-[#D4AF37]/50",
};

export function MemorizationPicker({
  value,
  onChange,
}: {
  value: MemorizationSelection;
  onChange: (v: MemorizationSelection) => void;
}) {
  const [tab, setTab] = useState<MemorizationSelectionMode>(value.mode || "JUZ");
  const [q, setQ] = useState("");
  const [filterRev, setFilterRev] = useState<"ALL" | "Meccan" | "Medinan">("ALL");

  const filteredSurahs = useMemo(() => {
    let list = searchSurahs(q);
    if (filterRev !== "ALL") {
      list = list.filter((s) => s.revelationType === filterRev);
    }
    return list;
  }, [q, filterRev]);

  function setMode(mode: MemorizationSelectionMode) {
    setTab(mode);
    onChange({ ...value, mode });
  }

  function toggleJuz(juz: number) {
    const exists = value.juzSelections.find((j) => j.juz === juz);
    if (exists) {
      onChange({
        ...value,
        mode: "JUZ",
        juzSelections: value.juzSelections.filter((j) => j.juz !== juz),
      });
    } else {
      onChange({
        ...value,
        mode: "JUZ",
        juzSelections: [
          ...value.juzSelections,
          { juz, strength: "GOOD" },
        ],
      });
    }
  }

  function setJuzStrength(juz: number, strength: MemorizationStrength) {
    onChange({
      ...value,
      mode: "JUZ",
      juzSelections: value.juzSelections.map((j) =>
        j.juz === juz ? { ...j, strength } : j
      ),
    });
  }

  function toggleSurah(surah: number) {
    const exists = value.surahSelections.find((s) => s.surah === surah);
    if (exists) {
      onChange({
        ...value,
        mode: "SURAH",
        surahSelections: value.surahSelections.filter((s) => s.surah !== surah),
      });
    } else {
      onChange({
        ...value,
        mode: "SURAH",
        surahSelections: [
          ...value.surahSelections,
          { surah, strength: "GOOD" },
        ],
      });
    }
  }

  function setSurahStrength(surah: number, strength: MemorizationStrength) {
    onChange({
      ...value,
      mode: "SURAH",
      surahSelections: value.surahSelections.map((s) =>
        s.surah === surah ? { ...s, strength } : s
      ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["JUZ", "بالأجزاء"],
            ["SURAH", "بالسور"],
            ["RANGE", "من–إلى"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "rounded-xl border py-2.5 text-sm font-medium transition-all",
              tab === id
                ? "border-primary bg-primary/10 text-primary"
                : "hover:bg-accent"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* A) Juz */}
      {tab === "JUZ" && (
        <div className="space-y-2 max-h-[min(50vh,420px)] overflow-y-auto pe-1">
          <p className="text-xs text-muted-foreground">
            اختر الأجزاء التي تحفظها، ثم حدّد قوتها (قوي / جيد / يحتاج مراجعة / ضعيف)
          </p>
          {JUZ_LIST.map((juz) => {
            const sel = value.juzSelections.find((j) => j.juz === juz.number);
            const active = Boolean(sel);
            return (
              <div
                key={juz.number}
                className={cn(
                  "rounded-2xl border p-3 transition-all",
                  active ? "border-primary/40 bg-primary/5" : "hover:bg-accent/40"
                )}
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-3 text-start"
                  onClick={() => toggleJuz(juz.number)}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {juz.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-sm">
                      الجزء {juz.number} · {juz.nameAr}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground line-clamp-2">
                      {surahNamesInJuz(juz)}
                    </span>
                  </span>
                </button>
                {active && sel && (
                  <div className="mt-2 flex flex-wrap gap-1.5 ps-13">
                    {STRENGTHS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setJuzStrength(juz.number, s)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                          sel.strength === s
                            ? strengthColor[s]
                            : "border-border text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {strengthLabelAr(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {value.juzSelections.length > 0 && (
            <Badge variant="success">
              محدد: {value.juzSelections.length} جزء
            </Badge>
          )}
        </div>
      )}

      {/* B) Surah */}
      {tab === "SURAH" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-10"
              placeholder="ابحث عن سورة..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["ALL", "الكل"],
                ["Meccan", "مكية"],
                ["Medinan", "مدنية"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilterRev(id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  filterRev === id
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-accent"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[min(45vh,380px)] space-y-1.5 overflow-y-auto pe-1">
            {filteredSurahs.map((s) => {
              const sel = value.surahSelections.find((x) => x.surah === s.number);
              const active = Boolean(sel);
              return (
                <div
                  key={s.number}
                  className={cn(
                    "rounded-xl border px-3 py-2",
                    active ? "border-primary/40 bg-primary/5" : ""
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-start text-sm"
                    onClick={() => toggleSurah(s.number)}
                  >
                    <span className="w-8 text-xs text-muted-foreground">
                      {s.number}
                    </span>
                    <span className="flex-1 font-medium">{s.nameAr}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {s.ayahCount} آية
                    </span>
                  </button>
                  {active && sel && (
                    <div className="mt-1.5 flex flex-wrap gap-1 ps-8">
                      {STRENGTHS.map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setSurahStrength(s.number, st)}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px]",
                            sel.strength === st
                              ? strengthColor[st]
                              : "text-muted-foreground"
                          )}
                        >
                          {strengthLabelAr(st)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {value.surahSelections.length > 0 && (
            <Badge variant="success">
              محدد: {value.surahSelections.length} سورة
            </Badge>
          )}
        </div>
      )}

      {/* C) Range by Surah order */}
      {tab === "RANGE" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            مثال: «حفظت من سورة الفاتحة إلى سورة الكهف» — بالترتيب في المصحف،
            وليس بأرقام الصفحات.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">من سورة</label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={value.range?.fromSurah ?? 1}
                onChange={(e) =>
                  onChange({
                    ...value,
                    mode: "RANGE",
                    range: {
                      fromSurah: Number(e.target.value),
                      toSurah: value.range?.toSurah ?? 18,
                      strength: value.range?.strength ?? "GOOD",
                    },
                  })
                }
              >
                {SURAHS.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number}. {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">إلى سورة</label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={value.range?.toSurah ?? 18}
                onChange={(e) =>
                  onChange({
                    ...value,
                    mode: "RANGE",
                    range: {
                      fromSurah: value.range?.fromSurah ?? 1,
                      toSurah: Number(e.target.value),
                      strength: value.range?.strength ?? "GOOD",
                    },
                  })
                }
              >
                {SURAHS.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number}. {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium mb-2">قوة هذا النطاق</p>
            <div className="flex flex-wrap gap-2">
              {STRENGTHS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      mode: "RANGE",
                      range: {
                        fromSurah: value.range?.fromSurah ?? 1,
                        toSurah: value.range?.toSurah ?? 18,
                        strength: s,
                      },
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    (value.range?.strength ?? "GOOD") === s
                      ? strengthColor[s]
                      : "hover:bg-accent"
                  )}
                >
                  {strengthLabelAr(s)}
                </button>
              ))}
            </div>
          </div>
          {value.range && (
            <div className="rounded-xl bg-muted/40 p-3 text-sm">
              حفظتَ من{" "}
              <strong>
                {SURAHS.find((s) => s.number === value.range!.fromSurah)?.nameAr}
              </strong>{" "}
              إلى{" "}
              <strong>
                {SURAHS.find((s) => s.number === value.range!.toSurah)?.nameAr}
              </strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
