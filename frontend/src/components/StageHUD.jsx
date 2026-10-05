import { Volume2, VolumeX, Radio } from "lucide-react";

const STATUS_COLOR = { LISTENING: "text-slate-300 border-slate-600", THINKING: "text-[#ffb800] border-[#ffb800]/40", SPEAKING: "text-[#00f0ff] border-[#00f0ff]/40" };

export function LiveBadge({ label = "AI LIVE", testid = "ai-live-badge" }) {
  return (
    <span data-testid={testid} className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#ff2e51]/12 border border-[#ff2e51]/40 font-mono text-[10px] font-semibold tracking-[0.2em] text-[#ff2e51]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#ff2e51] live-dot" /> {label}
    </span>
  );
}

export function FeedBadge({ feed }) {
  const map = {
    simulated: ["SIMULATED MARKET", "text-[#ffb800] border-[#ffb800]/40"],
    live: ["VERIFIED FEED", "text-[#00e699] border-[#00e699]/40"],
    reconnecting: ["RECONNECTING…", "text-[#ff2e51] border-[#ff2e51]/40"],
    connecting: ["CONNECTING…", "text-slate-400 border-slate-600"],
    error: ["FEED ERROR", "text-[#ff2e51] border-[#ff2e51]/40"],
  };
  const [label, cls] = map[feed] || map.connecting;
  return <span data-testid="feed-status-badge" className={`px-2 py-1 border font-mono text-[10px] tracking-[0.18em] ${cls}`}>{label}</span>;
}

/** Overlay HUD for the stage: identity, status, subtitle, enter-live control. */
export function StageHUD({ name, ticker, vibe, ai, compact = false }) {
  const { status, line, live, muted, enterLive, toggleMute, voice, feed } = ai;
  return (
    <>
      <div className="absolute top-0 inset-x-0 p-4 md:p-6 flex items-start justify-between gap-3 z-10">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap"><LiveBadge /><FeedBadge feed={feed} /></div>
          <div className={`font-display font-black uppercase leading-none tracking-tight ${compact ? "text-xl" : "text-2xl md:text-4xl"}`} data-testid="stage-character-name">{name}</div>
          <div className="font-mono text-xs text-slate-400 tracking-widest" data-testid="stage-ticker">${ticker} {vibe && <span className="text-slate-600">/ {vibe.toUpperCase()}</span>}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span data-testid="stage-status" className={`px-2 py-1 border font-mono text-[10px] tracking-[0.25em] ${STATUS_COLOR[status]}`}>{status}</span>
          {live && (
            <button data-testid="stage-mute-toggle" onClick={toggleMute} className="p-2 border border-[#1e2430] bg-black/50 hover:border-[#00f0ff]/50 transition-colors">
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          )}
        </div>
      </div>

      {!live && (
        <div className="absolute inset-x-0 bottom-[30%] flex justify-center z-10 pointer-events-none">
          <button data-testid="enter-live-button" onClick={enterLive} className="pointer-events-auto group flex items-center gap-3 px-6 py-3 bg-black/70 backdrop-blur-md border border-white/15 hover:border-[#00f0ff] hover:bg-black/80 transition-colors">
            <Radio size={16} className="text-[#ff2e51] live-dot" />
            <span className="font-display font-bold tracking-[0.25em] text-sm">ENTER LIVE</span>
            <span className="font-mono text-[10px] text-slate-500">UNMUTE AI</span>
          </button>
        </div>
      )}

      <div className="absolute bottom-0 inset-x-0 p-4 md:p-8 z-10">
        <div className="min-h-[56px] max-w-3xl" data-testid="stage-subtitle">
          {line && (
            <p key={line.ts} className="rise font-display font-semibold text-lg md:text-2xl leading-snug text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.9)]">
              {line.text}
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3 font-mono text-[10px] tracking-widest text-slate-500">
          <span data-testid="voice-status">VOICE: {voice.status === "ready" ? (live ? (muted ? "MUTED" : "LOCAL") : "READY · LOCKED") : voice.status === "loading" ? `LOADING ${Math.round(voice.progress * 100)}%` : voice.status === "error" ? "UNAVAILABLE · SUBTITLES" : "STANDBY"}</span>
        </div>
      </div>
    </>
  );
}
