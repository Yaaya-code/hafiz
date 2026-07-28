"use client";

/**
 * Unified memorized-range picker: Juz 1–30 accordions with per-surah checkboxes.
 * Replaces isolated tabs (أجزاء / سور / من–إلى).
 */

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft } from "lucide-react";
import { cn, formatArabicNumber } from "@/lib/utils";
import { JUZ_LIST } from "@/lib/quran/juz";
import { SURAHS, getSurah } from "@/lib/quran/surahs";
import type {
  MemorizationSelection,
  MemorizationStrength,
} from "@/lib/quran/types";
import { ACTIVE_GOLD, INACTIVE_SURFACE } from "@/lib/ui-active";

const DEFAULT_STRENGTH: MemorizationStrength = "GOOD";

const PRESETS: {
  id: string;
  label: string;
  apply: () => MemorizationSelection;
}[] = [
  {
    id: "amma",
    label: "أحفظ جزء عم",
    apply: () => ({
      mode: "SURAH",
      juzSelections: [{ juz: 30, strength: DEFAULT_STRENGTH }],
      surahSelections: JUZ_LIST[29].surahs.map((s) => ({
        surah: s,
        strength: DEFAULT_STRENGTH,
      })),
    }),
  },
  {
    id: "tabarak_amma",
    label: "أحفظ تبارك وعم",
    apply: () => {
      const surahs = [
        ...new Set([...JUZ_LIST[28].surahs, ...JUZ_LIST[29].surahs]),
      ];
      return {
        mode: "SURAH",
        juzSelections: [
          { juz: 29, strength: DEFAULT_STRENGTH },
          { juz: 30, strength: DEFAULT_STRENGTH },
        ],
        surahSelections: surahs.map((s) => ({
          surah: s,
          strength: DEFAULT_STRENGTH,
        })),
      };
    },
  },
  {
    id: "none",
    label: "لم أحفظ شيئاً بعد",
    apply: () => ({
      mode: "SURAH",
      juzSelections: [],
      surahSelections: [],
    }),
  },
  {
    id: "full",
    label: "حافظ للقرآن كاملاً",
    apply: () => ({
      mode: "SURAH",
      juzSelections: JUZ_LIST.map((j) => ({
        juz: j.number,
        strength: DEFAULT_STRENGTH,
      })),
      surahSelections: SURAHS.map((s) => ({
        surah: s.number,
        strength: DEFAULT_STRENGTH,
      })),
    }),
  },
];

function selectedSurahSet(sel: MemorizationSelection): Set<number> {
  return new Set(sel.surahSelections.map((s) => s.surah));
}

function surahsFullySelected(
  juzSurahs: number[],
  selected: Set<number>
): boolean {
  return juzSurahs.length > 0 && juzSurahs.every((s) => selected.has(s));
}

function surahsPartiallySelected(
  juzSurahs: number[],
  selected: Set<number>
): boolean {
  const n = juzSurahs.filter((s) => selected.has(s)).length;
  return n > 0 && n < juzSurahs.length;
}

export function UnifiedMemorizationTree({
  value,
  onChange,
}: {
  value: MemorizationSelection;
  onChange: (v: MemorizationSelection) => void;
}) {
  const [openJuz, setOpenJuz] = useState<number | null>(30);
  const selected = useMemo(() => selectedSurahSet(value), [value]);

  function strengthMap(): Map<number, MemorizationStrength> {
    const m = new Map<number, MemorizationStrength>();
    for (const s of value.surahSelections) {
      m.set(s.surah, s.strength || DEFAULT_STRENGTH);
    }
    return m;
  }

  function commitSurahs(
    surahNumbers: number[],
    strengthOverrides?: Map<number, MemorizationStrength>
  ) {
    const unique = [...new Set(surahNumbers)].sort((a, b) => a - b);
    const prev = strengthMap();
    const juzSelections = JUZ_LIST.filter((j) =>
      surahsFullySelected(j.surahs, new Set(unique))
    ).map((j) => {
      // Use weakest surah strength in juz as juz-level signal
      const strengths = j.surahs
        .filter((s) => unique.includes(s))
        .map(
          (s) =>
            strengthOverrides?.get(s) || prev.get(s) || DEFAULT_STRENGTH
        );
      const worst = strengths.includes("WEAK")
        ? "WEAK"
        : strengths.includes("NEEDS_REVIEW")
          ? "NEEDS_REVIEW"
          : strengths.includes("GOOD")
            ? "GOOD"
            : "STRONG";
      return { juz: j.number, strength: worst as MemorizationStrength };
    });
    onChange({
      mode: "SURAH",
      juzSelections,
      surahSelections: unique.map((surah) => {
        const prevEntry = value.surahSelections.find((s) => s.surah === surah);
        return {
          surah,
          strength:
            strengthOverrides?.get(surah) ||
            prev.get(surah) ||
            DEFAULT_STRENGTH,
          fromAyah: prevEntry?.fromAyah,
          toAyah: prevEntry?.toAyah,
        };
      }),
    });
  }

  function toggleSurah(surah: number) {
    const next = new Set(selected);
    if (next.has(surah)) next.delete(surah);
    else next.add(surah);
    commitSurahs([...next]);
  }

  function cycleStrength(surah: number) {
    if (!selected.has(surah)) return;
    const order: MemorizationStrength[] = [
      "STRONG",
      "GOOD",
      "NEEDS_REVIEW",
      "WEAK",
    ];
    const current =
      value.surahSelections.find((s) => s.surah === surah)?.strength ||
      DEFAULT_STRENGTH;
    const idx = order.indexOf(current);
    const nextStrength = order[(idx + 1) % order.length];
    const overrides = strengthMap();
    overrides.set(surah, nextStrength);
    commitSurahs([...selected], overrides);
  }

  function setPartialEnd(surah: number, toAyah: number | "") {
    if (!selected.has(surah)) return;
    const meta = getSurah(surah);
    const full = meta?.ayahCount ?? 1;
    const end =
      toAyah === "" || toAyah <= 0
        ? undefined
        : Math.min(full, Math.max(1, Number(toAyah)));
    onChange({
      ...value,
      surahSelections: value.surahSelections.map((s) =>
        s.surah === surah
          ? {
              ...s,
              fromAyah: 1,
              toAyah: end === full ? undefined : end,
            }
          : s
      ),
    });
  }

  function strengthLabel(s: MemorizationStrength): string {
    switch (s) {
      case "STRONG":
        return "قوي";
      case "GOOD":
        return "متوسط";
      case "NEEDS_REVIEW":
        return "يحتاج مراجعة";
      case "WEAK":
        return "ضعيف";
      default:
        return "متوسط";
    }
  }

  function toggleJuzAll(juzNumber: number) {
    const juz = JUZ_LIST.find((j) => j.number === juzNumber);
    if (!juz) return;
    const next = new Set(selected);
    const full = surahsFullySelected(juz.surahs, next);
    if (full) {
      juz.surahs.forEach((s) => next.delete(s));
    } else {
      juz.surahs.forEach((s) => next.add(s));
    }
    commitSurahs([...next]);
  }

  const count = selected.size;
  const juzCount = value.juzSelections.length;

  return (
    <div className="space-y-3">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.apply())}
            className="rounded-full border border-[#D4AF37]/35 bg-[#0A0F1A]/70 px-3 py-1.5 text-xs font-medium text-[#D4AF37] transition-all duration-300 hover:scale-105 hover:bg-[#D4AF37]/10 hover:border-[#D4AF37] hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] hover:ring-1 hover:ring-[#D4AF37]/50 active:scale-95"
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        المحدّد:{" "}
        <strong className="text-[#D4AF37]">
          {count === 0
            ? "لا شيء بعد"
            : count === 114
              ? "القرآن كاملاً (١١٤ سورة)"
              : formatArabicNumber(count) +
                (count === 1 ? " سورة" : " سورة")}
        </strong>
        {juzCount > 0 && count < 114 && (
          <span>
            {" "}
            · {formatArabicNumber(juzCount)} جزء كامل
          </span>
        )}
        <span className="block mt-1 text-[11px] opacity-80">
          اضغط «القوة» لتبديل: قوي · متوسط · يحتاج مراجعة · ضعيف — وحدّد نهاية
          المدى إن لم تُتمّ السورة.
        </span>
      </p>

      <div className="max-h-[min(58vh,520px)] overflow-y-auto pe-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {JUZ_LIST.map((juz) => {
          const open = openJuz === juz.number;
          const full = surahsFullySelected(juz.surahs, selected);
          const partial = surahsPartiallySelected(juz.surahs, selected);
          const selectedInJuz = juz.surahs.filter((s) => selected.has(s)).length;

          return (
            <div
              key={juz.number}
              className={cn(
                "group rounded-2xl border h-fit cursor-pointer transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.01]",
                open && "md:col-span-2",
                full
                  ? ACTIVE_GOLD
                  : partial
                    ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.25)] ring-1 ring-[#D4AF37]/30"
                    : INACTIVE_SURFACE
              )}
            >
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => toggleJuzAll(juz.number)}
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs",
                    full
                      ? "border-[#D4AF37] bg-[#D4AF37] text-[#020408] shadow-[0_0_12px_rgba(212,175,55,0.4)]"
                      : partial
                        ? "border-[#D4AF37] bg-[#D4AF37]/20 text-[#D4AF37]"
                        : "border-[#D4AF37]/30"
                  )}
                  title="تحديد الجزء كاملاً"
                  aria-label={"تحديد الجزء " + juz.number + " كاملاً"}
                >
                  {full ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : partial ? (
                    <span className="h-1.5 w-1.5 rounded-sm bg-[#D4AF37]" />
                  ) : null}
                </button>

                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  onClick={() =>
                    setOpenJuz(open ? null : juz.number)
                  }
                >
                  <span className="font-semibold text-sm">
                    الجزء {formatArabicNumber(juz.number)}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {juz.nameAr}
                  </span>
                  <span className="ms-auto text-[10px] text-muted-foreground shrink-0">
                    {formatArabicNumber(selectedInJuz)}/
                    {formatArabicNumber(juz.surahs.length)}
                  </span>
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </div>

              {open && (
                <div className="border-t border-border/50 px-3 pb-3 pt-2 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => toggleJuzAll(juz.number)}
                    className="mb-1 w-full rounded-lg border border-dashed border-[#D4AF37]/40 py-1.5 text-[11px] font-medium text-[#D4AF37] dark:text-[#D4AF37] hover:bg-[#D4AF37]/10"
                  >
                    {full
                      ? "إلغاء تحديد الجزء كاملاً"
                      : "تحديد الجزء كاملاً"}
                  </button>
                  {juz.surahs.map((sn) => {
                    const surah = getSurah(sn);
                    if (!surah) return null;
                    const on = selected.has(sn);
                    const entry = value.surahSelections.find(
                      (s) => s.surah === sn
                    );
                    const st = entry?.strength || DEFAULT_STRENGTH;
                    return (
                      <div
                        key={sn}
                        className={cn(
                          "rounded-xl px-2 py-2 text-sm transition-colors",
                          on
                            ? "bg-[#D4AF37]/10 text-[#D4AF37] ring-1 ring-[#D4AF37]/50 shadow-[0_0_12px_rgba(212,175,55,0.25)]"
                            : "hover:bg-[#D4AF37]/5"
                        )}
                      >
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleSurah(sn)}
                            className="h-4 w-4 accent-[#D4AF37]"
                          />
                          <span className="w-7 text-[11px] text-muted-foreground">
                            {formatArabicNumber(sn)}
                          </span>
                          <span className="flex-1 font-medium">
                            {surah.nameAr}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatArabicNumber(surah.ayahCount)} آية
                          </span>
                        </label>
                        {on && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 ps-7">
                            <button
                              type="button"
                              onClick={() => cycleStrength(sn)}
                              className="rounded-lg border border-[#D4AF37]/40 px-2 py-0.5 text-[10px] font-medium text-[#D4AF37] hover:bg-[#D4AF37]/10"
                              title="تبديل قوة الحفظ"
                            >
                              القوة: {strengthLabel(st)}
                            </button>
                            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              حتى آية
                              <input
                                type="number"
                                min={1}
                                max={surah.ayahCount}
                                placeholder={String(surah.ayahCount)}
                                value={entry?.toAyah ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setPartialEnd(
                                    sn,
                                    v === "" ? "" : Number(v)
                                  );
                                }}
                                className="w-14 rounded border border-[#D4AF37]/30 bg-transparent px-1 py-0.5 text-center text-[11px] text-foreground"
                                dir="ltr"
                              />
                              / {formatArabicNumber(surah.ayahCount)}
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

/** Dynamic coaching line under the tree based on selection size */
export function memorizationCoachCopy(sel: MemorizationSelection): string {
  const n = sel.surahSelections.length;
  if (n === 0) {
    return "ابدأ من الصفر بلا حرج — «من سلك طريقاً يلتمس فيه علماً سهّل الله له به طريقاً إلى الجنة».";
  }
  if (n === 114) {
    return "ما شاء الله! حافظ كامل — «تعاهدوا هذا القرآن» وسنبني معك ورد مراجعة يحفظ العهد.";
  }
  if (n <= 10) {
    return "«اقرأ وارتقِ» — كل سورة تثبتها هنا هي درجة ترتقيها في الجنة.";
  }
  if (n <= 40) {
    return "أساس طيّب — ثبّت ما معك ثم زد بلطف. «خيركم من تعلّم القرآن وعلّمه».";
  }
  return "محفظة واسعة — سنوازن المراجعة والحفظ حتى لا يتفلّت شيء بإذن الله.";
}
