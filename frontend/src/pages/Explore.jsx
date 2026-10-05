import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { TokenCard } from "@/components/TokenCard";
import { useTokens } from "@/pages/Home";
import { api } from "@/lib/api";

const SORTS = [["mcap", "Top market cap"], ["gainers", "Gainers"], ["volume", "Volume"], ["new", "Newest"]];
const ARCH = ["", "commander", "wallstreet", "chaotic", "villain", "anime", "robot", "aristocrat", "anchor", "hacker", "scientist", "alien", "meme"];

function Registry() {
  const [stats, setStats] = useState(null);
  const [arch, setArch] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  useEffect(() => { api.avatarStats().then(setStats); }, []);
  useEffect(() => { api.avatars({ archetype: arch || undefined, limit: 24, offset: page * 24 }).then(setData); }, [arch, page]);
  return (
    <div data-testid="avatar-registry">
      <div className="flex flex-wrap gap-2 mb-4 font-mono text-[10px] tracking-widest text-slate-500">
        {stats?.collections.map((c) => <span key={c.name} className="border border-[#161a22] px-2 py-1">{c.name} · {c.count} · {c.license}</span>)}
      </div>
      <div className="flex flex-wrap gap-1 mb-4">
        {ARCH.map((a) => (
          <button key={a || "all"} data-testid={`registry-filter-${a || "all"}`} onClick={() => { setArch(a); setPage(0); }}
            className={`font-mono text-[10px] tracking-widest uppercase px-2.5 py-1.5 border ${arch === a ? "border-white text-white" : "border-[#1e2430] text-slate-500 hover:text-slate-200"}`}>{a || "all"}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-2">
        {data?.items.map((a) => (
          <div key={a.id} className="bg-[#0b0d10] border border-[#161a22] p-2" data-testid={`registry-avatar-${a.id}`}>
            <div className="aspect-square bg-[#07080b] flex items-center justify-center overflow-hidden">
              {a.thumbnailUrl && <img src={a.thumbnailUrl} alt={a.name} loading="lazy" className="h-full object-contain" />}
            </div>
            <div className="mt-1.5 text-[11px] truncate">{a.name}</div>
            <div className="font-mono text-[9px] text-slate-500 truncate uppercase">{a.archetype} · {a.license}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4 font-mono text-[11px]">
        <button data-testid="registry-prev" disabled={!page} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 border border-[#1e2430] disabled:opacity-30">PREV</button>
        <span className="text-slate-500">{data ? `${page * 24 + 1}-${Math.min((page + 1) * 24, data.total)} / ${data.total}` : "…"}</span>
        <button data-testid="registry-next" disabled={data && (page + 1) * 24 >= data.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 border border-[#1e2430] disabled:opacity-30">NEXT</button>
      </div>
    </div>
  );
}

export default function Explore() {
  const [sort, setSort] = useState("mcap");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("tokens");
  const items = useTokens({ sort, q: q || undefined });
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 pt-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="font-mono text-[11px] tracking-[0.35em] text-slate-500 mb-3">EXPLORE</div>
          <h1 className="font-display font-black uppercase text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-none">Live characters</h1>
        </div>
        <div className="flex gap-1">
          {[["tokens", "Tokens"], ["registry", "Avatar registry"]].map(([k, l]) => (
            <button key={k} data-testid={`explore-tab-${k}`} onClick={() => setTab(k)} className={`font-mono text-[11px] tracking-widest uppercase px-4 py-2 border ${tab === k ? "bg-white text-black border-white" : "border-[#1e2430] text-slate-400"}`}>{l}</button>
          ))}
        </div>
      </div>
      {tab === "tokens" ? (
        <>
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <label className="flex items-center gap-2 border border-[#1e2430] bg-[#0b0d10] px-3 flex-1 max-w-md">
              <Search size={14} className="text-slate-500" />
              <input data-testid="explore-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or ticker" className="bg-transparent outline-none py-2.5 text-sm w-full" />
            </label>
            <div className="flex flex-wrap gap-1">
              {SORTS.map(([k, l]) => (
                <button key={k} data-testid={`explore-sort-${k}`} onClick={() => setSort(k)} className={`font-mono text-[10px] tracking-widest uppercase px-3 py-2 border ${sort === k ? "border-[#00f0ff] text-[#00f0ff]" : "border-[#1e2430] text-slate-500 hover:text-slate-200"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="explore-grid">
            {items?.map((b, i) => <TokenCard key={b.token.id} bundle={b} index={i} />)}
            {items && !items.length && <div className="font-mono text-sm text-slate-500" data-testid="explore-empty">No live tokens match.</div>}
          </div>
        </>
      ) : <Registry />}
    </div>
  );
}
