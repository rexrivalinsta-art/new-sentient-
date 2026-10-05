import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis, ReferenceLine } from "recharts";
import { fmtUsd, fmtSol, shortAddr, timeAgo, fmtPct, pctChange, fmtPrice } from "@/lib/format";

export function MarketChart({ history, ath }) {
  const data = (history || []).map((p) => ({ t: p.t, v: p.mcap }));
  return (
    <div className="h-44 w-full" data-testid="market-chart">
      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height={176} minWidth={0}>
          <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin * 0.95", "dataMax * 1.05"]} />
            {ath && <ReferenceLine y={ath} stroke="#ffb800" strokeDasharray="3 4" strokeOpacity={0.6} />}
            <Tooltip contentStyle={{ background: "#0b0d10", border: "1px solid #1e2430", fontFamily: "IBM Plex Mono", fontSize: 11 }} labelFormatter={() => ""} formatter={(v) => [fmtUsd(v), "MCAP"]} />
            <Area type="monotone" dataKey="v" stroke="#00f0ff" strokeWidth={1.5} fill="url(#mc)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full flex items-center justify-center font-mono text-[11px] text-slate-600 tracking-widest">AWAITING VERIFIED TRADES</div>
      )}
    </div>
  );
}

export function StatGrid({ state, memory }) {
  const chg = pctChange(state?.price, state?.price1hAgo || state?.price5mAgo);
  const items = [
    ["MARKET CAP", fmtUsd(state?.marketCap), "stat-mcap", "text-white"],
    ["CHANGE", fmtPct(chg), "stat-change", (chg ?? 0) >= 0 ? "text-[#00e699]" : "text-[#ff2e51]"],
    ["PRICE", fmtPrice(state?.price), "stat-price", "text-slate-200"],
    ["ATH", fmtUsd(state?.athMarketCap), "stat-ath", "text-[#ffb800]"],
    ["VOL 5M", fmtSol(state?.volume5m), "stat-vol5m", "text-slate-200"],
    ["VOL 1H", fmtSol(state?.volume1h), "stat-vol1h", "text-slate-200"],
    ["HOLDERS", state?.holderCount ?? "—", "stat-holders", "text-slate-400"],
    ["FROM ATH", memory?.drawdownFromAth ? `-${memory.drawdownFromAth}%` : "0%", "stat-drawdown", "text-slate-300"],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#161a22] border border-[#161a22]">
      {items.map(([k, val, id, cls]) => (
        <div key={k} className="bg-[#0a0c0f] p-3">
          <div className="font-mono text-[9px] tracking-[0.25em] text-slate-500">{k}</div>
          <div data-testid={id} className={`font-mono text-base md:text-lg mt-1 ${cls}`}>{val}</div>
        </div>
      ))}
    </div>
  );
}

export function TradeStream({ trades }) {
  return (
    <div data-testid="trade-stream-feed" className="max-h-72 overflow-y-auto thin-scroll divide-y divide-[#13161d]">
      {!trades?.length && <div className="p-4 font-mono text-[11px] text-slate-600 tracking-widest">NO TRADES YET</div>}
      {trades?.map((t) => (
        <div key={t.signature} className="ticker-in grid grid-cols-[52px_1fr_auto_auto] gap-3 items-center px-3 py-2 font-mono text-xs">
          <span className={t.side === "buy" ? "text-[#00e699]" : "text-[#ff2e51]"}>{t.side.toUpperCase()}</span>
          <span className="text-slate-500 truncate">{shortAddr(t.wallet)}</span>
          <span className="text-slate-200">{fmtSol(t.solAmount)}</span>
          <span className="text-slate-600 w-8 text-right">{timeAgo(t.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}

const LABEL = {
  TOKEN_LAUNCHED: "LAUNCH", NEW_ATH: "NEW ATH", MARKET_CAP_MILESTONE: "MILESTONE", LARGE_BUY: "WHALE BUY", LARGE_SELL: "WHALE SELL",
  PRICE_SURGE: "SURGE", PRICE_DROP: "DROP", ATH_DRAWDOWN: "DRAWDOWN", RECOVERY: "RECOVERY", VOLUME_SPIKE: "VOLUME SPIKE",
};
const COLOR = { NEW_ATH: "#ffb800", MARKET_CAP_MILESTONE: "#ffb800", LARGE_BUY: "#00e699", PRICE_SURGE: "#00e699", RECOVERY: "#00e699", LARGE_SELL: "#ff2e51", PRICE_DROP: "#ff2e51", ATH_DRAWDOWN: "#ff2e51" };

const detail = (h) => {
  const d = h.data || {};
  if (d.sol) return fmtSol(d.sol);
  if (d.milestone) return fmtUsd(d.milestone);
  if (d.changePct != null) return fmtPct(d.changePct);
  if (d.drawdownPct != null) return `-${d.drawdownPct}%`;
  if (d.recoveryPct != null) return fmtPct(d.recoveryPct);
  return fmtUsd(h.marketCap);
};

export function MemoryPanel({ memory }) {
  if (!memory) return <div className="p-4 font-mono text-[11px] text-slate-600">MEMORY EMPTY</div>;
  const facts = [
    ["LAUNCH", fmtUsd(memory.launchMarketCap)],
    ["ATH", fmtUsd(memory.athMarketCap)],
    ["PREV ATH", fmtUsd(memory.previousAth?.marketCap)],
    ["BIGGEST BUY", memory.largestBuy ? fmtSol(memory.largestBuy.sol) : "—"],
    ["BIGGEST SELL", memory.largestSell ? fmtSol(memory.largestSell.sol) : "—"],
    ["LAST MILESTONE", fmtUsd(memory.lastMilestone?.value)],
    ["STREAK", memory.consecutiveBuys ? `${memory.consecutiveBuys} BUYS` : memory.consecutiveSells ? `${memory.consecutiveSells} SELLS` : "—"],
    ["AGE", `${Math.round(memory.minutesSinceLaunch)}m`],
  ];
  return (
    <div data-testid="memory-panel">
      <div className="grid grid-cols-2 gap-px bg-[#161a22]">
        {facts.map(([k, v]) => (
          <div key={k} className="bg-[#0a0c0f] px-3 py-2 flex justify-between font-mono text-[11px]">
            <span className="text-slate-500 tracking-widest">{k}</span><span className="text-slate-200">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1 max-h-56 overflow-y-auto thin-scroll" data-testid="memory-highlights">
        {(memory.highlights || []).map((h, i) => (
          <div key={`${h.timestamp}-${i}`} className="flex items-center gap-3 px-3 py-1.5 font-mono text-[11px] border-l-2" style={{ borderColor: COLOR[h.type] || "#2a3242" }}>
            <span className="text-slate-300 w-24 shrink-0">{LABEL[h.type] || h.type}</span>
            <span className="text-slate-400 flex-1">{detail(h)}</span>
            <span className="text-slate-600">{timeAgo(h.timestamp)}</span>
          </div>
        ))}
        {(memory.recurringWallets || []).length > 0 && (
          <div className="px-3 pt-2 font-mono text-[10px] text-slate-500 tracking-widest">RECURRING: {memory.recurringWallets.map((w) => `${shortAddr(w.wallet)}×${w.trades}`).join("  ")}</div>
        )}
      </div>
    </div>
  );
}
