/**
 * Quran geometry chunking for the Plan Engine.
 * Range assignment only — no pedagogy.
 */

export type {
  QuranPointer,
  QuranChunk,
  SurahRange,
  ChunkCapacity,
  ChunkDirection,
  QuranGeometry,
  CreateChunkOptions,
  AdvancePointerOptions,
} from "./types";

export {
  createNextHifzChunk,
  advancePointer,
  normalizePointer,
  pagesBetween,
  remainingSurahPages,
} from "./chunk-engine";

export {
  createDefaultQuranGeometry,
  createMetadataQuranGeometry,
} from "./default-geometry";
