import { detectDevice } from "@/lib/device";
import { numbersAreVerified, violatesIntegrity } from "@/brain/integrity";

const SYSTEM = "You are a livestream character commenting on a token chart for entertainment. Never invent prices, trades, market cap, holder data, partnerships or events. Only use facts included in EVENT_CONTEXT. Never give financial advice or promise returns. Rewrite the DRAFT in the character's voice. Keep it under 22 words. Output only the line.";
const WEBLLM_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.79";

/** AITextEnhancer: browser-native AI -> WebLLM (capable devices, opt-in) -> template passthrough. */
class AITextEnhancer {
  constructor() {
    this.mode = "template";
    this.status = "off";
    this.progress = 0;
    this.listeners = new Set();
  }

  emit() {
    this.listeners.forEach((l) => l(this.info()));
  }

  info() {
    return { mode: this.mode, status: this.status, progress: this.progress, capability: this.capability() };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.info());
    return () => this.listeners.delete(fn);
  }

  capability() {
    const d = detectDevice();
    const nativeAI = typeof window !== "undefined" && !!window.LanguageModel;
    const webllmOk = d.webgpu && !d.mobile && (d.memory == null || d.memory >= 4);
    return { nativeAI, webllmOk, webgpu: d.webgpu, mobile: d.mobile, memory: d.memory };
  }

  async enable() {
    const cap = this.capability();
    try {
      if (cap.nativeAI) {
        this.status = "loading";
        this.emit();
        const avail = await window.LanguageModel.availability?.();
        if (avail && avail !== "unavailable") {
          this.session = await window.LanguageModel.create({ initialPrompts: [{ role: "system", content: SYSTEM }] });
          this.mode = "native";
          this.status = "ready";
          this.emit();
          return;
        }
      }
      if (!cap.webllmOk) {
        this.status = "unsupported";
        this.mode = "template";
        this.emit();
        return;
      }
      this.status = "loading";
      this.emit();
      const webllm = await import(/* webpackIgnore: true */ WEBLLM_URL);
      this.engine = await webllm.CreateMLCEngine(WEBLLM_MODEL, {
        initProgressCallback: (p) => { this.progress = p.progress || 0; this.emit(); },
      });
      this.mode = "webllm";
      this.status = "ready";
    } catch (e) {
      console.warn("AI enhancer unavailable", e);
      this.mode = "template";
      this.status = "error";
    }
    this.emit();
  }

  disable() {
    this.mode = "template";
    this.status = "off";
    this.emit();
  }

  /** LEVEL 3: optional rewrite. Always falls back to the verified draft. */
  async rewrite(line, profile, context) {
    if (this.mode === "template" || this.status !== "ready") return line;
    const prompt = `CHARACTER: ${profile?.characterName}, vibe ${profile?.vibe}, traits ${(profile?.traits || []).join(", ")}.\nEVENT_CONTEXT: ${JSON.stringify(context)}\nDRAFT: ${line.text}`;
    const run = async () => {
      if (this.mode === "native") return this.session.prompt(prompt);
      const r = await this.engine.chat.completions.create({
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], max_tokens: 48, temperature: 0.8,
      });
      return r.choices?.[0]?.message?.content || "";
    };
    try {
      const out = await Promise.race([run(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3500))]);
      const clean = String(out).replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0];
      if (!clean || clean.length > 180 || violatesIntegrity(clean) || !numbersAreVerified(clean, line.text)) return line;
      return { ...line, text: clean, speech: clean.replace(/\$/g, ""), source: this.mode };
    } catch (e) {
      return line;
    }
  }
}

export const aiEnhancer = new AITextEnhancer();
