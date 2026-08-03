/**
 * Free forever continuous STT in the browser (Zero cloud cost).
 *
 * Critical mobile constraints fixed here:
 * 1) getUserMedia MUST run immediately on user gesture (before long model load)
 * 2) Progress is monotonic + aggregated across parallel model files
 * 3) start() is re-entrant safe with clear timeouts and errors
 */

import type { SpeechHandlers } from "./speech-recognition";

type AsrPipeline = (
  audio: Float32Array | { array: Float32Array; sampling_rate: number },
  opts?: Record<string, unknown>
) => Promise<{ text?: string } | { text?: string }[]>;

type ProgressCb = (pct: number, status: string) => void;

const TARGET_SR = 16000;
const WINDOW_SEC = 5;
const TICK_SEC = 2.5;
const MAX_BUFFER_SEC = 28;
const MODEL_ID = "Xenova/whisper-tiny";
const PIPELINE_TIMEOUT_MS = 180_000;
const MIC_TIMEOUT_MS = 25_000;

let sharedPipeline: AsrPipeline | null = null;
let pipelineLoading: Promise<AsrPipeline> | null = null;
/** Monotonic 0–100 for UI */
let loadProgress = 0;
const fileProgress = new Map<string, number>();
const progressListeners = new Set<ProgressCb>();

export function isWhisperPipelineReady(): boolean {
  return sharedPipeline != null;
}

export function getWhisperLoadProgress(): number {
  return loadProgress;
}

function emitProgress(pct: number, status: string) {
  // Never go backwards (fixes 30% → 20% flicker from multi-file downloads)
  loadProgress = Math.max(loadProgress, Math.min(100, Math.round(pct)));
  for (const cb of progressListeners) {
    try {
      cb(loadProgress, status);
    } catch {
      /* ignore listener errors */
    }
  }
}

function normalizeFileProgress(p: {
  progress?: number;
  loaded?: number;
  total?: number;
}): number {
  if (
    typeof p.loaded === "number" &&
    typeof p.total === "number" &&
    p.total > 0
  ) {
    return Math.min(100, (p.loaded / p.total) * 100);
  }
  if (typeof p.progress === "number") {
    // HF may report 0–1 or 0–100
    return p.progress <= 1 ? p.progress * 100 : p.progress;
  }
  return 0;
}

function recomputeAggregateProgress(status: string) {
  if (fileProgress.size === 0) {
    emitProgress(loadProgress, status);
    return;
  }
  let sum = 0;
  for (const v of fileProgress.values()) sum += v;
  const avg = sum / fileProgress.size;
  emitProgress(avg, status);
}

function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function preloadWhisperModel(
  onProgress?: ProgressCb
): Promise<void> {
  await ensurePipeline(onProgress);
}

async function ensurePipeline(onProgress?: ProgressCb): Promise<AsrPipeline> {
  if (sharedPipeline) {
    onProgress?.(100, "المحرك جاهز");
    return sharedPipeline;
  }

  if (onProgress) progressListeners.add(onProgress);

  if (!pipelineLoading) {
    pipelineLoading = (async () => {
      try {
        emitProgress(1, "تحميل مكتبة التعرّف…");
        const { pipeline, env } = await import("@huggingface/transformers");
        env.allowLocalModels = false;
        env.useBrowserCache = true;

        emitProgress(Math.max(loadProgress, 3), "تحميل نموذج Whisper المجاني…");

        const transcriber = await withTimeout(
          pipeline("automatic-speech-recognition", MODEL_ID, {
            progress_callback: (p: {
              status?: string;
              progress?: number;
              file?: string;
              name?: string;
              loaded?: number;
              total?: number;
            }) => {
              const fileKey = p.file || p.name || p.status || "file";
              if (p.status === "done") {
                fileProgress.set(fileKey, 100);
                recomputeAggregateProgress(`اكتمل: ${fileKey}`);
                return;
              }
              if (
                p.status === "progress" ||
                typeof p.progress === "number" ||
                typeof p.loaded === "number"
              ) {
                const fp = normalizeFileProgress(p);
                // Per-file monotonic
                const prev = fileProgress.get(fileKey) || 0;
                fileProgress.set(fileKey, Math.max(prev, fp));
                recomputeAggregateProgress("تحميل ملفات النموذج…");
              }
            },
          }) as Promise<AsrPipeline>,
          PIPELINE_TIMEOUT_MS,
          "انتهت مهلة تحميل النموذج (3 دقائق). تحقق من الشبكة وأعد المحاولة."
        );

        sharedPipeline = transcriber as unknown as AsrPipeline;
        emitProgress(100, "المحرك جاهز");
        return sharedPipeline;
      } catch (e) {
        pipelineLoading = null;
        fileProgress.clear();
        // Allow retry; keep loadProgress for debug but don't lock UI
        throw e instanceof Error
          ? e
          : new Error("فشل تحميل محرك Whisper المجاني");
      }
    })();
  }

  try {
    const pipe = await pipelineLoading;
    return pipe;
  } finally {
    if (onProgress) progressListeners.delete(onProgress);
  }
}

function mergeTranscript(base: string, next: string): string {
  const a = (base || "").trim();
  const b = (next || "").trim();
  if (!b) return a;
  if (!a) return b;
  if (a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;
  const max = Math.min(a.length, b.length, 64);
  for (let n = max; n >= 4; n--) {
    if (a.slice(-n) === b.slice(0, n)) {
      return (a + b.slice(n)).replace(/\s+/g, " ").trim();
    }
  }
  const aWords = a.split(/\s+/);
  const bWords = b.split(/\s+/);
  for (let k = Math.min(8, aWords.length, bWords.length); k >= 2; k--) {
    if (aWords.slice(-k).join(" ") === bWords.slice(0, k).join(" ")) {
      return [...aWords, ...bWords.slice(k)].join(" ").trim();
    }
  }
  return (a + " " + b).replace(/\s+/g, " ").trim();
}

function downsampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === TARGET_SR) return input;
  const ratio = fromRate / TARGET_SR;
  const newLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    out[i] = input[Math.floor(i * ratio)] ?? 0;
  }
  return out;
}

function formatErr(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      return "تم رفض إذن الميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.";
    }
    if (e.name === "NotFoundError") {
      return "لم يُعثر على ميكروفون.";
    }
    return `خطأ الميكروفون: ${e.name} — ${e.message}`;
  }
  if (e instanceof Error) {
    return e.message || e.name || "خطأ غير معروف";
  }
  return String(e || "خطأ غير معروف");
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
  private gainNode: GainNode | null = null;
  private samples: Float32Array[] = [];
  private sampleCount = 0;
  private inputRate = 48000;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private inferring = false;
  private lastEmitted = "";
  /** Prevent double-start hang */
  private startLock = false;

  async start(
    handlers: SpeechHandlers = {},
    opts?: {
      preserveBuffer?: boolean;
      onModelProgress?: ProgressCb;
      /** UI phase hooks */
      onPhase?: (phase: "mic" | "model" | "ready") => void;
    }
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.startLock) {
      return {
        ok: false,
        error:
          "التشغيل قيد التحضير بالفعل. انتظر قليلاً أو أعد تحميل الصفحة إن استمر التعليق.",
      };
    }
    this.startLock = true;

    if (typeof window === "undefined") {
      this.startLock = false;
      return { ok: false, error: "المتصفح فقط" };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.startLock = false;
      return { ok: false, error: "الميكروفون غير متاح على هذا الجهاز." };
    }

    // Clean any half-open session from a previous failed start
    this.cleanupAudio();

    this.destroyed = false;
    this.handlers = handlers;
    if (!opts?.preserveBuffer) {
      this.finalBuffer = "";
      this.lastEmitted = "";
    }
    this.wantContinue = true;
    this.running = false;

    try {
      /**
       * CRITICAL: getUserMedia FIRST while still in user-gesture chain.
       * Awaiting model download before getUserMedia causes permanent hang
       * on many Android Chrome builds (permission never prompts / never resolves).
       */
      opts?.onPhase?.("mic");
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
          },
          video: false,
        }),
        MIC_TIMEOUT_MS,
        "انتهت مهلة طلب الميكروفون. اسمح بالإذن إن ظهر، أو أعد تحميل الصفحة."
      );
      this.stream = stream;

      // Then load model (mic already open — gesture constraint satisfied)
      opts?.onPhase?.("model");
      await ensurePipeline(opts?.onModelProgress);

      const W = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctx = W.AudioContext || W.webkitAudioContext;
      if (!Ctx) {
        this.cleanupAudio();
        this.startLock = false;
        return { ok: false, error: "AudioContext غير مدعوم على هذا المتصفح." };
      }

      const ctx = new Ctx();
      this.audioCtx = ctx;
      this.inputRate = ctx.sampleRate || 48000;
      if (ctx.state === "suspended") {
        await withTimeout(
          ctx.resume(),
          8000,
          "تعذّر تنشيط AudioContext. اضغط الشاشة مرة ثم أعد «ابدأ»."
        );
      }

      const source = ctx.createMediaStreamSource(stream);
      this.source = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      this.processor = processor;

      processor.onaudioprocess = (ev) => {
        if (!this.wantContinue || this.destroyed) return;
        const input = ev.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        this.samples.push(copy);
        this.sampleCount += copy.length;
        const maxSamples = Math.floor(MAX_BUFFER_SEC * this.inputRate);
        while (this.sampleCount > maxSamples && this.samples.length > 1) {
          const dropped = this.samples.shift();
          this.sampleCount -= dropped?.length || 0;
        }
      };

      const gain = ctx.createGain();
      gain.gain.value = 0;
      this.gainNode = gain;
      source.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);

      this.running = true;
      this.wantContinue = true;
      this.handlers.onListeningChange?.(true);
      opts?.onPhase?.("ready");

      if (this.tickTimer) clearInterval(this.tickTimer);
      this.tickTimer = setInterval(() => {
        void this.runInferenceTick();
      }, TICK_SEC * 1000);
      window.setTimeout(() => void this.runInferenceTick(), 1200);

      this.startLock = false;
      return { ok: true };
    } catch (e) {
      this.cleanupAudio();
      this.running = false;
      this.wantContinue = false;
      this.startLock = false;
      const msg = formatErr(e);
      this.handlers.onError?.(msg);
      return { ok: false, error: msg };
    }
  }

  private collectWindow(): Float32Array | null {
    if (!this.sampleCount) return null;
    const need = Math.floor(WINDOW_SEC * this.inputRate);
    const take = Math.min(this.sampleCount, need);
    const out = new Float32Array(take);
    let offset = take;
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
    if (!audio || audio.length < TARGET_SR * 0.6) return;

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
          return_timestamps: false,
        }
      );
      const raw = Array.isArray(result) ? result[0]?.text : result?.text;
      const text = (raw || "").trim();
      if (!text) return;

      this.finalBuffer = mergeTranscript(this.finalBuffer, text);
      if (this.finalBuffer !== this.lastEmitted) {
        this.lastEmitted = this.finalBuffer;
        this.handlers.onInterim?.(this.finalBuffer);
        this.handlers.onFinal?.(this.finalBuffer);
      }
    } catch (e) {
      const msg = formatErr(e);
      // Surface once so UI is not silent forever
      this.handlers.onError?.("خطأ أثناء التعرّف: " + msg);
    } finally {
      this.inferring = false;
    }
  }

  stop(): string {
    this.wantContinue = false;
    this.cleanupAudio();
    this.running = false;
    this.startLock = false;
    this.handlers.onListeningChange?.(false);
    return this.finalBuffer;
  }

  pauseRecognition(): string {
    this.wantContinue = false;
    this.cleanupAudio();
    this.running = false;
    this.startLock = false;
    this.handlers.onListeningChange?.(false);
    return this.finalBuffer;
  }

  async resume(
    handlers?: SpeechHandlers
  ): Promise<{ ok: boolean; error?: string }> {
    if (handlers) this.handlers = handlers;
    return this.start(this.handlers, { preserveBuffer: true });
  }

  dispose() {
    this.destroyed = true;
    this.wantContinue = false;
    this.cleanupAudio();
    this.running = false;
    this.startLock = false;
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
      this.gainNode?.disconnect();
    } catch {
      /* ignore */
    }
    this.processor = null;
    this.source = null;
    this.gainNode = null;
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
