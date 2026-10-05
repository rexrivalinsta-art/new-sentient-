import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { TokenCard } from "@/components/TokenCard";
import { LiveCharacterStage } from "@/components/LiveCharacterStage";
import { StageHUD } from "@/components/StageHUD";
import { useLiveCharacter } from "@/hooks/useLiveCharacter";
import { fmtUsd } from "@/lib/format";

export function useTokens(params, interval = 8000) {
  const [items, setItems] = useState(null);
  const key = JSON.stringify(params || {});
  useEffect(() => {
    let alive = true;
    const load = () => api.tokens(JSON.parse(key)).then((d) => alive && setItems(d)).catch(() => alive && setItems((x) => x || []));
    load();
    const t = setInterval(load, interval);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [key, interval]);
  return items;
}

function HeroStage({ bundle }) {
  const profile = { ...bundle.profile, ticker: bundle.token.ticker };
  const ai = useLiveCharacter(bundle.token.mint, profile, { autoVoice: false });
  return (
    <Link to={`/token/${bundle.token.mint}`} className="block" data-testid="hero-stage-link" onClick={(e) => e.target.closest("button") && e.preventDefault()}>
      <LiveCharacterStage avatar={bundle.avatar} params={profile.animationParams} driver={ai.driver} className="h-[440px] md:h-[620px] border border-[#161a22]" testid="hero-character-stage">
        <StageHUD name={profile.characterName} ticker={bundle.token.ticker} vibe={profile.vibeLabel} ai={ai} />
        <div className="absolute right-4 md:right-6 bottom-24 md:bottom-8 z-10 text-right font-mono">
          <div className="text-[9px] tracking-[0.3em] text-slate-500">MARKET CAP</div>
          <div className="text-xl md:text-2xl text-white" data-testid="hero-mcap">{fmtUsd(ai.state?.marketCap)}</div>
        </div>
      </LiveCharacterStage>
    </Link>
  );
}

export default function Home() {
  const items = useTokens({ sort: "mcap" });
  const featured = items?.[0];
  return (
    <div className="noise relative">
      <section className="max-w-[1600px] mx-auto px-4 md:px-8 pt-10 md:pt-16 grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-center">
        <div className="rise">
          <div className="font-mono text-[11px] tracking-[0.35em] text-slate-500 mb-6">PUMP.FUN LAUNCHPAD / LIVING CHARACTERS</div>
          <h1 className="font-display font-black uppercase leading-[0.86] tracking-tight text-5xl sm:text-6xl lg:text-[104px]" data-testid="hero-title">
            Every token<br />is <span className="text-[#00f0ff]">alive.</span>
          </h1>
          <p className="mt-6 text-base md:text-lg text-slate-400 max-w-md" data-testid="hero-subtitle">Launch a token. Give it a body, voice and mind.</p>
          <div className="mt-10 flex items-center gap-4">
            <Link to="/create" data-testid="hero-create-cta" className="group inline-flex items-center gap-3 bg-white text-black px-8 py-4 font-display font-black tracking-[0.2em] text-sm hover:bg-[#00f0ff] transition-colors">
              CREATE <ArrowUpRight size={18} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <Link to="/dev/character-lab" data-testid="hero-lab-link" className="font-mono text-[11px] tracking-[0.2em] text-slate-400 hover:text-white border-b border-slate-700 pb-1">OPEN CHARACTER LAB</Link>
          </div>
          <div className="mt-14 grid grid-cols-3 max-w-md border-t border-[#161a22] pt-5 font-mono">
            {[["3,000", "HD 3D BODIES"], ["28", "LOCAL VOICES"], ["GEMINI 3.8", "LIVE BRAIN"]].map(([a, b]) => (
              <div key={b}><div className="text-xl text-white">{a}</div><div className="text-[9px] tracking-[0.25em] text-slate-500 mt-1">{b}</div></div>
            ))}
          </div>
        </div>
        <div className="rise" style={{ animationDelay: "120ms" }}>
          {featured ? <HeroStage bundle={featured} /> : <div className="h-[440px] md:h-[620px] border border-[#161a22] bg-[#07080b]" />}
        </div>
      </section>

      <section className="max-w-[1600px] mx-auto px-4 md:px-8 mt-24">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display font-black uppercase text-3xl md:text-4xl tracking-tight flex items-center gap-3" data-testid="live-tokens-title">
            <span className="w-2.5 h-2.5 bg-[#ff2e51] live-dot" /> Live tokens
          </h2>
          <Link to="/explore" data-testid="see-all-link" className="font-mono text-[11px] tracking-[0.2em] text-slate-400 hover:text-white">EXPLORE ALL →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="live-tokens-grid">
          {!items && Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/3.6] bg-[#0b0d10] border border-[#161a22] animate-pulse" />)}
          {items?.map((b, i) => <TokenCard key={b.token.id} bundle={b} index={i} />)}
        </div>
      </section>
    </div>
  );
}
