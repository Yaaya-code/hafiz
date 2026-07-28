/**
 * Web Speech API wrapper tuned for Quranic recitation.
 * - Single-session listening (No aggressive auto-restart loop)
 * - Safe manual control without continuous notification chime storms
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

function getSpeechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as {
        SpeechRecognition?: new () => BrowserSpeechRecognition;
        webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isMobileSpeechEnvironment(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return (
        /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
        (typeof window !== "undefined" &&
            "ontouchstart" in window &&
            (navigator.maxTouchPoints || 0) > 1)
    );
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
    const mediaDevices = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    if (!secureContext) {
        return {
            supported: false,
            secureContext,
            hasCtor,
            mediaDevices,
            reasonAr: "التعرّف على الصوت يحتاج اتصالاً آمناً (HTTPS) أو localhost.",
        };
    }

    if (!hasCtor) {
        return {
            supported: false,
            secureContext,
            hasCtor,
            mediaDevices,
            reasonAr: "متصفحك لا يدعم التعرّف على الصوت. جرّب Chrome على Android أو سطح المكتب.",
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

export async function requestMicrophonePermission(): Promise<{ ok: boolean; error?: string }> {
    const cap = getSpeechCapability();
    if (!cap.supported) return { ok: false, error: cap.reasonAr };
    if (!cap.mediaDevices) return { ok: false, error: "لا يمكن الوصول إلى الميكروفون." };

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
        });
        stream.getTracks().forEach((t) => t.stop());
        return { ok: true };
    } catch {
        return { ok: false, error: "تم رفض إذن الميكروفون." };
    }
}

export class ArabicSpeechSession {
    private rec: BrowserSpeechRecognition | null = null;
    private handlers: SpeechHandlers = {};
    private finalBuffer = "";
    private running = false;

    start(handlers: SpeechHandlers = {}): { ok: boolean; error?: string } {
        const Ctor = getSpeechRecognitionCtor();
        if (!Ctor) {
            return { ok: false, error: "التعرّف على الصوت غير مدعوم." };
        }

        this.hardStop();
        this.handlers = handlers;
        this.finalBuffer = "";
        this.running = true;

        const rec = new Ctor();
        this.rec = rec;
        rec.lang = "ar-SA";
        rec.continuous = true;
        rec.interimResults = true;

        rec.onresult = (ev) => {
            let interim = "";
            let bestFinalChunk = "";

            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const best = ev.results[i][0]?.transcript || "";
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
            if (live) {
                this.handlers.onInterim?.(live);
            }
        };

        rec.onerror = (ev) => {
            const code = ev.error || "";
            if (code === "no-speech" || code === "aborted") return;
            
            this.running = false;
            this.handlers.onError?.("توقف الاستماع. إما بسبب انقطاع الصوت أو خطأ في الشبكة.");
        };

        // عند انتهاء الجلسة، لا نعمـل إعادة تشغيل تلقائية لتجنب اللوب والنغمات!
        rec.onend = () => {
            this.running = false;
            this.handlers.onEnd?.();
        };

        try {
            rec.start();
            return { ok: true };
        } catch  {
            this.running = false;
            return { ok: false, error: "تعذّر بدء الميكروفون." };
        }
    }

    stop(): string {
        this.hardStop();
        return this.finalBuffer;
    }

    private hardStop() {
        if (this.rec) {
            try {
                this.rec.onresult = null;
                this.rec.onerror = null;
                this.rec.onend = null;
                this.rec.stop();
            } catch {
                /* ignore */
            }
        }
        this.rec = null;
        this.running = false;
    }

    isRunning() {
        return this.running;
    }

    getTranscript() {
        return this.finalBuffer;
    }
}

function mergeTranscript(base: string, next: string): string {
    const a = (base || "").trim();
    const b = (next || "").trim();
    if (!b) return a;
    if (!a) return b;
    if (a.endsWith(b)) return a;
    if (b.startsWith(a)) return b;
    return (a + " " + b).replace(/\s+/g, " ").trim();
}