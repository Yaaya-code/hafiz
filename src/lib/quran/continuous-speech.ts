/**
 * Legacy stub — ASR engines (Whisper / Web Speech) retired from product path.
 * New tilawah matching lives in `@/lib/audio-match` + `/session/audio-lab`.
 */

export type ContinuousEngine = "none";

export function pickSpeechEngine(): ContinuousEngine {
  return "none";
}

export class ContinuousArabicSpeech {
  getEngine(): ContinuousEngine {
    return "none";
  }

  async start(): Promise<{ ok: boolean; error?: string; engine: ContinuousEngine }> {
    return {
      ok: false,
      error:
        "محركات التحويل إلى نص أُلغيت. استخدم مختبر المطابقة الصوتية /session/audio-lab",
      engine: "none",
    };
  }

  async resume() {
    return this.start();
  }

  pause() {
    return "";
  }

  stop() {
    return "";
  }

  dispose() {}

  getTranscript() {
    return "";
  }

  isRunning() {
    return false;
  }

  setExpectedPrompt(t: string) {
    void t;
  }

  isBatchMode() {
    return false;
  }

  async finishBatchTranscription() {
    return { ok: false as const, error: "غير متاح" };
  }
}

export function detectSpeechEngine() {
  return pickSpeechEngine();
}

export async function preloadWhisperModel() {}
export function getWhisperLoadProgress() {
  return 0;
}
export function isWasmSpeechSupported() {
  return false;
}
