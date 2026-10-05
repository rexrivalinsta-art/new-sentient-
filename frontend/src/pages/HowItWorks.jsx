import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bot, Brain, Rocket, Radio, ArrowUpRight, Coins } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { LiveCharacterStage } from "@/components/LiveCharacterStage";
import { StageHUD } from "@/components/StageHUD";
import { useLiveCharacter } from "@/hooks/useLiveCharacter";
import { qualityPreset } from "@/lib/device";

const STEPS = [
  { icon: Brain, n: "01", title: "Describe your token", body: "Name, ticker, image and a line about what it is. Then pick the AI brain that powers its mind — GPT, Claude or Gemini." },
  { icon: Bot, n: "02", title: "It gets a body & voice", body: "We automatically assign a unique 3D body from 3,000 avatars, one of 28 local voices and a personality. Every launch is different." },
  { icon: Rocket, n: "03", title: "Launch free on Pump.fun", body: "Launch straight to the Pump.fun bonding curve with a 0 SOL dev buy — no upfront balance required, just the tiny network fee. Or link a token you already made." },
  { icon: Radio, n: "04", title: "It wakes up & goes live", body: "The being reacts to every real trade in real time — speaking, emoting and animating — using only verified market data. Buys, whales, ATHs, dumps and recoveries." },
];

const DEMO_EVENTS = [
  ["small_buy", "Small Buy"],
  ["whale_buy", "Whale Buy"],
  ["new_ath", "New ATH"],
  ["whale_sell", "Whale Dump"],
  ["recovery", "Recovery"],
];

export default function HowItWorks() {
  const [session, setSession] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [vibes, setVibes] = useState({});
  const quality = useMemo(() => qualityPreset(), []);

  useEffect(() => {
    api.labSession(32000).then(setSession).catch((e) => toast.error(errMsg(e)));
    api.avatars({ featured: true, limit: 20 }).then((d) => {
      setAvatar(d.items.find((a) => a.archetype === "commander") || d.items[0]);
    });
    api.vibes().then(setVibes).catch(() => {});
  }, []);

  const vibeMeta = vibes.vibes?.find((v) => v.id === "commander");
  const profile = useMemo(() => ({
    characterName: "DEMO ONE", ticker: "DEMO", vibe: "commander", voice: "am_onyx",
    traits: vibeMeta?.traits || [], animationProfile: vibeMeta?.animation,
    animationParams: vibes.animationProfiles?.[vibeMeta?.animation], vibeLabel: vibeMeta?.label || "Commander",
  }), [vibeMeta, vibes]);

  const ai = useLiveCharacter(session?.mint, profile);
  const sim = (action) => {
    if (!session) return;
    api.sim(session.mint, action).catch((e) => toast.error(errMsg(e)));
  };

  return (
    <div className="noise relative max-w-[1500px] mx-auto px-4 md:px-8 pt-12 pb-24">
      {/* Hero */}
      <div className="rise max-w-3xl">
        <div className="font-mono text-[11px] tracking-[0.35em] text-slate-500 mb-5">HOW IT WORKS</div>
        <h1 className="font-display font-black uppercase leading-[0.9] tracking-tight text-5xl md:text-7xl">
          A launchpad for<br /><span className="text-[#00f0ff]">sentient beings.</span>
        </h1>
        <p className="mt-6 text-base md:text-lg text-slate-400 max-w-xl">
          On SENTIPAD, a token isn't a static coin — it's a living 3D being with a body, a voice and a mind. It watches its own market and reacts out loud, in real time.
        </p>
      </div>

      {/* Steps */}
      <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STEPS.map(({ icon: Icon, n, title, body }) => (
          <div key={n} className="border border-[#161a22] bg-[#08090c] p-5 flex flex-col gap-3" data-testid={`how-step-${n}`}>
            <div className="flex items-center justify-between">
              <Icon size={22} className="text-[#00f0ff]" />
              <span className="font-mono text-[11px] tracking-[0.3em] text-slate-600">{n}</span>
            </div>
            <div className="font-display font-black uppercase text-lg leading-tight mt-1">{title}</div>
            <p className="text-[13px] text-slate-400 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      {/* Free to launch callout */}
      <div className="mt-6 border border-[#00e699]/30 bg-[#00e699]/5 p-5 flex flex-col md:flex-row md:items-center gap-4" data-testid="free-launch-callout">
        <div className="flex items-center gap-3">
          <Coins size={22} className="text-[#00e699] shrink-0" />
          <div className="font-display font-black uppercase text-xl text-[#00e699]">Free to launch</div>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          Launching on Pump.fun costs nothing upfront — the dev buy defaults to <b>0 SOL</b>, so you don't need a balance to create your being. You only ever pay Solana's tiny network fee to sign the transaction. You sign from <b>your own wallet</b>, so you're the on-chain creator and keep <b>100% of Pump.fun creator rewards</b> — SENTIPAD takes no fee.
        </p>
      </div>

      {/* Live demo */}
      <div className="mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <div className="font-mono text-[11px] tracking-[0.35em] text-slate-500">LIVE DEMO</div>
            <h2 className="font-display font-black uppercase text-3xl md:text-4xl tracking-tight mt-2">See a being react</h2>
          </div>
          <div className="font-mono text-[10px] tracking-widest text-[#ffb800] border border-[#ffb800]/40 px-2 py-1">SIMULATED MARKET · EXAMPLE ONLY</div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
          <LiveCharacterStage key={quality} quality={quality} avatar={avatar} params={profile.animationParams} driver={ai.driver}
            className="h-[60vh] min-h-[440px] border border-[#161a22]" testid="how-demo-stage">
            <StageHUD name={profile.characterName} ticker="DEMO" vibe={profile.vibeLabel} ai={ai} />
          </LiveCharacterStage>

          <div className="space-y-4">
            <div className="border border-[#161a22] bg-[#08090c] p-5">
              <div className="font-mono text-[10px] tracking-[0.3em] text-slate-400 mb-3">TRY IT</div>
              <ol className="text-[13px] text-slate-400 space-y-2 leading-relaxed list-decimal list-inside">
                <li>Press <b className="text-white">ENTER LIVE</b> on the stage to hear its voice.</li>
                <li>Fire a market event below and watch it respond.</li>
              </ol>
              <button data-testid="how-demo-play" onClick={() => sim("lock_demo")} disabled={!session}
                className="mt-4 w-full py-3.5 bg-[#00f0ff] text-black font-display font-black tracking-[0.2em] text-sm hover:bg-white transition-colors disabled:opacity-30">
                ▶ PLAY FULL DEMO
              </button>
              <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">A scripted run: $32K launch → buys → a 4 SOL whale → new ATH → a dump → recovery.</p>
            </div>

            <div className="border border-[#161a22] bg-[#08090c] p-5">
              <div className="font-mono text-[10px] tracking-[0.3em] text-slate-400 mb-3">OR TRIGGER ONE EVENT</div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_EVENTS.map(([id, label]) => (
                  <button key={id} data-testid={`how-sim-${id.replace(/_/g, "-")}`} onClick={() => sim(id)} disabled={!session}
                    className="py-2.5 px-2 border border-[#1e2430] font-mono text-[10px] tracking-wider uppercase hover:border-[#00f0ff] hover:text-[#00f0ff] transition-colors disabled:opacity-30">
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 font-mono text-[10px] tracking-widest text-slate-500 flex justify-between">
                <span>STATE: <span className="text-white">{ai.emotion}</span></span>
                <span>{ai.status}</span>
              </div>
            </div>

            <div className="border border-[#161a22] bg-[#08090c] p-3">
              <div className="font-mono text-[10px] tracking-[0.3em] text-slate-400 px-1 py-1 mb-1">WHAT IT SAID</div>
              <div className="max-h-48 overflow-y-auto thin-scroll space-y-2 px-1">
                {!ai.log.length && <div className="font-mono text-[10px] text-slate-600 py-2">Trigger an event to hear it think…</div>}
                {ai.log.slice(0, 12).map((l) => (
                  <div key={l.id} className="border-l-2 border-[#1e2430] pl-2">
                    <div className="font-mono text-[9px] text-slate-600 tracking-wider">{l.event?.type || "idle"} · {l.emotion}</div>
                    <div className="text-[13px] text-slate-200">{l.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-20 border-t border-[#161a22] pt-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <h3 className="font-display font-black uppercase text-3xl md:text-4xl tracking-tight">Ready to bring one alive?</h3>
          <p className="text-slate-400 mt-2">Free to launch. No balance required to start.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/create" data-testid="how-cta-create" className="group inline-flex items-center gap-3 bg-white text-black px-8 py-4 font-display font-black tracking-[0.2em] text-sm hover:bg-[#00f0ff] transition-colors">
            CREATE <ArrowUpRight size={18} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <Link to="/explore" data-testid="how-cta-explore" className="font-mono text-[11px] tracking-[0.2em] text-slate-400 hover:text-white border-b border-slate-700 pb-1">EXPLORE LIVE</Link>
        </div>
      </div>
    </div>
  );
}
