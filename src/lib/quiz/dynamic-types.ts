/**
 * Dynamic Quiz Engine — schema for external JSON / API banks.
 * No hardcoded 114-surah question packs; UI renders whatever payload arrives.
 */

export type DynamicQuizChoice = {
  id: string;
  text: string;
};

export type DynamicQuizQuestion = {
  id: string;
  /** Multiple choice | fill blank | free text (future) */
  type: "mcq" | "fill_blank" | "true_false";
  prompt: string;
  /** Optional ayah / context shown above the question */
  contextAr?: string;
  choices?: DynamicQuizChoice[];
  /** Correct choice id (mcq/true_false) or expected fill string */
  answer: string;
  explanationAr?: string;
  meta?: {
    surahNumber?: number;
    ayahNumber?: number;
    source?: string;
    difficulty?: number;
  };
};

export type DynamicQuizPayload = {
  id: string;
  titleAr: string;
  descriptionAr?: string;
  /** Category labels for filtering — driven by external banks later */
  category?: "hifz" | "meanings" | "religious" | string;
  surahNumber?: number;
  questions: DynamicQuizQuestion[];
};

/** Runtime validation (soft) for imported JSON */
export function isDynamicQuizPayload(v: unknown): v is DynamicQuizPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.titleAr === "string" &&
    Array.isArray(o.questions)
  );
}
