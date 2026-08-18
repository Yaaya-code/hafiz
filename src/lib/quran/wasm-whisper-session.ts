/**
 * Free forever STT (Zero cloud cost).
 *
 * Desktop live: Web Speech (elsewhere) or optional wasm live ticks.
 * Mobile Pure Batch (reverted from background chunking):
 * - Open mic, append to ONE contiguous buffer — nothing to Worker while recording
 * - On «تم»: analyze the full buffer (offline). matchLive only after that.
 */

import type { SpeechHandlers } from "./speech-recognition";

type ProgressCb = (pct: number, status: string) => void;

const TARGET_SR = 16000;
/** Shorter window = less lag + less main/worker pressure (legacy live path) */
const WINDOW_SEC = 2.8;
/** Minimum gap between starting two inferences (ms) */
const MIN_INFER_GAP_MS = 1800;
/** Keep ~12s of mic audio for live ticks */
const MAX_BUFFER_SEC = 12;
/**
 * Pure Batch: no inference during recording.
 * Extreme RAM safety only (~20 min) — drop oldest samples, never stop the mic for UX.
 * Whisper native window ~30s: after «تم» we may split the COMPLETE contiguous
 * buffer offline (not mid-recording peels) so long tilawah is not truncated.
 */
const BATCH_HARD_SAFETY_SEC = 20 * 60;
/** Offline-only slice length when finishing a long contiguous recording */
const BATCH_OFFLINE_SLICE_SEC = 30;
/** Overlap between offline slices to reduce mid-word cuts at boundaries */
const BATCH_OFFLINE_OVERLAP_SEC = 1;
const MIC_TIMEOUT_MS = 25_000;
const AUDIO_RESUME_MS = 8_000;
const PIPELINE_TIMEOUT_MS = 180_000;
const START_TIMEOUT_MS = 200_000;
/** RMS gate — ignore silence / very soft noise */
const RMS_MIN = 0.01;

type WorkerOut =
  | { type: "progress"; pct: number; status: string }
  | { type: "ready"; dtype: string }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id?: number; error: string };

let sharedWorker: Worker | null = null;
let workerReady = false;
let workerLoading: Promise<void> | null = null;
let loadProgress = 0;
const progressListeners = new Set<ProgressCb>();
let inferSeq = 1;

export function isWhisperPipelineReady(): boolean {
  return workerReady && sharedWorker != null;
}

export function getWhisperLoadProgress(): number {
  return loadProgress;
}

function emitProgress(pct: number, status: string) {
  loadProgress = Math.max(loadProgress, Math.min(100, Math.round(pct)));
  for (const cb of progressListeners) {
    try {
      cb(loadProgress, status);
    } catch {
      /* ignore */
    }
  }
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

function formatErr(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      return "تم رفض إذن الميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.";
    }
    if (e.name === "NotFoundError") return "لم يُعثر على ميكروفون.";
    if (e.name === "NotReadableError" || e.name === "AbortError") {
      return `الميكروفون مشغول أو أُلغي الطلب (${e.name}).`;
    }
    return `خطأ الميكروفون: ${e.name} — ${e.message}`;
  }
  if (e instanceof Error) {
    const m = e.message || e.name || "خطأ غير معروف";
    if (/memory|out of memory|OOM|Array buffer|allocation/i.test(m)) {
      return `نفدت ذاكرة المتصفح أثناء تحميل النموذج. أغلق تبويبات أخرى. التفاصيل: ${m}`;
    }
    return m;
  }
  return String(e || "خطأ غير معروف");
}

function createWhisperWorker(): Worker {
  // Bundled by Next/webpack as a classic module worker
  return new Worker(new URL("./whisper.worker.ts", import.meta.url));
}

function getOrCreateWorker(): Worker {
  if (sharedWorker) return sharedWorker;
  const w = createWhisperWorker();
  sharedWorker = w;
  w.onmessage = (ev: MessageEvent<WorkerOut>) => {
    const msg = ev.data;
    if (!msg) return;
    if (msg.type === "progress") {
      emitProgress(msg.pct, msg.status);
    }
  };
  w.onerror = (ev) => {
    console.error("[whisper-worker]", ev.message);
  };
  return w;
}

/**
 * Ensure worker has loaded the model. Safe to call from preload + start.
 */
export async function preloadWhisperModel(
  onProgress?: ProgressCb
): Promise<void> {
  await ensureWorkerReady(onProgress);
}

async function ensureWorkerReady(onProgress?: ProgressCb): Promise<void> {
  if (workerReady && sharedWorker) {
    onProgress?.(100, "المحرك جاهز");
    return;
  }
  if (onProgress) progressListeners.add(onProgress);

  if (!workerLoading) {
    workerLoading = (async () => {
      const w = getOrCreateWorker();
      emitProgress(1, "تشغيل محرك التعرّف في الخلفية…");

      await withTimeout(
        new Promise<void>((resolve, reject) => {
          const onMsg = (ev: MessageEvent<WorkerOut>) => {
            const msg = ev.data;
            if (!msg) return;
            if (msg.type === "progress") {
              emitProgress(msg.pct, msg.status);
            } else if (msg.type === "ready") {
              cleanup();
              workerReady = true;
              emitProgress(100, `المحرك جاهز (${msg.dtype})`);
              resolve();
            } else if (msg.type === "error" && msg.id == null) {
              cleanup();
              reject(new Error(msg.error));
            }
          };
          const onErr = () => {
            cleanup();
            reject(new Error("فشل Worker التعرّف — أعد تحميل الصفحة."));
          };
          const cleanup = () => {
            w.removeEventListener("message", onMsg);
            w.removeEventListener("error", onErr);
          };
          w.addEventListener("message", onMsg);
          w.addEventListener("error", onErr);
          w.postMessage({ type: "load" });
        }),
        PIPELINE_TIMEOUT_MS,
        "انتهت مهلة تحميل النموذج (3 دقائق). تحقق من الشبكة/الذاكرة."
      );
    })().catch((e) => {
      workerLoading = null;
      workerReady = false;
      throw e;
    });
  }

  try {
    await workerLoading;
  } finally {
    if (onProgress) progressListeners.delete(onProgress);
  }
}

function downsampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === TARGET_SR) {
    return new Float32Array(input);
  }
  // Linear interpolation — better Arabic quality than nearest-neighbor
  const ratio = fromRate / TARGET_SR;
  const newLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = (input[i0] ?? 0) * (1 - t) + (input[i1] ?? 0) * t;
  }
  return out;
}

/**
 * Conservative merge: prefer extension / overlap, avoid gluing unrelated windows
 * into multi-ayah hallucinations.
 */
function mergeTranscript(base: string, next: string): string {
  const a = (base || "").trim();
  const b = (next || "").trim();
  if (!b) return a;
  if (!a) return b;
  if (a === b) return a;
  if (a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;
  if (a.includes(b) && b.length >= 4) return a;

  // Character overlap at boundary
  const max = Math.min(a.length, b.length, 48);
  for (let n = max; n >= 4; n--) {
    if (a.slice(-n) === b.slice(0, n)) {
      return (a + b.slice(n)).replace(/\s+/g, " ").trim();
    }
  }

  const aWords = a.split(/\s+/).filter(Boolean);
  const bWords = b.split(/\s+/).filter(Boolean);

  // Word-level overlap
  for (let k = Math.min(6, aWords.length, bWords.length); k >= 2; k--) {
    if (aWords.slice(-k).join(" ") === bWords.slice(0, k).join(" ")) {
      return [...aWords, ...bWords.slice(k)].join(" ").trim();
    }
  }

  // If new window is mostly a re-say of the tail, keep longer of the two tails
  const tail = aWords.slice(-8).join(" ");
  if (tail && b.includes(tail.slice(0, Math.min(12, tail.length)))) {
    // Prefer appending only novel suffix words
    let start = 0;
    for (let k = Math.min(bWords.length, 6); k >= 1; k--) {
      const head = bWords.slice(0, k).join(" ");
      if (a.endsWith(head) || a.includes(head)) {
        start = k;
        break;
      }
    }
    if (start > 0 && start < bWords.length) {
      return [...aWords, ...bWords.slice(start)].join(" ").trim();
    }
  }

  // Default: append (window captured new speech)
  return (a + " " + b).replace(/\s+/g, " ").trim();
}

function rmsOf(audio: Float32Array): number {
  let sum = 0;
  const step = 8;
  let n = 0;
  for (let i = 0; i < audio.length; i += step) {
    sum += audio[i] * audio[i];
    n++;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

function workerInfer(
  pcm: Float32Array,
  initialPrompt?: string
): Promise<string> {
  const w = getOrCreateWorker();
  const id = inferSeq++;
  const buffer = pcm.buffer.slice(
    pcm.byteOffset,
    pcm.byteOffset + pcm.byteLength
  ) as ArrayBuffer;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("انتهت مهلة الاستدلال الصوتي (45ث)."));
    }, 45_000);

    const onMsg = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data;
      if (!msg) return;
      if (msg.type === "result" && msg.id === id) {
        cleanup();
        resolve(msg.text || "");
      } else if (msg.type === "error" && msg.id === id) {
        cleanup();
        reject(new Error(msg.error));
      }
    };
    const onErr = () => {
      cleanup();
      reject(new Error("انهار Worker أثناء الاستدلال."));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    w.postMessage(
      {
        type: "infer",
        id,
        pcm: buffer,
        initialPrompt: initialPrompt || "",
      },
      [buffer]
    );
  });
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
  private lastInferAt = 0;
  private lastEmitted = "";
  private startLock = false;
  private startEpoch = 0;
  /** Quran words expected next — biases Whisper decoder */
  private initialPrompt = "";
  private lastErrorAt = 0;
  /**
   * Latest PCM captured while Worker was busy (live path only).
   * Overwritten — never queued.
   */
  private pendingLatest: Float32Array | null = null;
  /** Mobile Pure Batch: record only — Worker runs after «تم» */
  private batchMode = false;

  /** Update expected Quran context while listening (call from UI as cursor moves). */
  setExpectedPrompt(text: string) {
    this.initialPrompt = (text || "").trim().slice(0, 220);
  }

  isBatchMode() {
    return this.batchMode;
  }

  /** Seconds recorded so far (capture clock) — for optional UI timer only */
  getBatchRecordedSec() {
    if (!this.batchMode || !this.inputRate) return 0;
    return this.sampleCount / this.inputRate;
  }

  async start(
    handlers: SpeechHandlers = {},
    opts?: {
      preserveBuffer?: boolean;
      onModelProgress?: ProgressCb;
      onPhase?: (phase: "mic" | "model" | "ready") => void;
      /** Expected upcoming Quran text for Whisper initial_prompt */
      expectedPrompt?: string;
      /**
       * live = continuous ticks (legacy / advanced).
       * batch = record only; call finishBatchTranscription() after user stops.
       */
      mode?: "live" | "batch";
    }
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.startLock) {
      return {
        ok: false,
        error:
          "التشغيل قيد التحضير بالفعل. انتظر أو اضغط «إلغاء»، أو أعد تحميل الصفحة.",
      };
    }
    this.startLock = true;
    const epoch = ++this.startEpoch;

    if (typeof window === "undefined") {
      this.startLock = false;
      return { ok: false, error: "المتصفح فقط" };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.startLock = false;
      return { ok: false, error: "الميكروفون غير متاح على هذا الجهاز." };
    }

    this.cleanupAudio();
    this.destroyed = false;
    this.handlers = handlers;
    if (!opts?.preserveBuffer) {
      this.finalBuffer = "";
      this.lastEmitted = "";
    }
    if (opts?.expectedPrompt) {
      this.initialPrompt = opts.expectedPrompt.trim().slice(0, 220);
    }
    this.batchMode = opts?.mode === "batch";
    this.wantContinue = true;
    this.running = false;

    const aborted = () =>
      this.destroyed || epoch !== this.startEpoch || !this.wantContinue;

    try {
      const result = await withTimeout(
        this.runStartSequence(opts, aborted),
        START_TIMEOUT_MS,
        "انتهت المهلة الكلية لبدء التسميع. أعد المحاولة."
      );
      if (aborted()) {
        this.cleanupAudio();
        this.startLock = false;
        return { ok: false, error: "تم إلغاء التشغيل." };
      }
      this.startLock = false;
      return result;
    } catch (e) {
      this.cleanupAudio();
      this.running = false;
      this.wantContinue = false;
      this.startLock = false;
      const msg = formatErr(e);
      try {
        this.handlers.onError?.(msg);
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg };
    }
  }

  private async runStartSequence(
    opts:
      | {
          preserveBuffer?: boolean;
          onModelProgress?: ProgressCb;
          onPhase?: (phase: "mic" | "model" | "ready") => void;
          expectedPrompt?: string;
          mode?: "live" | "batch";
        }
      | undefined,
    aborted: () => boolean
  ): Promise<{ ok: boolean; error?: string }> {
    // Mic FIRST (user-gesture chain)
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
      "انتهت مهلة طلب الميكروفون. اسمح بالإذن إن ظهر."
    );
    if (aborted()) {
      stream.getTracks().forEach((t) => t.stop());
      return { ok: false, error: "تم إلغاء التشغيل." };
    }
    this.stream = stream;

    // Model load in Worker (UI stays responsive during download)
    opts?.onPhase?.("model");
    await ensureWorkerReady(opts?.onModelProgress);
    if (aborted()) return { ok: false, error: "تم إلغاء التشغيل." };

    const W = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctx = W.AudioContext || W.webkitAudioContext;
    if (!Ctx) {
      this.cleanupAudio();
      return { ok: false, error: "AudioContext غير مدعوم." };
    }

    const ctx = new Ctx();
    this.audioCtx = ctx;
    this.inputRate = ctx.sampleRate || 48000;
    if (ctx.state === "suspended") {
      await withTimeout(
        ctx.resume(),
        AUDIO_RESUME_MS,
        "تعذّر تنشيط AudioContext. اضغط الشاشة ثم أعد «ابدأ»."
      );
    }
    if (aborted()) return { ok: false, error: "تم إلغاء التشغيل." };

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

      if (this.batchMode) {
        // Pure Batch: grow one contiguous buffer. No Worker calls here.
        const hardMax = Math.floor(BATCH_HARD_SAFETY_SEC * this.inputRate);
        while (this.sampleCount > hardMax && this.samples.length > 1) {
          const dropped = this.samples.shift();
          this.sampleCount -= dropped?.length || 0;
        }
        return;
      }

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
    this.tickTimer = null;

    // Pure Batch: NO timers / NO Worker during recording.
    // Live path only: periodic inference ticks.
    if (!this.batchMode) {
      this.tickTimer = setInterval(() => {
        void this.runInferenceTick();
      }, 400);
      window.setTimeout(() => void this.runInferenceTick(), 900);
    }

    return { ok: true };
  }

  /** Flatten the contiguous capture ring → one Float32Array at capture rate. */
  private collectAllCaptureRate(): Float32Array | null {
    if (!this.sampleCount) return null;
    const out = new Float32Array(this.sampleCount);
    let offset = 0;
    for (const chunk of this.samples) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  /**
   * Offline analysis of a COMPLETE contiguous 16 kHz buffer after recording ends.
   * Not mid-recording peelFront — the full tilawah is already captured first.
   * Whisper ~30s window: long clips are sliced offline with small overlap.
   */
  private async transcribeContiguousPcm16(
    pcm16: Float32Array
  ): Promise<string> {
    const slice = Math.floor(BATCH_OFFLINE_SLICE_SEC * TARGET_SR);
    const overlap = Math.floor(BATCH_OFFLINE_OVERLAP_SEC * TARGET_SR);
    const step = Math.max(1, slice - overlap);

    if (pcm16.length <= slice) {
      if (rmsOf(pcm16) < RMS_MIN * 0.45) return "";
      return (await workerInfer(new Float32Array(pcm16), this.initialPrompt)) || "";
    }

    let text = "";
    for (let i = 0; i < pcm16.length; i += step) {
      const end = Math.min(i + slice, pcm16.length);
      const part = pcm16.subarray(i, end);
      if (part.length < TARGET_SR * 0.4) break;
      if (rmsOf(part) < RMS_MIN * 0.45) {
        if (end >= pcm16.length) break;
        continue;
      }
      const copy = new Float32Array(part.length);
      copy.set(part);
      const t = await workerInfer(copy, this.initialPrompt);
      if (t) text = mergeTranscript(text, t);
      if (end >= pcm16.length) break;
    }
    return text.replace(/\s+/g, " ").trim();
  }

  /**
   * Pure Batch «تم التسجيل»:
   * 1) Stop mic — nothing was sent to Worker during recording
   * 2) Take the ONE contiguous buffer
   * 3) Offline-transcribe (single pass or offline slices of the complete buffer)
   * 4) Return full text — page runs matchLive once
   */
  async finishBatchTranscription(): Promise<{
    ok: boolean;
    text?: string;
    error?: string;
  }> {
    if (!this.batchMode) {
      return { ok: false, error: "الجلسة ليست في وضع Batch." };
    }
    this.wantContinue = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    try {
      await ensureWorkerReady();
      const raw = this.collectAllCaptureRate();
      this.samples = [];
      this.sampleCount = 0;
      this.cleanupAudioTracksOnly();

      if (!raw || raw.length < this.inputRate * 0.4) {
        this.running = false;
        this.handlers.onListeningChange?.(false);
        return {
          ok: false,
          error: "التسجيل قصير جداً. أعد التسجيل واقرأ بوضوح.",
        };
      }

      const pcm16 = downsampleTo16k(raw, this.inputRate);
      const text = await this.transcribeContiguousPcm16(pcm16);

      this.finalBuffer = text;
      this.lastEmitted = text;
      this.running = false;
      this.handlers.onListeningChange?.(false);

      if (!text) {
        return {
          ok: false,
          error: "لم يُلتقط كلام واضح. أعد التسجيل واقرأ بوضوح.",
        };
      }

      return { ok: true, text };
    } catch (e) {
      this.running = false;
      this.handlers.onListeningChange?.(false);
      return { ok: false, error: formatErr(e) };
    }
  }

  /** Stop tracks + audio graph but keep sample buffer until after we copied it */
  private cleanupAudioTracksOnly() {
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
  }

  private collectWindow(): Float32Array | null {
    if (!this.sampleCount) return null;
    const need = Math.floor(WINDOW_SEC * this.inputRate);
    const take = Math.min(this.sampleCount, need);
    if (take < this.inputRate * 0.5) return null;
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
    if (!this.wantContinue || this.destroyed) return;
    if (!workerReady) return;

    /**
     * Queue policy (anti-backlog):
     * If Worker is busy, DO NOT enqueue old windows. Overwrite pendingLatest
     * with the newest mic window only. Prefer losing a syllable over 10s lag.
     */
    if (this.inferring) {
      const latest = this.collectWindow();
      if (latest && rmsOf(latest) >= RMS_MIN) {
        this.pendingLatest = latest; // drop any previously pending window
      }
      return;
    }

    const now = Date.now();
    if (now - this.lastInferAt < MIN_INFER_GAP_MS && !this.pendingLatest) {
      return;
    }

    // Prefer the newest window saved while busy; else sample now
    let audio = this.pendingLatest;
    this.pendingLatest = null;
    if (!audio) {
      audio = this.collectWindow();
    }
    if (!audio || audio.length < TARGET_SR * 0.5) return;

    const rms = rmsOf(audio);
    if (rms < RMS_MIN) return;

    await this.runOneInfer(audio);
  }

  private async runOneInfer(audio: Float32Array) {
    if (!this.wantContinue || this.destroyed || this.inferring) return;

    this.inferring = true;
    this.lastInferAt = Date.now();
    let followUp: Float32Array | null = null;
    try {
      const pcm = new Float32Array(audio.length);
      pcm.set(audio);

      const text = await workerInfer(pcm, this.initialPrompt);
      if (!this.wantContinue || this.destroyed) return;

      // Newer mic window arrived while Worker was busy → drop THIS stale result
      // and schedule only the latest window (no backlog of old windows).
      if (this.pendingLatest) {
        followUp = this.pendingLatest;
        this.pendingLatest = null;
        return;
      }

      if (!text) return;

      this.finalBuffer = mergeTranscript(this.finalBuffer, text);
      if (this.finalBuffer !== this.lastEmitted) {
        this.lastEmitted = this.finalBuffer;
        const snap = this.finalBuffer;
        queueMicrotask(() => {
          if (!this.wantContinue || this.destroyed) return;
          this.handlers.onInterim?.(snap);
          this.handlers.onFinal?.(snap);
        });
      }
    } catch (e) {
      const msg = formatErr(e);
      if (Date.now() - this.lastErrorAt > 8000) {
        this.lastErrorAt = Date.now();
        this.handlers.onError?.("خطأ أثناء التعرّف: " + msg);
      }
    } finally {
      this.inferring = false;
      if (!followUp && this.pendingLatest) {
        followUp = this.pendingLatest;
        this.pendingLatest = null;
      }
      if (followUp && this.wantContinue && !this.destroyed) {
        void this.runOneInfer(followUp);
      }
    }
  }

  stop(): string {
    this.wantContinue = false;
    this.startEpoch += 1;
    this.cleanupAudio();
    this.running = false;
    this.startLock = false;
    this.handlers.onListeningChange?.(false);
    return this.finalBuffer;
  }

  pauseRecognition(): string {
    this.wantContinue = false;
    this.startEpoch += 1;
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
    return this.start(this.handlers, {
      preserveBuffer: true,
      expectedPrompt: this.initialPrompt,
    });
  }

  dispose() {
    this.destroyed = true;
    this.wantContinue = false;
    this.startEpoch += 1;
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
    this.inferring = false;
    this.pendingLatest = null;
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
  const hasWorker = typeof Worker !== "undefined";
  return Boolean(window.isSecureContext && hasMic && hasAudio && hasWorker);
}
