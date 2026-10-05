import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { LiveCharacterStage } from "@/components/LiveCharacterStage";
import { StageHUD } from "@/components/StageHUD";
import { MarketChart, MemoryPanel, StatGrid, TradeStream } from "@/components/MarketPanels";
import { useLiveCharacter } from "@/hooks/useLiveCharacter";
import { KOKORO_VOICES } from "@/voice/VoiceEngine";
import { aiEnhancer } from "@/brain/aiEnhancer";
import { EMOTIONS } from "@/three/CharacterAnimator";
import { qualityPreset } from "@/lib/device";
import { cacheInfo } from "@/three/avatarCache";

const SIMS = [
  ["small_buy", "Small Buy", "buy"], ["whale_buy", "Whale Buy", "buy"], ["small_sell", "Small Sell", "sell"], ["whale_sell", "Whale Sell", "sell"],
  ["buy_streak", "Buy Streak", "buy"], ["sell_streak", "Sell Streak", "sell"], ["rally", "20% Rally", "buy"], ["dump", "20% Dump", "sell"],
  ["new_ath", "New ATH + $100K", "ath"], ["recovery", "Recovery", "buy"], ["quiet", "Quiet Market", "none"],
];
const TONE = { buy: "hover:border-[#00e699] hover:text-[#00e699]", sell: "hover:border-[#ff2e51] hover:text-[#ff2e51]", ath: "hover:border-[#ffb800] hover:text-[#ffb800]", none: "hover:border-slate-400" };

const Box = ({ title, children, testid, className = "" }) => (
  <section className={`border border-[#161a22] bg-[#08090c] ${className}`} data-testid={testid}>
    <h3 className="px-3 py-2 border-b border-[#161a22] font-mono text-[10px] tracking-[0.3em] text-slate-400">{title}</h3>
    <div className="p-3">{children}</div>
  </section>
);
const Select = ({ value, onChange, children, testid }) => (
  <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-[#0b0d10] border border-[#1e2430] px-2 py-2 text-sm font-mono outline-none focus:border-[#00f0ff]/60">{children}</select>
);

function useAIInfo() {
  const [i, setI] = useState(aiEnhancer.info());
  useEffect(() => aiEnhancer.subscribe(setI), []);
  return i;
}

export default function CharacterLab() {
  const [session, setSession] = useState(null);
  const [avatars, setAvatars] = useState([]);
  const [vibes, setVibes] = useState([]);
  const [avatarId, setAvatarId] = useState(null);
  const [vibe, setVibe] = useState("commander");
  const [voice, setVoice] = useState("am_onyx");
  const [mcapInput, setMcapInput] = useState("30000");
  const [quality, setQuality] = useState(qualityPreset());
  const [custom, setCustom] = useState("");
  const aiInfo = useAIInfo();

  useEffect(() => {
    api.labSession(30000).then(setSession).catch((e) => toast.error(errMsg(e)));
    api.avatars({ featured: true, limit: 20 }).then((d) => {
      setAvatars(d.items);
      setAvatarId((d.items.find((a) => a.archetype === "commander") || d.items[0])?.id);
    });
    api.vibes().then((d) => setVibes(d));
  }, []);

  const avatar = avatars.find((a) => a.id === avatarId);
  const vibeMeta = vibes.vibes?.find((v) => v.id === vibe);
  const profile = useMemo(() => ({
    characterName: vibe === "commander" ? "Commander LOCK" : `${vibeMeta?.label || "AI"} LOCK`, ticker: "LOCK", vibe, voice,
    traits: vibeMeta?.traits || [], animationProfile: vibeMeta?.animation, animationParams: vibes.animationProfiles?.[vibeMeta?.animation], vibeLabel: vibeMeta?.label,
  }), [vibe, voice, vibeMeta, vibes]);
  const ai = useLiveCharacter(session?.mint, profile);
  const [brain, setBrain] = useState("cloud");
  useEffect(() => {
    ai.director.brain = brain;
  }, [brain, ai.director]);

  const onVibe = (v) => {
    setVibe(v);
    const meta = vibes.vibes?.find((x) => x.id === v);
    if (meta) setVoice(meta.voices[0]);
  };
  const sim = (action, value) => session && api.sim(session.mint, action, value).catch((e) => toast.error(errMsg(e)));
  const addAvatar = async (q) => {
    const d = await api.avatars({ q, limit: 8 });
    setAvatars((a) => [...a, ...d.items.filter((x) => !a.some((y) => y.id === x.id))]);
    if (d.items[0]) setAvatarId(d.items[0].id);
  };

  return (
    <div className="max-w-[1700px] mx-auto px-4 md:px-6 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <div className="font-mono text-[11px] tracking-[0.35em] text-slate-500">/DEV/CHARACTER-LAB</div>
          <h1 className="font-display font-black uppercase text-4xl md:text-5xl tracking-tight leading-none mt-2">Character Lab</h1>
        </div>
        <div className="font-mono text-[10px] tracking-widest text-slate-500" data-testid="lab-session-info">SESSION {session?.mint?.slice(0, 12) || "…"} · SIMULATED · LRU [{cacheInfo().length}/3]</div>
      </div>
      <div className="grid xl:grid-cols-[300px_minmax(0,1fr)_360px] gap-4">
        <div className="space-y-4">
          <Box title="IDENTITY" testid="lab-identity">
            <div className="space-y-3">
              <div>
                <div className="font-mono text-[10px] text-slate-500 mb-1">AVATAR</div>
                <Select testid="lab-avatar-select" value={avatarId || ""} onChange={setAvatarId}>
                  {avatars.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.archetype}</option>)}
                </Select>
                <input data-testid="lab-avatar-search" placeholder="Search registry + Enter" onKeyDown={(e) => e.key === "Enter" && addAvatar(e.target.value)} className="mt-2 w-full bg-[#0b0d10] border border-[#1e2430] px-2 py-1.5 text-xs font-mono outline-none" />
              </div>
              <div><div className="font-mono text-[10px] text-slate-500 mb-1">PERSONALITY</div>
                <Select testid="lab-personality-select" value={vibe} onChange={onVibe}>{vibes.vibes?.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select></div>
              <div><div className="font-mono text-[10px] text-slate-500 mb-1">VOICE (KOKORO)</div>
                <Select testid="lab-voice-select" value={voice} onChange={setVoice}>{KOKORO_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}</Select></div>
              <div><div className="font-mono text-[10px] text-slate-500 mb-1">RENDER QUALITY</div>
                <Select testid="lab-quality-select" value={quality} onChange={setQuality}>{["low", "medium", "high", "none"].map((q) => <option key={q} value={q}>{q}</option>)}</Select></div>
            </div>
          </Box>
          <Box title="MARKET CONTROL" testid="lab-market-control">
            <div className="flex gap-2">
              <input data-testid="lab-mcap-input" type="number" value={mcapInput} onChange={(e) => setMcapInput(e.target.value)} className="flex-1 min-w-0 bg-[#0b0d10] border border-[#1e2430] px-2 py-2 text-sm font-mono outline-none" />
              <button data-testid="lab-set-mcap-button" onClick={() => sim("set_mcap", mcapInput)} className="px-3 border border-[#1e2430] font-mono text-[10px] tracking-widest hover:border-[#00f0ff]">SET MCAP</button>
            </div>
            <button data-testid="lab-relaunch-button" onClick={() => sim("launch", mcapInput)} className="mt-2 w-full py-2 border border-[#1e2430] font-mono text-[10px] tracking-widest hover:border-[#00f0ff]">RESET + LAUNCH AT MCAP</button>
            <div className="grid grid-cols-2 gap-1.5 mt-3">
              {SIMS.map(([id, label, tone]) => (
                <button key={id} data-testid={`sim-button-${id.replace(/_/g, "-")}`} onClick={() => sim(id)} className={`py-2.5 px-2 border border-[#1e2430] font-mono text-[10px] tracking-wider uppercase transition-colors ${TONE[tone]}`}>{label}</button>
              ))}
            </div>
            <button data-testid="sim-button-lock-demo" onClick={() => sim("lock_demo")} className="mt-3 w-full py-3 bg-white text-black font-display font-black text-xs tracking-[0.2em] hover:bg-[#00f0ff] transition-colors">RUN $LOCK DEMO SCENARIO</button>
            <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">Launch $30K → 0.2 → 0.5 → 4 SOL whale → $52K → 1 SOL sell → $100K ATH → $72K → $91K recovery.</p>
          </Box>
        </div>

        <div className="space-y-4 min-w-0">
          <LiveCharacterStage key={quality} quality={quality} avatar={avatar} params={profile.animationParams} driver={ai.driver} className="h-[62vh] min-h-[460px] border border-[#161a22]" testid="lab-character-stage">
            <StageHUD name={profile.characterName} ticker="LOCK" vibe={profile.vibeLabel} ai={ai} />
          </LiveCharacterStage>
          <StatGrid state={ai.state} memory={ai.memory} />
          <div className="grid md:grid-cols-2 gap-4">
            <Box title="CHART"><MarketChart history={ai.history} ath={ai.state?.athMarketCap} /></Box>
            <Box title="TRADES"><TradeStream trades={ai.trades} /></Box>
          </div>
        </div>

        <div className="space-y-4">
          <Box title={`STATE · ${ai.emotion} · ${ai.status}`} testid="lab-emotion-panel">
            <div className="grid grid-cols-3 gap-1">
              {EMOTIONS.map((e) => (
                <button key={e} data-testid={`emotion-button-${e.toLowerCase()}`} onClick={() => ai.director.setEmotion(e, 4000)}
                  className={`py-1.5 font-mono text-[9px] tracking-wider border ${ai.emotion === e ? "border-[#00f0ff] text-[#00f0ff]" : "border-[#1e2430] text-slate-500 hover:text-slate-200"}`}>{e}</button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input data-testid="lab-say-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Test line for voice + lip sync" className="flex-1 min-w-0 bg-[#0b0d10] border border-[#1e2430] px-2 py-1.5 text-xs outline-none" />
              <button data-testid="lab-say-button" onClick={() => custom && ai.director.say(custom)} className="px-3 border border-[#1e2430] font-mono text-[10px] hover:border-[#00f0ff]">SAY</button>
            </div>
          </Box>
          <Box title="BRAIN" testid="lab-brain-panel">
            <div className="grid grid-cols-3 gap-1">
              {[["cloud", "CLOUD · GEMINI 3.8"], ["local", "LOCAL AI"], ["template", "TEMPLATES"]].map(([k, l]) => (
                <button key={k} data-testid={`brain-mode-${k}`} onClick={() => setBrain(k)}
                  className={`py-2 font-mono text-[9px] tracking-wider border ${brain === k ? "border-[#00f0ff] text-[#00f0ff]" : "border-[#1e2430] text-slate-500"}`}>{l}</button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Cloud brain rewrites each reaction with verified facts only. One call per event per token, shared by all viewers. Falls back to templates.</p>
          </Box>
          <Box title="LOCAL AI ENHANCER" testid="lab-ai-panel">
            <div className="font-mono text-[10px] text-slate-400 space-y-1">
              <div>MODE: <span className="text-white" data-testid="ai-mode">{aiInfo.mode.toUpperCase()}</span> · STATUS: {aiInfo.status.toUpperCase()} {aiInfo.status === "loading" && `${Math.round(aiInfo.progress * 100)}%`}</div>
              <div>WEBGPU: {String(aiInfo.capability.webgpu)} · MOBILE: {String(aiInfo.capability.mobile)} · MEM: {aiInfo.capability.memory ?? "?"}GB · NATIVE AI: {String(aiInfo.capability.nativeAI)}</div>
            </div>
            <button data-testid="ai-enhancer-toggle" onClick={() => (aiInfo.mode === "template" && aiInfo.status !== "loading" ? aiEnhancer.enable() : aiEnhancer.disable())}
              className="mt-3 w-full py-2 border border-[#1e2430] font-mono text-[10px] tracking-widest hover:border-[#00f0ff]">
              {aiInfo.mode === "template" ? (aiInfo.capability.webllmOk || aiInfo.capability.nativeAI ? "ENABLE LOCAL AI (~350MB, OPT-IN)" : "DEVICE UNSUITABLE · TEMPLATE ENGINE") : "DISABLE LOCAL AI"}
            </button>
          </Box>
          <Box title="DIALOGUE LOG" testid="lab-dialogue-log">
            <div className="max-h-72 overflow-y-auto thin-scroll space-y-2">
              {!ai.log.length && <div className="font-mono text-[10px] text-slate-600">TRIGGER AN EVENT…</div>}
              {ai.log.map((l) => (
                <div key={l.id} className="border-l-2 border-[#1e2430] pl-2">
                  <div className="font-mono text-[9px] text-slate-500 tracking-wider">{l.event?.type}{l.secondary ? ` + ${l.secondary}` : ""} · {l.category} · {l.emotion} · {l.source}{l.voiced ? " · VOICED" : ""}</div>
                  <div className="text-sm text-slate-200">{l.text}</div>
                </div>
              ))}
            </div>
          </Box>
          <Box title="CHARACTER MEMORY" testid="lab-memory"><MemoryPanel memory={ai.memory} /></Box>
        </div>
      </div>
    </div>
  );
}
