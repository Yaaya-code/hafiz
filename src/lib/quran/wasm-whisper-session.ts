/**
 * Free forever continuous STT in the browser (Zero cloud cost).
 *
 * Architecture:
 * - ONE getUserMedia MediaStream for the whole session (no open/close → no Android beep)
 * - AudioContext captures PCM continuously
 * - Sliding windows transcribed by Whisper via WebAssembly (@huggingface/transformers)
 * - No paid APIs, no backend STT
 *
 * Trade-offs (honest):
 * - First load downloads a small model (~40MB, cached by browser)
 * - On mid phones, partial updates every ~2–3s (not as instant as desktop Web Speech)
 * - Still free, continuous, no system chime loop
 */

import type { SpeechHandlers } from "./speech-recognition";

type AsrPipeline = (
  audio: Float32Array | { array: Float32Array; sampling_rate: number },
  opts?: Record<string, unknown>
) => Promise<{ text?: string } | { text?: string }[]>;

const TARGET_SR = 16000;
/** Seconds of audio fed to Whisper each run */
const WINDOW_SEC = 5;
/** How often we run inference (seconds) */
const TICK_SEC = 2.2;
/** Max samples kept in ring buffer (~30s) */
const MAX_BUFFER_SEC = 28;

let sharedPipeline: AsrPipeline | null = null;
let pipelineLoading: Promise<AsrPipeline> | null = null;
let loadProgress = 0;

export function getWhisperLoadProgress(): number {
  return loadProgress;
}

export async function preloadWhisperModel(
  onProgress?: (pct: number, status: string) => void
): Promise<void> {
  await ensurePipeline(onProgress);
}

async function ensurePipeline(
  onProgress?: (pct: number, status: string) => void
): Promise<AsrPipeline> {
  if (sharedPipeline) return sharedPipeline;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    onProgress?.(5, "تحميل محرك التعرّف المجاني…");
    const { pipeline, env } = await import("@huggingface/transformers");
    // Browser-only CDN models (free, cached)
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    const transcriber = await pipeline(
      "automatic-speech-recognition",
      // tiny multilingual — free, small enough for mobile
      "Xenova/whisper-tiny",
      {
        // quantized is default for Xenova
        progress_callback: (p: {
          status?: string;
          progress?: number;
          file?: string;
        }) => {
          if (typeof p.progress === "number") {
            loadProgress = Math.min(99, Math.round(p.progress));
            onProgress?.(
              loadProgress,
              p.status === "done"
                ? "اكتمل الملف"
                : "تحميل النموذج (مرة واحدة، مجاني)…"
            );
          }
        },
      }
    );

    loadProgress = 100;
    onProgress?.(100, "جاهز");
    sharedPipeline = transcriber as unknown as AsrPipeline;
    return sharedPipeline;
  })();

  try {
    return await pipelineLoading;
  } catch (e) {
    pipelineLoading = null;
    throw e;
  }
}

function mergeTranscript(base: string, next: string): string {
  const a = (base || "").trim();
  const b = (next || "").trim();
  if (!b) return a;
  if (!a) return b;
  if (a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;
  // Prefer latest window if it contains substantial overlap with end of base
  const max = Math.min(a.length, b.length, 64);
  for (let n = max; n >= 4; n--) {
    if (a.slice(-n) === b.slice(0, n)) {
      return (a + b.slice(n)).replace(/\s+/g, " ").trim();
    }
  }
  // Whisper windows re-transcribe — if b is longer and shares words, prefer smarter join
  const aWords = a.split(/\s+/);
  const bWords = b.split(/\s+/);
  for (let k = Math.min(8, aWords.length, bWords.length); k >= 2; k--) {
    const tail = aWords.slice(-k).join(" ");
    const head = bWords.slice(0, k).join(" ");
    if (tail === head) {
      return [...aWords, ...bWords.slice(k)].join(" ").trim();
    }
  }
  return (a + " " + b).replace(/\s+/g, " ").trim();
}

function downsampleTo16k(
  input: Float32Array,
  fromRate: number
): Float32Array {
  if (fromRate === TARGET_SR) return input;
  const ratio = fromRate / TARGET_SR;
  const newLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const idx = Math.floor(i * ratio);
    out[i] = input[idx] ?? 0;
  }
  return out;
}

export class WasmWhisperSpeechSession {
  private handlers: SpeechHandlers = {};
  private finalBuffer = "";
  private running = false;
  private wantContinue = false;
  private destroyed = false;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private samples: Float32Array[] = [];
  private sampleCount = 0;
  private inputRate = 48000;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private inferring = false;
  private lastEmitted = "";

  async start(
    handlers: SpeechHandlers = {},
    opts?: {
      preserveBuffer?: boolean;
      onModelProgress?: (pct: number, status: string) => void;
    }
  ): Promise<{ ok: boolean; error?: string }> {
    if (typeof window === "undefined") {
      return { ok: false, error: "المتصفح فقط" };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: "الميكروفون غير متاح على هذا الجهاز." };
    }

    this.destroyed = false;
    this.handlers = handlers;
    if (!opts?.preserveBuffer) {
      this.finalBuffer = "";
      this.lastEmitted = "";
    }
    this.wantContinue = true;
    this.running = true;

    try {
      // Load model (cached after first time — free)
      await ensurePipeline(opts?.onModelProgress);

      // ONE continuous mic session — no open/close loop → no system beep
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
        video: false,
      });
      this.stream = stream;

      const W = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctx = W.AudioContext || W.webkitAudioContext;
      if (!Ctx) {
        this.cleanupAudio();
        return { ok: false, error: "AudioContext غير مدعوم" };
      }

      const ctx = new Ctx();
      this.audioCtx = ctx;
      this.inputRate = ctx.sampleRate || 48000;
      await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      this.source = source;
      // ScriptProcessor is deprecated but universally available; AudioWorklet needs extra files
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      this.processor = processor;

      processor.onaudioprocess = (ev) => {
        if (!this.wantContinue || this.destroyed) return;
        const input = ev.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        this.samples.push(copy);
        this.sampleCount += copy.length;
        // Trim ring buffer
        const maxSamples = Math.floor(MAX_BUFFER_SEC * this.inputRate);
        while (this.sampleCount > maxSamples && this.samples.length > 1) {
          const dropped = this.samples.shift();
          this.sampleCount -= dropped?.length || 0;
        }
      };

      // Silent keep-alive graph (gain 0) so stream stays hot
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);

      this.handlers.onListeningChange?.(true);

      // Sliding-window free STT
      if (this.tickTimer) clearInterval(this.tickTimer);
      this.tickTimer = setInterval(() => {
        void this.runInferenceTick();
      }, TICK_SEC * 1000);

      // First tick sooner
      window.setTimeout(() => void this.runInferenceTick(), 900);

      return { ok: true };
    } catch (e) {
      this.cleanupAudio();
      this.running = false;
      this.wantContinue = false;
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError") {
        return {
          ok: false,
          error: "تم رفض إذن الميكروفون. اسمح به من إعدادات المتصفح.",
        };
      }
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "تعذّر تشغيل محرك التعرّف المجاني.",
      };
    }
  }

  private collectWindow(): Float32Array | null {
    if (!this.sampleCount) return null;
    const need = Math.floor(WINDOW_SEC * this.inputRate);
    const take = Math.min(this.sampleCount, need);
    const out = new Float32Array(take);
    let offset = take;
    // copy from end of buffer
    for (let i = this.samples.length - 1; i >= 0 && offset > 0; i--) {
      const chunk = this.samples[i];
      const n = Math.min(chunk.length, offset);
      out.set(chunk.subarray(chunk.length - n), offset - n);
      offset -= n;
    }
    return downsampleTo16k(out, this.inputRate);
  }

  private async runInferenceTick() {
    if (!this.wantContinue || this.destroyed || this.inferring) return;
    if (!sharedPipeline) return;
    const audio = this.collectWindow();
    if (!audio || audio.length < TARGET_SR * 0.6) return; // need ≥0.6s

    // RMS silence gate — skip pure silence to save CPU
    let sum = 0;
    for (let i = 0; i < audio.length; i += 8) sum += audio[i] * audio[i];
    const rms = Math.sqrt(sum / (audio.length / 8));
    if (rms < 0.008) return;

    this.inferring = true;
    try {
      const result = await sharedPipeline(
        { array: audio, sampling_rate: TARGET_SR },
        {
          language: "arabic",
          task: "transcribe",
          // chunking inside model for long windows
          return_timestamps: false,
        }
      );
      const raw = Array.isArray(result) ? result[0]?.text : result?.text;
      const text = (raw || "").trim();
      if (!text) return;

      // Merge with cumulative buffer
      this.finalBuffer = mergeTranscript(this.finalBuffer, text);
      if (this.finalBuffer !== this.lastEmitted) {
        this.lastEmitted = this.finalBuffer;
        this.handlers.onInterim?.(this.finalBuffer);
        this.handlers.onFinal?.(this.finalBuffer);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ في التعرّف";
      // Soft — keep listening
      if (/network|fetch|load/i.test(msg)) {
        this.handlers.onError?.(
          "تعثّر تحميل/تشغيل النموذج مؤقتاً. أعد المحاولة مع اتصال شبكة (أول مرة فقط)."
        );
      }
    } finally {
      this.inferring = false;
    }
  }

  /** Pause inference + mic (releases hardware) */
  stop(): string {
    this.wantContinue = false;
    this.cleanupAudio();
    this.running = false;
    this.handlers.onListeningChange?.(false);
    return this.finalBuffer;
  }

  pauseRecognition(): string {
    // For WASM engine, pause = stop capture but keep buffer; user resume restarts stream
    this.wantContinue = false;
    this.cleanupAudio();
    this.running = false;
    this.handlers.onListeningChange?.(false);
    return this.finalBuffer;
  }

  async resume(handlers?: SpeechHandlers): Promise<{ ok: boolean; error?: string }> {
    if (handlers) this.handlers = handlers;
    return this.start(this.handlers, { preserveBuffer: true });
  }

  dispose() {
    this.destroyed = true;
    this.wantContinue = false;
    this.cleanupAudio();
    this.running = false;
    this.handlers = {};
  }

  private cleanupAudio() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.processor = null;
    this.source = null;
    if (this.audioCtx) {
      try {
        void this.audioCtx.close();
      } catch {
        /* ignore */
      }
      this.audioCtx = null;
    }
    if (this.stream) {
      try {
        this.stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      this.stream = null;
    }
    this.samples = [];
    this.sampleCount = 0;
  }

  isRunning() {
    return this.running;
  }

  getTranscript() {
    return this.finalBuffer;
  }
}

export function isWasmSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const hasMic = typeof navigator.mediaDevices?.getUserMedia === "function";
  const W = window as unknown as {
    AudioContext?: unknown;
    webkitAudioContext?: unknown;
  };
  const hasAudio = Boolean(W.AudioContext || W.webkitAudioContext);
  return Boolean(window.isSecureContext && hasMic && hasAudio);
}
