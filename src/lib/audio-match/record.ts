/**
 * Short-clip mic capture for the audio-match spike (mobile-friendly).
 * One contiguous buffer — no ASR, no background inference.
 */

export type MicRecorder = {
  stop: () => Promise<Float32Array>;
  getSampleRate: () => number;
};

export async function startMicRecorder(): Promise<MicRecorder> {
  if (typeof window === "undefined") {
    throw new Error("المتصفح فقط");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("الميكروفون غير متاح");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
    video: false,
  });

  const W = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctx = W.AudioContext || W.webkitAudioContext;
  if (!Ctx) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("AudioContext غير مدعوم");
  }

  const ctx = new Ctx();
  if (ctx.state === "suspended") await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let total = 0;

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    chunks.push(copy);
    total += copy.length;
  };

  const silent = ctx.createGain();
  silent.gain.value = 0;
  source.connect(processor);
  processor.connect(silent);
  silent.connect(ctx.destination);

  return {
    getSampleRate: () => ctx.sampleRate || 48000,
    stop: async () => {
      try {
        processor.disconnect();
        source.disconnect();
        silent.disconnect();
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => t.stop());
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
      const out = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return out;
    },
  };
}
