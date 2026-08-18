/**
 * Unified continuous speech facade — Web Speech API only.
 *
 * Product decision (2026-08): Whisper WASM removed from recitation.
 * Accuracy of Web Speech for Quran >> tiny Whisper hallucinations.
 * Android mic chime / silence cuts will be handled later via UX resume,
 * not by sacrificing recognition quality.
 */

import {
  ArabicSpeechSession,
  isSpeechRecognitionSupported,
  type SpeechHandlers,
} from "./speech-recognition";

export type ContinuousEngine = "webspeech";

export type ContinuousStartOpts = {
  preserveBuffer?: boolean;
  onModelProgress?: (pct: number, status: string) => void;
  onPhase?: (phase: "mic" | "model" | "ready") => void;
  expectedPrompt?: string;
  mode?: "live" | "batch";
  forceEngine?: ContinuousEngine;
};

/**
 * Always Web Speech when available (desktop + mobile).
 * Whisper/WASM path intentionally retired from product routing.
 */
export function pickSpeechEngine(): ContinuousEngine {
  return "webspeech";
}

/**
 * Drop-in continuous session for recitation UI.
 */
export class ContinuousArabicSpeech {
  private engine: ContinuousEngine = "webspeech";
  private web: ArabicSpeechSession | null = null;
  private handlers: SpeechHandlers = {};

  getEngine() {
    return this.engine;
  }

  async start(
    handlers: SpeechHandlers = {},
    opts?: ContinuousStartOpts
  ): Promise<{ ok: boolean; error?: string; engine: ContinuousEngine }> {
    this.handlers = handlers;
    this.engine = "webspeech";

    if (!isSpeechRecognitionSupported()) {
      return {
        ok: false,
        error:
          "التعرّف على الصوت (Web Speech) غير مدعوم على هذا المتصفح. جرّب Chrome.",
        engine: this.engine,
      };
    }

    opts?.onPhase?.("mic");
    this.web = this.web || new ArabicSpeechSession();
    const r = await this.web.startWithMicLock(handlers, {
      continuousAutoResume: true,
      preserveBuffer: opts?.preserveBuffer,
    });
    if (r.ok) opts?.onPhase?.("ready");
    return { ...r, engine: this.engine };
  }

  async resume(): Promise<{ ok: boolean; error?: string }> {
    if (this.web) {
      return this.web.startWithMicLock(this.handlers, {
        continuousAutoResume: true,
        preserveBuffer: true,
      });
    }
    return this.start(this.handlers, { preserveBuffer: true });
  }

  pause(): string {
    return this.web?.pauseRecognition() || this.getTranscript();
  }

  stop(): string {
    return this.web?.stop() || "";
  }

  dispose() {
    this.web?.dispose();
    this.web = null;
  }

  getTranscript(): string {
    return this.web?.getTranscript() || "";
  }

  isRunning(): boolean {
    return this.web?.isRunning() || false;
  }

  setExpectedPrompt(text: string) {
    void text;
    // No-op: Web Speech path does not use Whisper prompts
  }

  isBatchMode() {
    return false;
  }

  async finishBatchTranscription(): Promise<{
    ok: boolean;
    text?: string;
    error?: string;
  }> {
    return {
      ok: false,
      error: "وضع Batch/Whisper مُعطّل — التسميع عبر Web Speech فقط.",
    };
  }
}

export { pickSpeechEngine as detectSpeechEngine };

/** @deprecated Whisper preload retired — no-op for old imports */
export async function preloadWhisperModel(
  onProgress?: (pct: number, status: string) => void
): Promise<void> {
  void onProgress;
}

export function getWhisperLoadProgress(): number {
  return 0;
}

/** @deprecated Always false — Whisper product path removed */
export function isWasmSpeechSupported(): boolean {
  return false;
}
