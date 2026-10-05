export const KOKORO_VOICES = [
  "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
];

/** Client-side Kokoro TTS (web worker) + Web Audio playback with an AnalyserNode for lip sync. */
class VoiceEngine {
  constructor() {
    this.status = "idle";
    this.progress = 0;
    this.listeners = new Set();
    this.pending = new Map();
    this.seq = 0;
    this.mouth = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.energy = 0;
  }

  info() {
    return { status: this.status, progress: this.progress, unlocked: !!this.ctx };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.info());
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((l) => l(this.info()));
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.35;
      this.gain = this.ctx.createGain();
      this.analyser.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      this.td = new Float32Array(this.analyser.fftSize);
      this.fd = new Uint8Array(this.analyser.frequencyBinCount);
    }
    this.ctx.resume?.();
    this.emit();
    return true;
  }

  init() {
    if (this.readyP) return this.readyP;
    this.status = "loading";
    this.emit();
    this.readyP = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker("/kokoro-worker.js", { type: "module" });
      } catch (e) {
        this.status = "error";
        this.emit();
        reject(e);
        return;
      }
      const files = {};
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "progress") {
          files[m.file] = m.progress;
          const vals = Object.values(files);
          this.progress = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
          this.emit();
        } else if (m.type === "ready") {
          this.status = "ready";
          this.progress = 1;
          this.emit();
          resolve();
        } else if (m.type === "audio") {
          this.pending.get(m.id)?.resolve(m);
          this.pending.delete(m.id);
        } else if (m.type === "error") {
          if (m.id != null) {
            this.pending.get(m.id)?.reject(new Error(m.message));
            this.pending.delete(m.id);
          } else {
            this.status = "error";
            this.emit();
            reject(new Error(m.message));
          }
        }
      };
      this.worker.onerror = (e) => {
        this.status = "error";
        this.emit();
        reject(e);
      };
      this.worker.postMessage({ type: "init" });
    });
    this.readyP.catch(() => {});
    return this.readyP;
  }

  markUnavailable() {
    this.status = "error";
    this.emit();
  }

  synth(text, voice, timeoutMs = 30000) {
    if (this.status !== "ready") return Promise.reject(new Error("voice not ready"));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "speak", id, text, voice });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("tts timeout"));
        }
      }, timeoutMs);
    });
  }

  play({ pcm, sr }) {
    if (!this.ctx) return Promise.reject(new Error("audio locked"));
    const buf = this.ctx.createBuffer(1, pcm.length, sr);
    buf.copyToChannel(pcm, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    this.current = src;
    return new Promise((resolve) => {
      src.onended = () => {
        if (this.current === src) this.current = null;
        resolve();
      };
      src.start();
    });
  }

  stop() {
    try {
      this.current?.stop();
    } catch (e) {
      /* already stopped */
    }
    this.current = null;
  }

  setMuted(m) {
    if (this.gain) this.gain.gain.value = m ? 0 : 1;
  }

  /** Audio energy -> smoothed viseme weights. */
  readMouth() {
    if (!this.current || !this.analyser) {
      this.energy *= 0.8;
      return null;
    }
    this.analyser.getFloatTimeDomainData(this.td);
    let s = 0;
    for (let i = 0; i < this.td.length; i++) s += this.td[i] * this.td[i];
    const rms = Math.sqrt(s / this.td.length);
    const target = Math.min(1, Math.max(0, (rms - 0.008) * 7));
    this.energy += (target - this.energy) * (target > this.energy ? 0.6 : 0.25);
    this.analyser.getByteFrequencyData(this.fd);
    const hz = this.ctx.sampleRate / this.analyser.fftSize;
    const band = (a, b) => {
      let t = 0;
      const i0 = Math.floor(a / hz);
      const i1 = Math.floor(b / hz);
      for (let i = i0; i < i1; i++) t += this.fd[i];
      return t / Math.max(1, i1 - i0) / 255;
    };
    const low = band(150, 900);
    const mid = band(900, 2200);
    const high = band(2200, 5000);
    const tot = low + mid + high + 1e-4;
    const e = this.energy;
    return {
      aa: e * (0.55 + 0.45 * (mid / tot)),
      oh: e * 0.5 * (low / tot),
      ou: e * 0.35 * Math.max(0, low / tot - 0.45),
      ee: e * 0.6 * (high / tot),
      ih: e * 0.4 * (high / tot),
      energy: e,
    };
  }
}

export const voiceEngine = new VoiceEngine();
