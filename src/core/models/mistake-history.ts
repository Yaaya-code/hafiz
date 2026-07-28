/**
 * Mistake / difficulty history for future SRS and mutashabihat rules.
 * Structure only — no ranking algorithms in this phase.
 */

import type {
  AyahNumber,
  ISODate,
  SurahNumber,
  UserId,
} from "./primitives";

export type MistakeCategory =
  | "HARAKA"
  | "LETTER"
  | "WORD"
  | "SKIP"
  | "ORDER"
  | "MUTASHABIH"
  | "OTHER";

export interface MistakeRecord {
  id: string;
  userId: UserId;
  surah: SurahNumber;
  ayah?: AyahNumber;
  page?: number;
  category: MistakeCategory;
  frequency: number;
  lastOccurredAt: ISODate;
  note?: string;
}

export interface MistakeHistory {
  records: MistakeRecord[];
  maxRecords: number;
}
