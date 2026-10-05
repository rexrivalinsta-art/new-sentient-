import { Link } from "react-router-dom";
import { fmtPct, fmtUsd, pctChange } from "@/lib/format";
import { captionFor } from "@/brain/dialogueEngine";
import { useMemo } from "react";

/** Livestream-style preview card. Uses lightweight animated thumbnails — no WebGL per card. */
export function TokenCard({ bundle, index = 0 }) {
  const { token, profile, avatar, state, memory, lastEvent } = bundle;
  const chg = state?.change1h ?? pctChange(state?.price, state?.price1hAgo || state?.price5mAgo);
  const caption = useMemo(
    () => captionFor({ ...profile, ticker: token.ticker }, lastEvent, state, memory),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastEvent?.timestamp, token.id],
  );
  const up = (chg ?? 0) >= 0;
  return (
    <Link to={`/token/${token.mint}`} data-testid={`token-card-${token.ticker.toLowerCase()}`}
      className="group relative block bg-[#0b0d10] border border-[#161a22] hover:border-[#2a3242] transition-colors rise" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="relative aspect-[4/3] overflow-hidden bg-[#07080b]">
        <div className="absolute inset-0 grid-bg opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(70,84,108,0.35),transparent_70%)]" />
        {avatar?.thumbnailUrl && (
          <img src={avatar.thumbnailUrl} alt={profile?.characterName} loading="lazy" className="absolute inset-0 m-auto h-[88%] object-contain transition-transform duration-700 group-hover:scale-[1.04]" />
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span data-testid="token-card-live-badge" className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#ff2e51] font-mono text-[9px] font-bold tracking-widest text-white">
            <span className="w-1 h-1 rounded-full bg-white live-dot" /> LIVE
          </span>
          <span className="px-1.5 py-0.5 bg-black/70 border border-[#00e699]/40 font-mono text-[9px] tracking-widest text-[#00e699]">ON-CHAIN</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/70 to-transparent">
          <p className="text-[13px] leading-snug text-slate-200 line-clamp-2 min-h-[2.5em]" data-testid="token-card-subtitle">"{caption}"</p>
        </div>
      </div>
      <div className="p-3 flex items-end justify-between gap-2 border-t border-[#161a22]">
        <div className="min-w-0">
          <div className="font-display font-black text-lg leading-none">${token.ticker}</div>
          <div className="text-xs text-slate-500 truncate mt-1">{token.name} · {profile?.characterName}</div>
        </div>
        <div className="text-right font-mono">
          <div className="text-sm text-white" data-testid="token-card-mcap">{fmtUsd(state?.marketCap)}</div>
          <div className={`text-xs ${up ? "text-[#00e699]" : "text-[#ff2e51]"}`}>{fmtPct(chg)} <span className="text-slate-600">1H</span></div>
        </div>
      </div>
    </Link>
  );
}
