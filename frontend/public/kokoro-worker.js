import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

let tts = null;
let loading = null;

self.onmessage = async (e) => {
  const { type, id, text, voice } = e.data;
  try {
    if (type === "init") {
      if (!loading) {
        loading = KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
          dtype: "q8",
          device: "wasm",
          progress_callback: (p) => {
            if (p.status === "progress" && p.total) self.postMessage({ type: "progress", file: p.file, progress: p.loaded / p.total });
          },
        }).then((m) => (tts = m));
      }
      await loading;
      self.postMessage({ type: "ready" });
    } else if (type === "speak") {
      if (!tts) await loading;
      const audio = await tts.generate(text, { voice: voice || "am_onyx" });
      const pcm = audio.audio;
      self.postMessage({ type: "audio", id, pcm, sr: audio.sampling_rate }, [pcm.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: "error", id, message: String(err && err.message ? err.message : err) });
  }
};
