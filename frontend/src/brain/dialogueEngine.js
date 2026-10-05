import { EMOTION, EMOTION_OVERRIDES, EVENT_CATEGORY, GENERIC, MEMORY_CALLBACKS, PERSONALITY } from "@/brain/lines";
import { fmtPct, fmtSol, fmtUsd, spokenMinutes, spokenSol, spokenUsd } from "@/lib/format";

const v = (display, spoken = display) => ({ display, spoken });
const pctV = (p) => v(fmtPct(p), `${p >= 0 ? "plus" : "minus"} ${Math.abs(Math.round(p))} percent`);
const ddV = (p) => v(`${Math.round(p)}%`, `${Math.round(p)} percent`);
const usdV = (x) => (x ? v(fmtUsd(x), spokenUsd(x)) : null);
const solV = (x) => (x != null ? v(fmtSol(x), spokenSol(x)) : null);

/** Build placeholder values strictly from verified facts. Missing facts => template is skipped. */
export function buildFacts(event, state, memory, profile) {
  const d = event?.data || {};
  const f = {
    ticker: v(`$${profile?.ticker || "TOKEN"}`, profile?.ticker || "token"),
    name: v(profile?.characterName || "I"),
    mcap: usdV(event?.marketCap ?? state?.marketCap),
    ath: usdV(memory?.athMarketCap ?? state?.athMarketCap),
    launch: usdV(memory?.launchMarketCap),
  };
  if (d.sol != null) f.sol = solV(d.sol);
  if (d.count) f.n = v(String(d.count));
  if (d.seconds != null) f.sec = v(String(Math.max(1, Math.round(d.seconds))));
  if (d.totalSol != null) f.total = solV(d.totalSol);
  if (d.mcapChangePct != null) f.pct = pctV(d.mcapChangePct);
  if (d.changePct != null) f.pct = pctV(d.changePct);
  if (d.recoveryPct != null) f.pct = pctV(d.recoveryPct);
  if (d.milestone) f.milestone = usdV(d.milestone);
  if (d.drawdownPct != null) f.dd = ddV(d.drawdownPct);
  if (d.fromLow) f.low = usdV(d.fromLow);
  if (d.previousAth) f.prevAth = usdV(d.previousAth);
  if (d.multiple) f.mult = v(String(Math.round(d.multiple)));
  if (d.volume1m != null) f.total = solV(d.volume1m);
  if (d.walletTrades >= 3) f.walletN = v(String(d.walletTrades));
  if (d.nb != null) { f.nb = v(String(d.nb)); f.ns = v(String(d.ns)); f.net = solV(Math.abs(d.net)); f.net.spoken = `${d.net >= 0 ? "plus" : "minus"} ${f.net.spoken}`; f.net.display = `${d.net >= 0 ? "+" : "-"}${f.net.display}`; }
  if (memory?.athTimestamp && memory?.minutesSinceAth != null) {
    const mins = d.minutesSinceAth ?? memory.minutesSinceAth;
    if (mins >= 0.5) f.ago = v(`${mins < 60 ? Math.round(mins) + " minutes" : Math.round(mins / 60) + " hours"}`, spokenMinutes(mins));
  }
  if (memory?.largestBuy?.sol) f.largest = solV(memory.largestBuy.sol);
  return f;
}

const fill = (tpl, facts, key) => tpl.replace(/\{(\w+)\}/g, (_, k) => facts[k]?.[key] ?? "");
const usable = (tpl, facts) => [...tpl.matchAll(/\{(\w+)\}/g)].every(([, k]) => facts[k]);

export class DialogueEngine {
  constructor() {
    this.recent = [];
  }

  pick(pool, facts) {
    const ok = pool.filter((t) => usable(t, facts));
    const fresh = ok.filter((t) => !this.recent.includes(t));
    const choices = fresh.length ? fresh : ok;
    if (!choices.length) return null;
    const t = choices[Math.floor(Math.random() * choices.length)];
    this.recent = [t, ...this.recent].slice(0, 40);
    return t;
  }

  /** LEVEL 1 template + LEVEL 2 contextual composition (memory callbacks, sign-offs). */
  compose({ profile, event, state, memory, category: forced }) {
    const vibe = profile?.vibe || "commander";
    const P = PERSONALITY[vibe] || {};
    const cat = forced || EVENT_CATEGORY[event?.type] || "quiet";
    const facts = buildFacts(event, state, memory, profile);
    const own = P[cat] || [];
    const pool = [...own, ...own, ...(GENERIC[cat] || [])];
    const main = this.pick(pool, facts);
    if (!main) return null;
    const parts = [main];

    const d = event?.data || {};
    let cb = null;
    if ((cat === "drawdown" || cat === "dump") && facts.ago && facts.ath && (memory?.drawdownFromAth || 0) > 8) cb = MEMORY_CALLBACKS[cat === "dump" ? "dump" : "drawdown"];
    else if (cat === "recovery" && facts.ath) cb = MEMORY_CALLBACKS.recovery;
    else if (cat === "ath" && facts.prevAth && Math.random() < 0.8) cb = MEMORY_CALLBACKS.ath;
    else if (cat === "whaleBuy" && memory?.largestBuy) {
      if (memory.largestBuy.sol > (d.sol || 0) * 1.05 && Math.random() < 0.6) cb = MEMORY_CALLBACKS.whaleBuyBigger;
      else if (Math.abs(memory.largestBuy.sol - (d.sol || 0)) < 1e-6 && Math.random() < 0.6) cb = MEMORY_CALLBACKS.whaleBuyRecord;
    } else if ((cat === "buy" || cat === "sell") && facts.walletN && Math.random() < 0.7) cb = MEMORY_CALLBACKS.repeatWallet;
    else if (cat === "milestone" && facts.launch && memory?.launchMarketCap < (d.milestone || 0) * 0.7 && Math.random() < 0.5) cb = MEMORY_CALLBACKS.milestone;
    else if (cat === "quiet" && memory?.athMarketCap > (memory?.launchMarketCap || 0) * 1.1 && Math.random() < 0.5) cb = MEMORY_CALLBACKS.quiet;
    if (cb) {
      const c = this.pick(cb, facts);
      if (c) parts.push(c);
    }
    if (P.signoff && Math.random() < 0.18 && parts.length < 2) parts.push(P.signoff[Math.floor(Math.random() * P.signoff.length)]);

    const tpl = parts.join(" ");
    const emotion = EMOTION_OVERRIDES[vibe]?.[cat] || EMOTION[cat] || "SPEAKING";
    return { text: fill(tpl, facts, "display"), speech: fill(tpl, facts, "spoken"), emotion, category: cat, facts, source: "template" };
  }
}

/** Lightweight caption for listings (no voice, no 3D). */
const cardEngine = new DialogueEngine();
export const captionFor = (profile, lastEvent, state, memory) =>
  cardEngine.compose({ profile, event: lastEvent || { type: "QUIET_MARKET", data: {} }, state, memory })?.text || "Watching the chart.";
