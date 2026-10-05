import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { LiveCharacterStage } from "@/components/LiveCharacterStage";
import { StageHUD } from "@/components/StageHUD";
import { MarketChart, MemoryPanel, StatGrid, TradeStream } from "@/components/MarketPanels";
import { useLiveCharacter } from "@/hooks/useLiveCharacter";
import { shortAddr } from "@/lib/format";
import { ExternalLink } from "lucide-react";

const Panel = ({ title, children, testid, right }) => (
  <section className="border border-[#161a22] bg-[#08090c]" data-testid={testid}>
    <div className="flex items-center justify-between px-3 py-2 border-b border-[#161a22]">
      <h3 className="font-mono text-[10px] tracking-[0.3em] text-slate-400">{title}</h3>{right}
    </div>
    {children}
  </section>
);

function LiveToken({ bundle }) {
  const { token, avatar } = bundle;
  const profile = useMemo(() => ({ ...bundle.profile, ticker: token.ticker }), [bundle.profile, token.ticker]);
  const ai = useLiveCharacter(token.mint, profile);
  const history = ai.history?.length ? ai.history : bundle.history;
  return (
    <div className="max-w-[1600px] mx-auto px-0 md:px-6 lg:px-8 pt-0 md:pt-6 grid lg:grid-cols-[65fr_35fr] gap-4 md:gap-6">
      <div className="lg:sticky lg:top-20 self-start">
        <LiveCharacterStage avatar={avatar} params={profile.animationParams} driver={ai.driver} className="h-[68vh] min-h-[440px] lg:h-[calc(100vh-110px)] md:border border-[#161a22]">
          <StageHUD name={profile.characterName} ticker={token.ticker} vibe={profile.vibeLabel} ai={ai} />
        </LiveCharacterStage>
      </div>
      <div className="space-y-4 px-4 md:px-0 pb-10">
        <div className="flex items-start gap-3">
          {token.imageUrl && <img src={token.imageUrl} alt="" className="w-14 h-14 object-cover border border-[#161a22] bg-[#0b0d10]" />}
          <div className="min-w-0">
            <h1 className="font-display font-black text-3xl uppercase leading-none" data-testid="token-title">{token.name}</h1>
            <div className="font-mono text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
              <span>${token.ticker}</span><span className="text-slate-700">/</span>
              <span data-testid="token-mint">{shortAddr(token.mint)}</span>
              {!token.simulated && (
                <a href={`https://pump.fun/coin/${token.mint}`} target="_blank" rel="noreferrer" data-testid="pumpfun-link" className="inline-flex items-center gap-1 text-[#00f0ff]">PUMP.FUN <ExternalLink size={11} /></a>
              )}
            </div>
          </div>
        </div>
        {token.simulated && (
          <div className="font-mono text-[10px] tracking-widest text-[#ffb800] border border-[#ffb800]/30 bg-[#ffb800]/5 px-3 py-2" data-testid="simulated-notice">
            SIMULATED MARKET — DEMO DATA, NOT ON-CHAIN. <Link to="/dev/character-lab" className="underline">OPEN LAB</Link>
          </div>
        )}
        {ai.feed === "reconnecting" && <div className="font-mono text-[10px] tracking-widest text-[#ff2e51] border border-[#ff2e51]/30 px-3 py-2" data-testid="reconnecting-notice">MARKET FEED RECONNECTING — NO ACTIVITY IS BEING FABRICATED.</div>}
        <StatGrid state={ai.state} memory={ai.memory} />
        <Panel title="MARKET CAP" testid="chart-panel"><div className="p-2"><MarketChart history={history} ath={ai.state?.athMarketCap} /></div></Panel>
        <Panel title="LIVE TRANSACTIONS" testid="trades-panel" right={<span className="font-mono text-[10px] text-slate-600">WHALE ≥ {ai.state?.whaleThresholdSol ?? "—"} SOL</span>}>
          <TradeStream trades={ai.trades} />
        </Panel>
        <Panel title="CHARACTER MEMORY" testid="memory-section"><div className="p-2"><MemoryPanel memory={ai.memory} /></div></Panel>
        <Panel title="IDENTITY" testid="identity-panel">
          <div className="p-3 text-sm text-slate-400 space-y-2">
            <p>{profile.backstory}</p>
            <div className="font-mono text-[10px] tracking-widest text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
              <span>VOICE: {profile.voice}</span><span>MOTION: {profile.animationProfile}</span>
              <span>BODY: {avatar?.name} · {avatar?.collection} · {avatar?.license}</span>
              <span data-testid="identity-brain">AI BRAIN: {profile.brainLabel || "Gemini 3.8 Flash"}</span>
            </div>
            {token.description && <p className="text-slate-500 text-xs">{token.description}</p>}
            {avatar?.attribution && (
              <p className="text-[11px] text-slate-500" data-testid="identity-attribution">
                3D avatar: <a className="underline" href={avatar.sourceUrl || "https://vipe.io"} target="_blank" rel="noreferrer">{avatar.attribution}</a> (<a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>)
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function TokenPage() {
  const { mint } = useParams();
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setBundle(null);
    api.token(mint).then(setBundle).catch((e) => setError(e?.response?.status === 404 ? "Token not found" : "Could not load token"));
  }, [mint]);
  if (error) return <div className="max-w-xl mx-auto mt-24 text-center font-mono text-slate-400" data-testid="token-error">{error}. <Link className="text-[#00f0ff]" to="/explore">Explore</Link></div>;
  if (!bundle) return <div className="h-[70vh] flex items-center justify-center font-mono text-[11px] tracking-[0.3em] text-slate-600" data-testid="token-loading">WAKING CHARACTER…</div>;
  if (bundle.token.status !== "live") return <div className="max-w-xl mx-auto mt-24 text-center font-mono text-slate-400">This token has not launched yet.</div>;
  return <LiveToken bundle={bundle} />;
}
