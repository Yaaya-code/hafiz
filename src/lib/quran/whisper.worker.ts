/**
 * Whisper ASR Web Worker — free, local, zero cloud.
 *
 * Runs model load + ONNX/WASM inference OFF the UI thread so the page
 * stays responsive while mobile CPU is busy.
 *
 * Protocol (main ↔ worker):
 *   load   → progress* → ready | error
 *   infer  → result | error
 *   dispose
 */

/* eslint-disable no-restricted-globals -- Web Worker scope */
type WorkerScope = {
  postMessage: (msg: unknown) => void;
  onmessage: ((ev: MessageEvent) => void) | null;
};
const workerScope = globalThis as unknown as WorkerScope;

const MODEL_ID = "Xenova/whisper-tiny";
const TARGET_SR = 16000;

type AsrPipeline = (
  audio: Float32Array,
  opts?: Record<string, unknown>
) => Promise<{ text?: string } | { text?: string }[]>;

type InMsg =
  | { type: "load" }
  | {
      type: "infer";
      id: number;
      /** Transferable PCM @ 16 kHz mono float32 */
      pcm: ArrayBuffer;
      initialPrompt?: string;
    }
  | { type: "dispose" };

type OutMsg =
  | { type: "progress"; pct: number; status: string }
  | { type: "ready"; dtype: string }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id?: number; error: string };

let pipelineFn: AsrPipeline | null = null;
let loading: Promise<void> | null = null;
let loadProgress = 0;
let activeDtype = "fp32";

function post(msg: OutMsg) {
  workerScope.postMessage(msg);
}

function emitProgress(pct: number, status: string) {
  loadProgress = Math.max(loadProgress, Math.min(100, Math.round(pct)));
  post({ type: "progress", pct: loadProgress, status });
}

function progressCallback(p: {
  status?: string;
  progress?: number;
  file?: string;
  name?: string;
  loaded?: number;
  total?: number;
}) {
  if (typeof p.loaded === "number" && typeof p.total === "number" && p.total > 0) {
    // Coarse: map file progress into 5–92
    const filePct = (p.loaded / p.total) * 100;
    emitProgress(5 + filePct * 0.87, "تحميل ملفات النموذج…");
    return;
  }
  if (typeof p.progress === "number") {
    const fp = p.progress <= 1 ? p.progress * 100 : p.progress;
    emitProgress(5 + Math.min(100, fp) * 0.87, "تحميل ملفات النموذج…");
  }
  if (p.status === "done") {
    emitProgress(Math.max(loadProgress, 90), `اكتمل: ${p.file || p.name || "file"}`);
  }
}

async function createPipeline(dtype: "q8" | "fp32"): Promise<AsrPipeline> {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  emitProgress(3, `تهيئة Whisper (${dtype})…`);

  const pipe = await pipeline("automatic-speech-recognition", MODEL_ID, {
    // Prefer q8 (faster). Fall back to fp32 if MatMulNBits/quant crashes.
    quantized: dtype !== "fp32",
    dtype,
    progress_callback: progressCallback,
  } as Record<string, unknown>);

  return pipe as unknown as AsrPipeline;
}

async function ensureLoaded(): Promise<void> {
  if (pipelineFn) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      emitProgress(1, "تحميل مكتبة التعرّف في الخلفية…");

      // Try q8 first (much faster on phones). On quant/NBits failure → fp32.
      try {
        pipelineFn = await createPipeline("q8");
        activeDtype = "q8";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          /MatMulNBits|DequantizeLinear|Missing required scale|qdq|quant/i.test(
            msg
          )
        ) {
          emitProgress(4, "q8 غير متوافق — التحويل إلى fp32…");
          pipelineFn = await createPipeline("fp32");
          activeDtype = "fp32";
        } else {
          throw e;
        }
      }

      emitProgress(100, "المحرك جاهز");
      post({ type: "ready", dtype: activeDtype });
    } catch (e) {
      loading = null;
      pipelineFn = null;
      throw e;
    }
  })();

  return loading;
}

function stripHallucinations(text: string): string {
  let t = (text || "").trim();
  if (!t) return "";
  // Drop common empty-room / music captions Whisper invents
  if (
    /^(thanks for watching|thank you|subscribe|music|\[.*\]|\(.*\))$/i.test(t)
  ) {
    return "";
  }
  // Collapse extreme stutter: word word word → word
  t = t.replace(/(\S+)(?:\s+\1){2,}/gi, "$1");
  return t.replace(/\s+/g, " ").trim();
}

workerScope.onmessage = async (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object") return;

  try {
    if (msg.type === "load") {
      await ensureLoaded();
      if (pipelineFn) post({ type: "ready", dtype: activeDtype });
      return;
    }

    if (msg.type === "dispose") {
      pipelineFn = null;
      loading = null;
      return;
    }

    if (msg.type === "infer") {
      await ensureLoaded();
      if (!pipelineFn) {
        post({ type: "error", id: msg.id, error: "المحرك غير جاهز" });
        return;
      }

      const pcm = new Float32Array(msg.pcm);
      if (pcm.length < TARGET_SR * 0.4) {
        post({ type: "result", id: msg.id, text: "" });
        return;
      }

      const opts: Record<string, unknown> = {
        language: "arabic",
        task: "transcribe",
        return_timestamps: false,
        // Critical: stop Whisper chaining hallucinated context across windows
        condition_on_previous_text: false,
        // Mild no-speech filter
        no_speech_threshold: 0.5,
        compression_ratio_threshold: 2.4,
      };

      const prompt = (msg.initialPrompt || "").trim();
      if (prompt.length >= 2) {
        // Bias decoder toward expected Quran words (local, free)
        opts.initial_prompt = prompt.slice(0, 220);
      }

      const result = await pipelineFn(pcm, opts);
      const raw = Array.isArray(result) ? result[0]?.text : result?.text;
      const text = stripHallucinations(raw || "");
      post({ type: "result", id: msg.id, text });
      return;
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const id = msg.type === "infer" ? msg.id : undefined;
    post({ type: "error", id, error: error || "خطأ غير معروف في Worker" });
  }
};
