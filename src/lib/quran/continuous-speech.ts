/**
 * Unified continuous speech facade:
 * - Desktop: Web Speech API (free, fast)
 * - Mobile: in-browser Whisper WASM (free forever, no beep loop, no paid cloud)
 */

import {
  ArabicSpeechSession,
  isMobileSpeechEnvironment,
  isSpeechRecognitionSupported,
  type SpeechHandlers,
} from "./speech-recognition";
import {
  WasmWhisperSpeechSession,
  isWasmSpeechSupported,
  preloadWhisperModel,
  getWhisperLoadProgress,
} from "./wasm-whisper-session";

export type ContinuousEngine = "webspeech" | "wasm-whisper";

export type ContinuousStartOpts = {
  preserveBuffer?: boolean;
  onModelProgress?: (pct: number, status: string) => void;
  onPhase?: (phase: "mic" | "model" | "ready") => void;
  /** Expected upcoming Quran words — biases local Whisper decoder */
  expectedPrompt?: string;
  /** Force engine (tests) */
  forceEngine?: ContinuousEngine;
};

/**
 * Engine split (critical):
 * - Desktop (Win/Mac/Linux browsers): Web Speech API only when available —
 *   never force Whisper WASM (it wrecks laptop UX with heavy model load).
 * - Mobile (Android/iOS): Whisper WASM for continuous mic without beep loop.
 */
export function pickSpeechEngine(): ContinuousEngine {
  if (typeof window === "undefined") return "webspeech";

  const mobile = isMobileSpeechEnvironment();

  if (!mobile) {
    // Desktop path — keep it light
    if (isSpeechRecognitionSupported()) return "webspeech";
    // Rare desktop without Web Speech: wasm last resort only
    if (isWasmSpeechSupported()) return "wasm-whisper";
    return "webspeech";
  }

  // Mobile path — continuous free STT without Android chime restarts
  if (isWasmSpeechSupported()) return "wasm-whisper";
  if (isSpeechRecognitionSupported()) return "webspeech";
  return "webspeech";
}

/**
 * Drop-in continuous session for recitation UI.
 */
export class ContinuousArabicSpeech {
  private engine: ContinuousEngine = "webspeech";
  private web: ArabicSpeechSession | null = null;
  private wasm: WasmWhisperSpeechSession | null = null;
  private handlers: SpeechHandlers = {};

  getEngine() {
    return this.engine;
  }

  async start(
    handlers: SpeechHandlers = {},
    opts?: ContinuousStartOpts
  ): Promise<{ ok: boolean; error?: string; engine: ContinuousEngine }> {
    this.handlers = handlers;
    this.engine = opts?.forceEngine || pickSpeechEngine();

    if (this.engine === "wasm-whisper") {
      this.wasm = this.wasm || new WasmWhisperSpeechSession();
      try {
        const r = await this.wasm.start(handlers, {
          preserveBuffer: opts?.preserveBuffer,
          onModelProgress: opts?.onModelProgress,
          onPhase: opts?.onPhase,
          expectedPrompt: opts?.expectedPrompt,
        });
        return { ...r, engine: this.engine };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          engine: this.engine,
        };
      }
    }

    // Desktop Web Speech — continuousAutoResume + optional mic lock
    this.web = this.web || new ArabicSpeechSession();
    // Prefer mic lock on desktop continuous as well (no harm)
    const r = await this.web.startWithMicLock(handlers, {
      continuousAutoResume: true,
      preserveBuffer: opts?.preserveBuffer,
    });
    return { ...r, engine: this.engine };
  }

  async resume(): Promise<{ ok: boolean; error?: string }> {
    if (this.engine === "wasm-whisper" && this.wasm) {
      return this.wasm.resume(this.handlers);
    }
    if (this.web) {
      return this.web.startWithMicLock(this.handlers, {
        continuousAutoResume: true,
        preserveBuffer: true,
      });
    }
    return this.start(this.handlers, { preserveBuffer: true });
  }

  /** User pause — keep buffer */
  pause(): string {
    if (this.engine === "wasm-whisper" && this.wasm) {
      return this.wasm.pauseRecognition();
    }
    return this.web?.pauseRecognition() || this.getTranscript();
  }

  stop(): string {
    if (this.engine === "wasm-whisper" && this.wasm) {
      return this.wasm.stop();
    }
    return this.web?.stop() || "";
  }

  dispose() {
    this.wasm?.dispose();
    this.web?.dispose();
    this.wasm = null;
    this.web = null;
  }

  getTranscript(): string {
    if (this.engine === "wasm-whisper") {
      return this.wasm?.getTranscript() || "";
    }
    return this.web?.getTranscript() || "";
  }

  isRunning(): boolean {
    if (this.engine === "wasm-whisper") {
      return this.wasm?.isRunning() || false;
    }
    return this.web?.isRunning() || false;
  }

  /** Keep Whisper initial_prompt aligned with match cursor */
  setExpectedPrompt(text: string) {
    this.wasm?.setExpectedPrompt(text);
  }
}

export {
  preloadWhisperModel,
  getWhisperLoadProgress,
  isWasmSpeechSupported,
  pickSpeechEngine as detectSpeechEngine,
};
