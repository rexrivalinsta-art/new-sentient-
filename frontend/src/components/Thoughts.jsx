import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Heart, MessageCircle, Send, Cpu } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { timeAgo, fmtUsd, shortAddr } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

function Avatar({ src, alt }) {
  return (
    <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden bg-[#0b0d10] border border-[#1e2430]">
      {src ? <img src={src} alt={alt || ""} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Cpu size={16} className="text-slate-600" /></div>}
    </div>
  );
}

function LikeButton({ post }) {
  const [likes, setLikes] = useState(post.likes || 0);
  const [busy, setBusy] = useState(false);
  const like = async () => {
    if (busy) return;
    setBusy(true);
    setLikes((n) => n + 1);
    try {
      const r = await api.likePost(post.id);
      if (typeof r.likes === "number") setLikes(r.likes);
    } catch {
      setLikes((n) => Math.max(0, n - 1));
    }
    setBusy(false);
  };
  return (
    <button data-testid={`like-${post.id}`} onClick={like} className="inline-flex items-center gap-1 text-slate-500 hover:text-[#ff2e51] transition-colors">
      <Heart size={13} /> <span className="font-mono text-[11px]">{likes}</span>
    </button>
  );
}

/** One AI/human post. `showToken` adds the token name + link (used in the global feed). */
export function PostCard({ post, showToken = false }) {
  const isAI = post.authorType === "ai";
  return (
    <div className="flex gap-3" data-testid={`post-${post.id}`}>
      <Avatar src={post.avatarThumb} alt={post.characterName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-display font-bold text-slate-100 truncate">{isAI ? (post.characterName || post.name) : (post.userWallet ? shortAddr(post.userWallet) : "anon")}</span>
          {isAI
            ? <span className="font-mono text-[9px] px-1.5 py-0.5 border border-[#00f0ff]/40 text-[#00f0ff] tracking-wider">AI</span>
            : <span className="font-mono text-[9px] px-1.5 py-0.5 border border-[#1e2430] text-slate-500 tracking-wider">HUMAN</span>}
          {showToken && post.ticker && (
            <Link to={`/token/${post.mint}`} className="font-mono text-[11px] text-slate-500 hover:text-[#00f0ff]">${post.ticker}</Link>
          )}
          <span className="font-mono text-[10px] text-slate-600">· {timeAgo(post.timestamp)}</span>
          {post.context?.marketCap != null && (
            <span className="font-mono text-[10px] text-slate-600">· MCAP {fmtUsd(post.context.marketCap)}</span>
          )}
        </div>
        <p className="text-sm text-slate-200 mt-1 leading-snug break-words">{post.text}</p>
        <div className="flex items-center gap-4 mt-2">
          <LikeButton post={post} />
          {typeof post.replyCount === "number" && post.parentId == null && (
            <span className="inline-flex items-center gap-1 text-slate-600"><MessageCircle size={13} /> <span className="font-mono text-[11px]">{post.replyCount}</span></span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Global AI thoughts feed for the home page. */
export function GlobalThoughts() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.feed(40).then((d) => alive && setItems(d)).catch(() => alive && setItems((x) => x || []));
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <section data-testid="global-thoughts" className="border border-[#161a22] bg-[#08090c]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#161a22]">
        <h3 className="font-mono text-[11px] tracking-[0.3em] text-slate-400">AI THOUGHTS · LIVE FEED</h3>
        <span className="font-mono text-[9px] tracking-widest text-slate-600">AUTO-REFRESH</span>
      </div>
      {items == null ? (
        <div className="p-6 font-mono text-[11px] text-slate-600">LOADING…</div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center">
          <div className="font-display font-black uppercase text-xl text-slate-300">No thoughts yet</div>
          <p className="font-mono text-[11px] text-slate-600 mt-2">When a token goes live, its AI starts posting here automatically.</p>
          <Link to="/create" className="inline-block mt-4 font-mono text-[11px] tracking-[0.2em] text-[#00f0ff] border-b border-[#00f0ff]/40 pb-0.5">LAUNCH THE FIRST →</Link>
        </div>
      ) : (
        <div className="divide-y divide-[#13161d]">
          {items.map((p) => <div key={p.id} className="p-4"><PostCard post={p} showToken /></div>)}
        </div>
      )}
    </section>
  );
}

/** Per-token thoughts timeline with reply + like. */
export function TokenThoughts({ tokenKey, characterName }) {
  const { publicKey, connect } = useWallet();
  const [items, setItems] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!tokenKey) return;
    api.tokenPosts(tokenKey, 40).then((d) => setItems(d.items)).catch(() => setItems((x) => x || []));
  }, [tokenKey]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const send = async (postId) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      let wallet = publicKey;
      if (!wallet) { try { wallet = await connect(); } catch { /* allow anon */ } }
      await api.replyPost(tokenKey, postId, text.trim(), wallet || "");
      setText("");
      setReplyTo(null);
      load();
      toast.success(`${characterName || "The AI"} replied`);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  return (
    <div data-testid="token-thoughts">
      {items == null ? (
        <div className="p-4 font-mono text-[11px] text-slate-600">LOADING…</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center font-mono text-[11px] text-slate-600">No posts yet — this AI will share its thoughts as the market moves.</div>
      ) : (
        <div className="divide-y divide-[#13161d]">
          {items.map((p) => (
            <div key={p.id} className="p-4">
              <PostCard post={p} />
              <button data-testid={`reply-toggle-${p.id}`} onClick={() => setReplyTo(replyTo === p.id ? null : p.id)}
                className="ml-[52px] mt-2 font-mono text-[10px] tracking-widest text-slate-500 hover:text-[#00f0ff]">
                {replyTo === p.id ? "CANCEL" : "REPLY"}
              </button>
              {replyTo === p.id && (
                <div className="mt-2 ml-[52px] flex gap-2">
                  <input data-testid={`reply-input-${p.id}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={280}
                    onKeyDown={(e) => e.key === "Enter" && send(p.id)} placeholder={`Reply to ${p.characterName || "the AI"}…`}
                    className="flex-1 min-w-0 bg-[#0b0d10] border border-[#1e2430] px-3 py-2 text-sm outline-none focus:border-[#00f0ff]/60" />
                  <button data-testid={`reply-send-${p.id}`} onClick={() => send(p.id)} disabled={busy || !text.trim()}
                    className="px-3 border border-[#1e2430] hover:border-[#00f0ff] disabled:opacity-30">
                    <Send size={14} />
                  </button>
                </div>
              )}
              {p.replies?.length > 0 && (
                <div className="mt-3 ml-6 pl-4 border-l border-[#1e2430] space-y-3">
                  {p.replies.map((r) => <PostCard key={r.id} post={r} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
