/**
 * Web Speech API wrapper tuned for Quranic recitation.
 * - Explicit feature detection (desktop + mobile webviews)
 * - Mobile-safe mic lifecycle (no rapid start/stop beep loops)
 * - Auto-cleanup on page hide/navigation to prevent background mic leak
 * - interimResults + soft error handling
 * - continuous listening with debounced auto-restart (Madd/breath)
 */

export type SpeechHandlers = {
    onInterim?: (text: string) => void;
    onFinal?: (text: string) => void;
    onError?: (message: string) => void;
    onEnd?: () => void;
};

export type SpeechCapability = {
    supported: boolean;
    secureContext: boolean;
    hasCtor: boolean;
    mediaDevices: boolean;
    /** Short Arabic reason when not usable */
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

/** Mobile / tablet UA — needs gentler restart policy */
export function isMobileSpeechEnvironment(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return (
        /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
            ua
        ) ||
        (typeof window !== "undefined" &&
            "ontouchstart" in window &&
            (navigator.maxTouchPoints || 0) > 1)
    );
}

/**
 * Full browser capability check — call before starting mic sessions.
 * Safe on SSR (returns supported: false).
 */
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

    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isInApp =
        /\bwv\b|FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat/i.test(ua);
    if (isIOS && !Ctor) {
        return {
            supported: false,
            secureContext,
            hasCtor: false,
            mediaDevices,
            reasonAr:
                "iOS لا يدعم التعرّف على الصوت في هذا السياق. استخدم Chrome على Android أو جهاز كمبيوتر.",
        };
    }
    if (isInApp && !Ctor) {
        return {
            supported: false,
            secureContext,
            hasCtor: false,
            mediaDevices,
            reasonAr:
                "افتح حافظ في المتصفح الكامل (Chrome/Safari) — تطبيقات التواصل غالباً لا تدعم التعرّف على الصوت.",
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

/** Probe mic permission — should be called from a user gesture (button click). */
export async function requestMicrophonePermission(): Promise<{
    ok: boolean;
    error?: string;
}> {
    const cap = getSpeechCapability();
    if (!cap.supported) {
        return { ok: false, error: cap.reasonAr };
    }
    if (!cap.mediaDevices) {
        return {
            ok: false,
            error: "لا يمكن الوصول إلى الميكروفون على هذا الجهاز.",
        };
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });
        // Release tracks immediately — SpeechRecognition opens its own stream
        stream.getTracks().forEach((t) => t.stop());
        return { ok: true };
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

export class ArabicSpeechSession {
    private rec: BrowserSpeechRecognition | null = null;
    private handlers: SpeechHandlers = {};
    private finalBuffer = "";
    private running = false;
    /** When true, onend schedules a debounced restart */
    private wantContinue = false;
    private restartTimer: ReturnType<typeof setTimeout> | null = null;
    private interimThrottleTimer: ReturnType<typeof setTimeout> | null = null;
    private lastInterim = "";
    private lastStartAt = 0;
    private lastRestartAt = 0;
    private restartCount = 0;
    private sessionStartedAt = 0;
    private mobile = false;
    private starting = false;
    private boundVisibilityHandler: (() => void) | null = null;
    private boundPageHideHandler: (() => void) | null = null;

    /**
     * Start listening. Prefer calling from a click/tap handler (user gesture).
     * Optionally pass `primeMic: true` (default) to acquire permission first.
     */
    start(
        handlers: SpeechHandlers = {},
        opts?: { primeMic?: boolean }
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
            return {
                ok: false,
                error:
                    "التعرّف على الصوت غير مدعوم. استخدم Chrome مع إذن الميكروفون.",
            };
        }

        this.hardStop(false);
        this.handlers = handlers;
        this.finalBuffer = "";
        this.lastInterim = "";
        this.running = true;
        this.wantContinue = true;
        this.restartCount = 0;
        this.sessionStartedAt = Date.now();
        this.mobile = isMobileSpeechEnvironment();

        // Attach lifecycle listeners to close mic automatically when tab is hidden or closed
        this.attachLifecycleListeners();

        // Sync start for gesture preservation; mic prime is optional async path
        if (opts?.primeMic === false) {
            return this.boot(Ctor, false);
        }

        // Kick off recognition immediately (gesture), prime is best-effort parallel
        void requestMicrophonePermission().then((perm) => {
            if (!perm.ok && this.running) {
                if (perm.error) {
                    // Keep listening if start already succeeded
                }
            }
        });

        return this.boot(Ctor, false);
    }

    /**
     * Async start that awaits mic permission first (recommended on mobile).
     * Call from button onClick: await session.startAsync(handlers)
     */
    async startAsync(
        handlers: SpeechHandlers = {}
    ): Promise<{ ok: boolean; error?: string }> {
        const perm = await requestMicrophonePermission();
        if (!perm.ok) {
            return { ok: false, error: perm.error };
        }
        return this.start(handlers, { primeMic: false });
    }

    private attachLifecycleListeners() {
        this.detachLifecycleListeners();
        if (typeof window === "undefined") return;

        this.boundVisibilityHandler = () => {
            if (document.visibilityState === "hidden" && this.running) {
                this.stop();
            }
        };

        this.boundPageHideHandler = () => {
            if (this.running) {
                this.stop();
            }
        };

        window.addEventListener("visibilitychange", this.boundVisibilityHandler);
        window.addEventListener("pagehide", this.boundPageHideHandler);
        window.addEventListener("beforeunload", this.boundPageHideHandler);
    }

    private detachLifecycleListeners() {
        if (typeof window === "undefined") return;
        if (this.boundVisibilityHandler) {
            window.removeEventListener("visibilitychange", this.boundVisibilityHandler);
            this.boundVisibilityHandler = null;
        }
        if (this.boundPageHideHandler) {
            window.removeEventListener("pagehide", this.boundPageHideHandler);
            window.removeEventListener("beforeunload", this.boundPageHideHandler);
            this.boundPageHideHandler = null;
        }
    }

    private boot(
        Ctor: new () => BrowserSpeechRecognition,
        isRestart: boolean
    ): { ok: boolean; error?: string } {
        if (!this.wantContinue || !this.running) {
            return { ok: false, error: "session stopped" };
        }
        if (this.starting) {
            return { ok: true };
        }

        const now = Date.now();
        // Global rate limit — prevents rapid reconnection beeps on mobile
        const minGap = this.mobile ? 1000 : 300;
        if (isRestart && now - this.lastRestartAt < minGap) {
            this.scheduleRestart(minGap - (now - this.lastRestartAt));
            return { ok: true };
        }
        // Cap restarts per session (mobile browsers thrash after dozens of cycles)
        if (isRestart && this.mobile && this.restartCount > 80) {
            this.wantContinue = false;
            this.running = false;
            this.handlers.onError?.(
                "توقّف الاستماع مؤقتاً بعد فترة طويلة. اضغط «استئناف» للمتابعة."
            );
            this.handlers.onEnd?.();
            return { ok: false, error: "restart limit" };
        }

        this.starting = true;
        this.lastStartAt = now;
        if (isRestart) {
            this.lastRestartAt = now;
            this.restartCount += 1;
        }

        // Dispose previous instance cleanly without triggering restart storm
        if (this.rec) {
            try {
                this.rec.onresult = null;
                this.rec.onerror = null;
                this.rec.onend = null;
                this.rec.onstart = null;
                this.rec.abort();
            } catch {
                /* ignore */
            }
            this.rec = null;
        }

        const rec = new Ctor();
        this.rec = rec;
        rec.lang = "ar-SA";

        // Enable continuous mode across all devices so Chrome Android doesn't
        // constantly tear down and recreate mic sessions with notification chimes.
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = this.mobile ? 1 : 3;

        rec.onstart = () => {
            this.starting = false;
        };

        rec.onresult = (ev) => {
            let interim = "";
            let bestFinalChunk = "";
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                let best = ev.results[i][0]?.transcript || "";
                let bestConf = ev.results[i][0]?.confidence ?? 0;
                const alts = ev.results[i].length || 1;
                for (let a = 1; a < alts; a++) {
                    const conf = ev.results[i][a]?.confidence ?? 0;
                    if (conf > bestConf) {
                        bestConf = conf;
                        best = ev.results[i][a]?.transcript || best;
                    }
                }
                if (ev.results[i].isFinal) {
                    bestFinalChunk = (bestFinalChunk + " " + best).trim();
                } else {
                    interim += best;
                }
            }

            if (bestFinalChunk) {
                this.finalBuffer = mergeTranscript(this.finalBuffer, bestFinalChunk);
                this.handlers.onFinal?.(this.finalBuffer);
            }

            const live = mergeTranscript(this.finalBuffer, interim);
            if (!live || live === this.lastInterim) return;

            // Throttle interim UI updates on mobile to avoid main-thread freeze
            if (this.mobile) {
                this.lastInterim = live;
                if (this.interimThrottleTimer) return;
                this.interimThrottleTimer = setTimeout(() => {
                    this.interimThrottleTimer = null;
                    if (this.lastInterim) this.handlers.onInterim?.(this.lastInterim);
                }, 80);
            } else {
                this.lastInterim = live;
                this.handlers.onInterim?.(live);
            }
        };

        rec.onerror = (ev) => {
            const code = ev.error || "";
            if (
                code === "no-speech" ||
                code === "aborted" ||
                code === "aborted-error"
            ) {
                return;
            }

            const softMap: Record<string, string> = {
                "not-allowed":
                    "اسمح باستخدام الميكروفون من إعدادات المتصفح ثم أعد المحاولة.",
                "audio-capture":
                    "لا يوجد ميكروفون متاح أو هو مستخدم من تطبيق آخر.",
                network:
                    "تعذّر الاتصال بخدمة التعرّف على الصوت. تحقق من الشبكة ثم أعد المحاولة.",
                "service-not-allowed":
                    "خدمة التعرّف على الصوت غير مسموحة في هذا المتصفح.",
                "language-not-supported":
                    "اللغة العربية غير مدعومة في محرك التعرّف على هذا الجهاز.",
                "bad-grammar": "تعذّر ضبط محرك التعرّف. أعد المحاولة.",
            };

            if (
                code === "not-allowed" ||
                code === "service-not-allowed" ||
                code === "audio-capture" ||
                code === "language-not-supported"
            ) {
                this.wantContinue = false;
                this.running = false;
                this.starting = false;
                this.handlers.onError?.(
                    softMap[code] || "خطأ في التعرّف على الصوت. أعد المحاولة."
                );
                return;
            }

            if (code === "network") {
                this.handlers.onError?.(softMap.network);
                this.scheduleRestart(this.mobile ? 1200 : 600);
                return;
            }

            this.wantContinue = false;
            this.running = false;
            this.starting = false;
            this.handlers.onError?.(
                softMap[code] ||
                "خطأ في التعرّف على الصوت (" + code + "). أعد المحاولة."
            );
        };

        rec.onend = () => {
            this.starting = false;
            if (this.wantContinue && this.running) {
                const delay = this.mobile ? 1000 : 300;
                this.scheduleRestart(delay);
                return;
            }
            this.running = false;
            this.handlers.onEnd?.();
        };

        try {
            rec.start();
            return { ok: true };
        } catch (e) {
            this.starting = false;
            const msg = e instanceof Error ? e.message : "تعذّر بدء الميكروفون";
            if (/already started/i.test(msg)) {
                return { ok: true };
            }
            if (this.wantContinue && this.running) {
                this.scheduleRestart(this.mobile ? 1000 : 350);
                return { ok: true };
            }
            this.running = false;
            this.wantContinue = false;
            return { ok: false, error: msg };
        }
    }

    private scheduleRestart(delayMs: number) {
        if (!this.wantContinue || !this.running) return;
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            if (!this.wantContinue || !this.running) return;
            const Ctor = getSpeechRecognitionCtor();
            if (!Ctor) {
                this.running = false;
                this.wantContinue = false;
                this.handlers.onError?.(
                    "محرك التعرّف على الصوت لم يعد متاحاً. أعد تحميل الصفحة."
                );
                return;
            }
            this.boot(Ctor, true);
        }, Math.max(300, delayMs));
    }

    stop(): string {
        this.wantContinue = false;
        this.hardStop(true);
        return this.finalBuffer;
    }

    private hardStop(emitEnd: boolean) {
        this.detachLifecycleListeners();

        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        if (this.interimThrottleTimer) {
            clearTimeout(this.interimThrottleTimer);
            this.interimThrottleTimer = null;
        }
        this.starting = false;
        if (this.rec) {
            try {
                this.rec.onresult = null;
                this.rec.onerror = null;
                this.rec.onend = null;
                this.rec.onstart = null;
                try {
                    this.rec.abort();
                } catch {
                    this.rec.stop();
                }
            } catch {
                /* ignore */
            }
        }
        this.rec = null;
        this.running = false;
        if (emitEnd) this.handlers.onEnd?.();
    }

    isRunning() {
        return this.running;
    }

    getTranscript() {
        return this.finalBuffer;
    }
}

/** Append without duplicating trailing overlap (common with continuous ASR) */
function mergeTranscript(base: string, next: string): string {
    const a = (base || "").trim();
    const b = (next || "").trim();
    if (!b) return a;
    if (!a) return b;
    if (a.endsWith(b)) return a;
    if (b.startsWith(a)) return b;
    const max = Math.min(a.length, b.length, 40);
    for (let n = max; n >= 4; n--) {
        if (a.slice(-n) === b.slice(0, n)) {
            return (a + b.slice(n)).replace(/\s+/g, " ").trim();
        }
    }
    return (a + " " + b).replace(/\s+/g, " ").trim();
}