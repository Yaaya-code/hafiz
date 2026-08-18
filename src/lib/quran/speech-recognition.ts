/**
 * Web Speech API for Quran recitation — Chrome Android safe.
 *
 * Critical rules for mobile:
 * 1. Never open/close getUserMedia just to "prime" (causes notification chime).
 * 2. Prefer one continuous recognition session; restart only after a long pause.
 * 3. Always abort + clear handlers on stop so the mic indicator dies immediately.
 * 4. Preserve finalBuffer across soft network / no-speech glitches.
 */

export type SpeechHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  /** Fired when recognition fully ends and will NOT auto-resume */
  onEnd?: () => void;
  /** Optional: listening badge / mic active */
  onListeningChange?: (listening: boolean) => void;
};

export type SpeechCapability = {
  supported: boolean;
  secureContext: boolean;
  hasCtor: boolean;
  mediaDevices: boolean;
  reasonAr?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: {
      isFinal: boolean;
      length: number;
      [j: number]: { transcript: string; confidence: number };
    };
  };
};

function getSpeechRecognitionCtor():
  | (new () => BrowserSpeechRecognition)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * True only for real phones/tablets that need Whisper WASM continuous STT.
 * IMPORTANT: do NOT treat Windows/macOS touch laptops as mobile — that forced
 * desktop Chrome onto heavy Whisper and destroyed Web Speech performance.
 */
export function isMobileSpeechEnvironment(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  // Explicit mobile / tablet UA
  if (
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i.test(
      ua
    )
  ) {
    return true;
  }

  // iPadOS 13+ may report as Macintosh but is a tablet (touch, no fine pointer)
  if (
    typeof window !== "undefined" &&
    /Macintosh/i.test(ua) &&
    (navigator.maxTouchPoints || 0) > 1 &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  ) {
    return true;
  }

  return false;
}

export function getSpeechCapability(): SpeechCapability {
  if (typeof window === "undefined") {
    return {
      supported: false,
      secureContext: false,
      hasCtor: false,
      mediaDevices: false,
      reasonAr: "التعرّف على الصوت يعمل في المتصفح فقط.",
    };
  }

  const secureContext =
    window.isSecureContext ||
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

  const Ctor = getSpeechRecognitionCtor();
  const hasCtor = Boolean(Ctor);
  const mediaDevices = Boolean(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );

  if (!secureContext) {
    return {
      supported: false,
      secureContext,
      hasCtor,
      mediaDevices,
      reasonAr:
        "التعرّف على الصوت يحتاج اتصالاً آمناً (HTTPS) أو localhost.",
    };
  }

  if (!hasCtor) {
    return {
      supported: false,
      secureContext,
      hasCtor,
      mediaDevices,
      reasonAr:
        "متصفحك لا يدعم التعرّف على الصوت. جرّب Chrome على Android أو سطح المكتب.",
    };
  }

  return {
    supported: true,
    secureContext,
    hasCtor,
    mediaDevices,
  };
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechCapability().supported;
}

/**
 * Optional permission probe — keeps stream open briefly then stops.
 * Prefer NOT calling this right before SpeechRecognition.start() on mobile
 * (double stream open = double notification). SpeechRecognition requests mic itself.
 */
export async function requestMicrophonePermission(): Promise<{
  ok: boolean;
  error?: string;
  /** Caller must stop tracks if they use this stream */
  stream?: MediaStream;
  keepOpen?: boolean;
}> {
  const cap = getSpeechCapability();
  if (!cap.supported) return { ok: false, error: cap.reasonAr };
  if (!cap.mediaDevices) {
    return { ok: false, error: "لا يمكن الوصول إلى الميكروفون على هذا الجهاز." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return { ok: true, stream, keepOpen: true };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        ok: false,
        error:
          "تم رفض إذن الميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.",
      };
    }
    if (name === "NotFoundError") {
      return { ok: false, error: "لم يُعثر على ميكروفون متاح." };
    }
    return {
      ok: false,
      error: "تعذّر تفعيل الميكروفون. تحقق من الأذونات والجهاز.",
    };
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

export class ArabicSpeechSession {
  private rec: BrowserSpeechRecognition | null = null;
  private handlers: SpeechHandlers = {};
  private finalBuffer = "";
  private running = false;
  /** User wants session alive — only long-pause soft resume may restart */
  private wantContinue = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private interimTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingInterim = "";
  private lastResultAt = 0;
  private lastStartAt = 0;
  private mobile = false;
  private destroyed = false;
  /**
   * MediaStream Audio Lock: keep getUserMedia tracks LIVE for the whole
   * session so Android does not beep on SpeechRecognition restart.
   */
  private heldStream: MediaStream | null = null;
  private silentCtx: AudioContext | null = null;
  private softResumeEnabled = false;
  /**
   * When true: onend auto-restarts SR while wantContinue + mic lock held.
   */
  private continuousAutoResume = false;

  /**
   * Open / keep a live getUserMedia stream (hardware lock).
   * Must be called from a user gesture on first open.
   */
  async lockMicrophone(): Promise<{ ok: boolean; error?: string }> {
    if (
      this.heldStream &&
      this.heldStream.getTracks().some((t) => t.readyState === "live")
    ) {
      return { ok: true };
    }
    // Replace dead stream
    if (this.heldStream) {
      this.releaseMicLockOnly();
    }
    const perm = await requestMicrophonePermission();
    if (!perm.ok || !perm.stream) {
      return { ok: false, error: perm.error || "تعذّر فتح الميكروفون" };
    }
    this.heldStream = perm.stream;
    this.attachSilentKeepAlive(perm.stream);
    return { ok: true };
  }

  /** Keep AudioContext graph so the track is not suspended by the OS */
  private attachSilentKeepAlive(stream: MediaStream) {
    this.releaseSilentKeepAlive();
    try {
      const W = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctx = W.AudioContext || W.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(ctx.destination);
      void ctx.resume();
      this.silentCtx = ctx;
    } catch {
      /* optional polyfill path */
    }
  }

  private releaseSilentKeepAlive() {
    try {
      void this.silentCtx?.close();
    } catch {
      /* ignore */
    }
    this.silentCtx = null;
  }

  private releaseMicLockOnly() {
    this.releaseSilentKeepAlive();
    stopMediaStream(this.heldStream);
    this.heldStream = null;
  }

  /**
   * Start recognition. Prefer await lockMicrophone() first for continuous mobile.
   * Call from a user gesture (button click).
   */
  start(
    handlers: SpeechHandlers = {},
    opts?: {
      allowSoftResume?: boolean;
      continuousAutoResume?: boolean;
      holdStream?: MediaStream | null;
      /** Keep accumulated finalBuffer (continue after mic silence) */
      preserveBuffer?: boolean;
      /** Keep existing mic lock across this start (default true for continuous) */
      keepMicLock?: boolean;
    }
  ): { ok: boolean; error?: string } {
    const cap = getSpeechCapability();
    if (!cap.supported) {
      return {
        ok: false,
        error:
          cap.reasonAr ||
          "التعرّف على الصوت غير مدعوم. استخدم Chrome مع إذن الميكروفون.",
      };
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      return { ok: false, error: "التعرّف على الصوت غير مدعوم." };
    }

    // Only tear down SpeechRecognition — NEVER kill mic lock mid-session
    this.destroyRecognitionOnly();

    const keepLock =
      opts?.keepMicLock === true ||
      opts?.continuousAutoResume === true ||
      opts?.preserveBuffer === true;

    if (!keepLock && this.heldStream && !opts?.holdStream) {
      this.releaseMicLockOnly();
    }

    this.destroyed = false;
    this.handlers = handlers;
    if (!opts?.preserveBuffer) {
      this.finalBuffer = "";
    }
    this.pendingInterim = "";
    this.running = true;
    this.wantContinue = true;
    this.mobile = isMobileSpeechEnvironment();
    this.continuousAutoResume = opts?.continuousAutoResume === true;
    this.softResumeEnabled =
      this.continuousAutoResume ||
      (opts?.allowSoftResume === true
        ? true
        : !this.mobile && opts?.allowSoftResume !== false);

    if (opts?.holdStream) {
      if (this.heldStream && this.heldStream !== opts.holdStream) {
        this.releaseMicLockOnly();
      }
      this.heldStream = opts.holdStream;
      this.attachSilentKeepAlive(opts.holdStream);
    }

    return this.attachAndStart(Ctor);
  }

  /**
   * Async start with MediaStream Audio Lock (recommended for mobile continuous).
   */
  async startWithMicLock(
    handlers: SpeechHandlers = {},
    opts?: {
      continuousAutoResume?: boolean;
      preserveBuffer?: boolean;
    }
  ): Promise<{ ok: boolean; error?: string }> {
    const lock = await this.lockMicrophone();
    if (!lock.ok) return lock;
    return this.start(handlers, {
      continuousAutoResume: opts?.continuousAutoResume !== false,
      preserveBuffer: opts?.preserveBuffer,
      keepMicLock: true,
      holdStream: this.heldStream,
    });
  }

  /** Soft SR restart — keeps MediaStream lock + finalBuffer */
  private softRestart(): { ok: boolean; error?: string } {
    if (this.destroyed || !this.wantContinue) {
      return { ok: false, error: "stopped" };
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return { ok: false, error: "no ctor" };
    // Critical: destroyRecognitionOnly only — heldStream stays LIVE (no beep)
    this.destroyRecognitionOnly();
    this.running = true;
    return this.attachAndStart(Ctor);
  }

  private attachAndStart(
    Ctor: new () => BrowserSpeechRecognition
  ): { ok: boolean; error?: string } {
    const now = Date.now();
    // Min gap between starts — shorter when continuous auto-resume (keep stream alive)
    const minGap = this.continuousAutoResume
      ? this.mobile
        ? 350
        : 200
      : this.mobile
        ? 2500
        : 800;
    if (now - this.lastStartAt < minGap) {
      // Schedule a real retry if continuous mode still wants the mic
      if (this.continuousAutoResume && this.wantContinue && !this.destroyed) {
        this.scheduleSoftResume(minGap - (now - this.lastStartAt) + 50);
      }
      return { ok: true };
    }
    this.lastStartAt = now;

    const rec = new Ctor();
    this.rec = rec;
    rec.lang = "ar-SA";
    /**
     * continuous:true keeps ONE browser session longer.
     * We do NOT chain start() on every silence on mobile.
     */
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.handlers.onListeningChange?.(true);
    };

    rec.onspeechstart = () => {
      this.lastResultAt = Date.now();
    };

    rec.onresult = (ev) => {
      this.lastResultAt = Date.now();
      let interim = "";
      let finalChunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const text = ev.results[i][0]?.transcript || "";
        if (ev.results[i].isFinal) {
          finalChunk = (finalChunk + " " + text).trim();
        } else {
          interim += text;
        }
      }
      if (finalChunk) {
        // Never wipe buffer on partial successes
        this.finalBuffer = mergeTranscript(this.finalBuffer, finalChunk);
        this.handlers.onFinal?.(this.finalBuffer);
      }
      const live = mergeTranscript(this.finalBuffer, interim);
      if (!live) return;

      // Fast interim so UI paints word-by-word with the voice (mobile + desktop)
      if (this.mobile) {
        this.pendingInterim = live;
        if (this.interimTimer) return;
        this.interimTimer = setTimeout(() => {
          this.interimTimer = null;
          if (this.pendingInterim) {
            this.handlers.onInterim?.(this.pendingInterim);
          }
        }, 40);
      } else {
        this.handlers.onInterim?.(live);
      }
    };

    rec.onerror = (ev) => {
      const code = ev.error || "";
      // Soft: keep buffer, do not tear down stream aggressively
      if (code === "no-speech" || code === "aborted") {
        return;
      }
      if (code === "network") {
        // Keep finalBuffer — do not clear, do not restart loop
        this.handlers.onError?.(
          "تعثّر الاتصال بخدمة التعرّف مؤقتاً. تابع القراءة — النص السابق محفوظ."
        );
        return;
      }
      if (code === "not-allowed" || code === "service-not-allowed") {
        this.wantContinue = false;
        this.running = false;
        this.handlers.onListeningChange?.(false);
        this.handlers.onError?.(
          "اسمح باستخدام الميكروفون من إعدادات المتصفح ثم أعد المحاولة."
        );
        return;
      }
      if (code === "audio-capture") {
        this.wantContinue = false;
        this.running = false;
        this.handlers.onListeningChange?.(false);
        this.handlers.onError?.(
          "لا يوجد ميكروفون متاح أو هو مستخدم من تطبيق آخر."
        );
        return;
      }
      // Unknown: stop cleanly once
      this.wantContinue = false;
      this.running = false;
      this.handlers.onListeningChange?.(false);
      this.handlers.onError?.(
        "توقّف الاستماع. اضغط «استئناف» للمتابعة."
      );
    };

    rec.onend = () => {
      this.handlers.onListeningChange?.(false);
      if (!this.wantContinue || this.destroyed) {
        this.running = false;
        this.handlers.onEnd?.();
        return;
      }

      // Continuous auto-resume: browser closed session (silence) but user did not stop
      if (this.continuousAutoResume) {
        this.running = true;
        // Keep UI "listening" — silent restart, preserve buffer
        this.scheduleSoftResume(this.mobile ? 280 : 150);
        return;
      }

      // Legacy soft resume (desktop only path)
      if (!this.softResumeEnabled || this.mobile) {
        this.running = false;
        this.handlers.onEnd?.();
        return;
      }

      const silenceMs = Date.now() - (this.lastResultAt || this.lastStartAt);
      if (silenceMs < 2000) {
        this.scheduleSoftResume(2500);
        return;
      }
      this.scheduleSoftResume(1800);
    };

    try {
      rec.start();
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/already started/i.test(msg)) return { ok: true };
      this.running = false;
      this.wantContinue = false;
      this.handlers.onListeningChange?.(false);
      return {
        ok: false,
        error: msg || "تعذّر بدء الميكروفون.",
      };
    }
  }

  private scheduleSoftResume(delayMs: number) {
    if (!this.wantContinue || this.destroyed) return;
    // Mobile allowed only with continuousAutoResume
    if (this.mobile && !this.continuousAutoResume) return;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.wantContinue || this.destroyed) return;
      if (this.mobile && !this.continuousAutoResume) return;
      // Soft restart — buffer preserved
      this.softRestart();
    }, Math.max(50, delayMs));
  }

  /** Explicit resume after Chrome ended the session (button) — preserves buffer + mic lock */
  resume(): { ok: boolean; error?: string } {
    if (this.destroyed) {
      return { ok: false, error: "session destroyed" };
    }
    this.wantContinue = true;
    this.running = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return { ok: false, error: "غير مدعوم" };
    this.destroyRecognitionOnly();
    return this.attachAndStart(Ctor);
  }

  /**
   * Pause SR only — keeps MediaStream lock so resume has no hardware beep.
   */
  pauseRecognition(): string {
    this.wantContinue = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.interimTimer) {
      clearTimeout(this.interimTimer);
      this.interimTimer = null;
    }
    this.destroyRecognitionOnly();
    this.running = false;
    this.handlers.onListeningChange?.(false);
    return this.finalBuffer;
  }

  stop(): string {
    this.wantContinue = false;
    this.hardStop(false);
    return this.finalBuffer;
  }

  /** Full teardown — recognition + MediaStream Audio Lock */
  hardStop(emitEnd: boolean) {
    this.wantContinue = false;
    this.continuousAutoResume = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.interimTimer) {
      clearTimeout(this.interimTimer);
      this.interimTimer = null;
    }
    this.destroyRecognitionOnly();
    this.releaseMicLockOnly();
    this.running = false;
    this.handlers.onListeningChange?.(false);
    if (emitEnd) this.handlers.onEnd?.();
  }

  private destroyRecognitionOnly() {
    if (this.rec) {
      const r = this.rec;
      try {
        r.onresult = null;
        r.onerror = null;
        r.onend = null;
        r.onstart = null;
        r.onspeechstart = null;
        r.onspeechend = null;
      } catch {
        /* ignore */
      }
      try {
        r.abort();
      } catch {
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      }
      this.rec = null;
    }
  }

  /** Call from useEffect cleanup / pagehide / navigation */
  dispose() {
    this.destroyed = true;
    this.wantContinue = false;
    this.hardStop(false);
    this.handlers = {};
  }

  isRunning() {
    return this.running;
  }

  getTranscript() {
    return this.finalBuffer;
  }

  /** Attach external MediaRecorder stream for ownership until stop */
  attachHeldStream(stream: MediaStream | null) {
    if (this.heldStream && this.heldStream !== stream) {
      this.releaseMicLockOnly();
    }
    this.heldStream = stream;
    if (stream) this.attachSilentKeepAlive(stream);
  }

  isMicLocked(): boolean {
    return Boolean(
      this.heldStream?.getTracks().some((t) => t.readyState === "live")
    );
  }
}

function mergeTranscript(base: string, next: string): string {
  const a = (base || "").trim();
  const b = (next || "").trim();
  if (!b) return a;
  if (!a) return b;
  if (a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;
  const max = Math.min(a.length, b.length, 48);
  for (let n = max; n >= 3; n--) {
    if (a.slice(-n) === b.slice(0, n)) {
      return (a + b.slice(n)).replace(/\s+/g, " ").trim();
    }
  }
  return (a + " " + b).replace(/\s+/g, " ").trim();
}
