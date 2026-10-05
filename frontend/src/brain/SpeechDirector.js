import { DialogueEngine } from "@/brain/dialogueEngine";
import { aiEnhancer } from "@/brain/aiEnhancer";
import { voiceEngine } from "@/voice/VoiceEngine";
import { api } from "@/lib/api";

const LOW_WINDOW_MS = 2600;
const HIGH_MERGE_MS = 380;

/** EventAggregator: collapses bursts of small trades into one structured AGG event. */
export function aggregate(events) {
  const buys = events.filter((e) => e.type === "BUY");
  const sells = events.filter((e) => e.type === "SELL");
  const sol = (arr) => arr.reduce((a, e) => a + (e.data?.sol || 0), 0);
  const first = events[0];
  const last = events[events.length - 1];
  const before = first.data?.mcapBefore;
  const after = last.data?.mcapAfter;
  const category = !sells.length ? "aggBuy" : !buys.length ? "aggSell" : "aggMixed";
  return {
    type: "AGG",
    category,
    priority: 2,
    timestamp: last.timestamp,
    marketCap: last.marketCap,
    data: {
      count: events.length,
      seconds: Math.max(1, last.timestamp - first.timestamp),
      totalSol: Math.round((sol(buys) + sol(sells)) * 1000) / 1000,
      mcapChangePct: before && after ? Math.round((after / before - 1) * 1000) / 10 : 0,
      nb: buys.length,
      ns: sells.length,
      net: Math.round((sol(buys) - sol(sells)) * 1000) / 1000,
    },
  };
}

/** SpeechDirector: priority queue, aggregation, idle banter, never-overlapping speech. */
export class SpeechDirector {
  constructor() {
    this.dialogue = new DialogueEngine();
    this.queue = [];
    this.low = [];
    this.high = [];
    this.busy = false;
    this.speaking = false;
    this.emotion = "IDLE";
    this.status = "LISTENING";
    this.handlers = {};
    this.getContext = () => ({});
    this.muted = false;
    this.synthetic = null;
    this.current = null;
    this.brain = "cloud";
    this.recentTexts = [];
  }

  setHandlers(h) {
    this.handlers = h;
  }

  start() {
    this.stopped = false;
    this.scheduleIdle(9000 + Math.random() * 6000);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.idleT);
    clearTimeout(this.lowT);
    clearTimeout(this.highT);
    clearTimeout(this.emoT);
    voiceEngine.stop();
  }

  setStatus(s) {
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  setEmotion(e, holdMs) {
    this.emotion = e;
    this.handlers.onEmotion?.(e);
    clearTimeout(this.emoT);
    if (holdMs) this.emoT = setTimeout(() => this.setEmotion("IDLE"), holdMs);
  }

  handleEvent(ev) {
    if (this.stopped) return;
    if (ev.priority >= 3) {
      if (ev.type === "BUY_STREAK" || ev.type === "SELL_STREAK") this.low = [];
      this.high.push(ev);
      if (!this.highT) this.highT = setTimeout(() => this.flushHigh(), HIGH_MERGE_MS);
    } else if (ev.priority >= 1) {
      this.low.push(ev);
      if (this.low.length >= 6) this.flushLow();
      else if (!this.lowT) this.lowT = setTimeout(() => this.flushLow(), LOW_WINDOW_MS);
    } else if (!this.busy && !this.queue.length) {
      this.enqueue(this.compose(ev), 0);
    }
  }

  compose(event, category) {
    const { profile, state, memory } = this.getContext();
    const line = this.dialogue.compose({ profile, event, state, memory, category });
    return line && { ...line, event };
  }

  flushLow() {
    clearTimeout(this.lowT);
    this.lowT = null;
    const evs = this.low;
    this.low = [];
    if (!evs.length) return;
    if (evs.length === 1) {
      if (this.busy || this.queue.length) return;
      this.enqueue(this.compose(evs[0]), 1);
      return;
    }
    const agg = aggregate(evs);
    if (this.queue.some((q) => q.priority >= 2) && this.busy) return;
    this.queue = this.queue.filter((q) => q.priority >= 2);
    this.enqueue(this.compose(agg, agg.category), 2);
  }

  flushHigh() {
    clearTimeout(this.highT);
    this.highT = null;
    const evs = this.high.sort((a, b) => b.priority - a.priority);
    this.high = [];
    if (!evs.length) return;
    const primary = this.compose(evs[0]);
    if (!primary) return;
    const second = evs.find((e, i) => i > 0 && e.priority >= 4 && e.type !== evs[0].type);
    if (second) {
      const s = this.compose(second);
      if (s && primary.text.length + s.text.length < 150) {
        primary.text += " " + s.text;
        primary.speech += " " + s.speech;
        primary.secondary = second.type;
      }
    }
    this.queue = this.queue.filter((q) => q.priority >= 3);
    if (this.current && this.current.priority === 0) {
      this.interrupted = true;
      voiceEngine.stop();
    }
    this.enqueue(primary, evs[0].priority);
  }

  say(text, emotion = "SPEAKING") {
    this.enqueue({ text, speech: text, emotion, category: "custom", source: "manual", event: { type: "CUSTOM" } }, 5);
  }

  enqueue(line, priority) {
    if (!line) return;
    this.queue.push({ ...line, priority, at: Date.now() });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.queue = this.queue.slice(0, 3);
    this.process();
  }

  scheduleIdle(ms) {
    clearTimeout(this.idleT);
    this.idleT = setTimeout(() => {
      if (this.stopped) return;
      if (!this.busy && !this.queue.length) this.enqueue(this.compose({ type: "QUIET_MARKET", data: {} }, "quiet"), 0);
      else this.scheduleIdle(5000);
    }, ms ?? 15000 + Math.random() * 20000);
  }

  async process() {
    if (this.busy || this.stopped) return;
    const item = this.queue.shift();
    if (!item) return;
    if (item.priority < 3 && Date.now() - item.at > 12000) return this.process();
    this.busy = true;
    this.current = item;
    clearTimeout(this.idleT);
    this.setStatus("THINKING");
    const { profile, state, memory, mint } = this.getContext();
    let line = item;
    const facts = Object.fromEntries(Object.entries(item.facts || {}).map(([k, v]) => [k, v.display]));
    if (this.brain === "cloud" && mint && item.source === "template") {
      const r = await api.brain({
        mint, eventId: item.event?.id || `${item.event?.type}-${item.at}`, priority: item.priority, draft: item.text,
        context: { event: item.event?.type, category: item.category, facts, marketCap: state?.marketCap, athMarketCap: memory?.athMarketCap, minutesSinceLaunch: memory?.minutesSinceLaunch },
        profile: { characterName: profile?.characterName, vibe: profile?.vibe, traits: profile?.traits, ticker: profile?.ticker },
        recent: this.recentTexts,
      }).catch(() => null);
      if (r?.source && r.source !== "template") line = { ...item, text: r.text, speech: r.text.replace(/\$/g, ""), source: r.source };
    } else if (this.brain === "local" && aiEnhancer.status === "ready") {
      line = await aiEnhancer.rewrite(item, profile, {
        event: item.event?.type, facts: Object.fromEntries(Object.entries(item.facts || {}).map(([k, v]) => [k, v.display])),
        marketCap: state?.marketCap, ath: memory?.athMarketCap,
      });
    }
    const canVoice = voiceEngine.ctx && voiceEngine.status === "ready" && !this.muted;
    const chunks = (line.speech.match(/[^.!?]+[.!?]*/g) || [line.speech]).map((c) => c.trim()).filter(Boolean).slice(0, 4);
    let audio = null;
    if (canVoice) {
      audio = await voiceEngine.synth(chunks[0], profile?.voice, this.voicedOnce ? 12000 : 25000).catch(() => null);
      if (!audio) this.voiceFailures = (this.voiceFailures || 0) + 1;
      else {
        this.voiceFailures = 0;
        this.voicedOnce = true;
      }
      if (this.voiceFailures >= 3) voiceEngine.markUnavailable();
    }
    if (this.stopped) return;
    this.setEmotion(line.emotion);
    this.recentTexts = [line.text, ...this.recentTexts].slice(0, 6);
    this.handlers.onLine?.({ ...line, ts: Date.now(), voiced: !!audio });
    this.speaking = true;
    this.setStatus("SPEAKING");
    if (audio) {
      // Pipeline: synthesize the next sentence while the current one plays.
      for (let i = 0; audio; i++) {
        const next = i + 1 < chunks.length ? voiceEngine.synth(chunks[i + 1], profile?.voice, 15000).catch(() => null) : null;
        await voiceEngine.play(audio).catch(() => {});
        if (this.stopped || !next || this.interrupted) break;
        audio = await next;
      }
      this.interrupted = false;
    } else {
      const words = line.text.split(/\s+/).length;
      const dur = Math.max(1600, words * 340);
      this.synthetic = { start: performance.now(), dur };
      await new Promise((r) => setTimeout(r, dur));
      this.synthetic = null;
    }
    this.speaking = false;
    this.current = null;
    this.setStatus("LISTENING");
    this.setEmotion(line.emotion, 2600);
    this.handlers.onLineEnd?.();
    this.busy = false;
    this.scheduleIdle();
    setTimeout(() => this.process(), 450);
  }

  /** Per-frame driver for the 3D stage. */
  frame() {
    let mouth = voiceEngine.readMouth();
    if (!mouth && this.synthetic) {
      const t = (performance.now() - this.synthetic.start) / 1000;
      const env = Math.min(1, t * 6) * Math.min(1, (this.synthetic.dur / 1000 - t) * 6);
      const syl = Math.abs(Math.sin(t * 10.5)) * (0.55 + 0.45 * Math.sin(t * 3.3 + 1));
      const e = Math.max(0, env * syl);
      mouth = { aa: e * 0.7, oh: e * 0.2 * Math.abs(Math.sin(t * 2.1)), ee: e * 0.2 * Math.abs(Math.cos(t * 2.7)), ih: 0, ou: 0, energy: e };
    }
    return { emotion: this.emotion, speaking: this.speaking, mouth, energy: mouth?.energy || 0 };
  }
}
