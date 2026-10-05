import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Upload, Sparkles, AlertTriangle, ExternalLink, Coins } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { LiveCharacterStage } from "@/components/LiveCharacterStage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SpeechDirector } from "@/brain/SpeechDirector";
import { voiceEngine } from "@/voice/VoiceEngine";
import { useWallet } from "@/lib/wallet";
import { PumpFunHandoffProvider, PumpPortalLaunchProvider } from "@/launch/pumpLaunch";

function useBrainModels() {
  const [models, setModels] = useState([]);
  useEffect(() => {
    api.brainModels().then((d) => setModels(d.models)).catch(() => {});
  }, []);
  return models;
}

export function BrainPicker({ value, onChange, compact = false, prefix = "" }) {
  const models = useBrainModels();
  return (
    <div className={`grid gap-1.5 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`} data-testid={`${prefix}brain-model-picker`}>
      {models.map((m) => (
        <button key={m.id} type="button" disabled={!m.available} data-testid={`${prefix}brain-model-${m.id}`} onClick={() => onChange(m.id)}
          className={`text-left px-3 py-2.5 border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${value === m.id ? "border-[#00f0ff] bg-[#00f0ff]/5" : "border-[#1e2430] hover:border-slate-500"}`}>
          <div className="font-mono text-[9px] tracking-[0.2em] text-slate-500">{m.family.toUpperCase()}</div>
          <div className="font-display font-bold text-sm mt-0.5">{m.label}</div>
          {!m.available && <div className="font-mono text-[9px] text-slate-500 mt-0.5">{m.note}</div>}
        </button>
      ))}
    </div>
  );
}

const Field = ({ label, children, hint }) => (
  <label className="block">
    <div className="flex justify-between font-mono text-[10px] tracking-[0.3em] text-slate-500 mb-2"><span>{label}</span>{hint && <span>{hint}</span>}</div>
    {children}
  </label>
);
const inputCls = "w-full bg-[#0b0d10] border border-[#1e2430] focus:border-[#00f0ff]/60 outline-none px-3 py-3 text-sm transition-colors";

function LaunchDialog({ open, onOpenChange, form, character, imageUrl, onLaunched, ensureDraft }) {
  const { publicKey, connect, provider } = useWallet();
  const [method, setMethod] = useState("pumpportal");
  const [ack, setAck] = useState(false);
  const [devBuy, setDevBuy] = useState("0");
  const [mint, setMint] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");

  const run = async () => {
    setBusy(true);
    try {
      const tokenId = await ensureDraft();
      let res;
      if (method === "pumpportal") {
        if (!imageUrl) throw new Error("Pump.fun requires a token image.");
        const pk = publicKey || (await connect());
        setStep("Building create transaction…");
        const prep = await PumpPortalLaunchProvider.prepareLaunch({ tokenId, publicKey: pk, devBuySol: parseFloat(devBuy) || 0 });
        setStep("Approve in your wallet…");
        res = await PumpPortalLaunchProvider.launch(prep, { provider: provider() });
        if (res.status !== "live") {
          setStep("Waiting for confirmation…");
          for (let i = 0; i < 20 && res.status !== "live"; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            const s = await PumpPortalLaunchProvider.getLaunchStatus(tokenId);
            res.status = s.status;
          }
        }
      } else {
        setStep("Linking mint…");
        res = await PumpFunHandoffProvider.launch({ tokenId }, { mint: mint.trim() });
      }
      if (res.status === "live") onLaunched(res.mint);
      else toast.message("Transaction sent. Character will wake when it confirms.");
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
    setStep("");
  };

  const opt = (id, title, desc) => (
    <button key={id} data-testid={`launch-method-${id}`} onClick={() => setMethod(id)} className={`text-left p-3 border transition-colors ${method === id ? "border-[#00f0ff] bg-[#00f0ff]/5" : "border-[#1e2430] hover:border-slate-500"}`}>
      <div className="font-display font-bold text-sm">{title}</div><div className="text-xs text-slate-500 mt-1">{desc}</div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#08090c] border-[#1e2430] rounded-none max-h-[90vh] overflow-y-auto" data-testid="launch-dialog">
        <DialogHeader><DialogTitle className="font-display font-black uppercase tracking-tight text-2xl">Confirm launch</DialogTitle></DialogHeader>
        <div className="grid grid-cols-[72px_1fr] gap-4 border border-[#1e2430] p-3">
          <div className="w-[72px] h-[72px] bg-[#0b0d10] border border-[#1e2430] overflow-hidden">{imageUrl && <img src={imageUrl} alt="" className="w-full h-full object-cover" />}</div>
          <div className="font-mono text-xs space-y-1 min-w-0">
            <div><span className="text-slate-500">NAME </span>{form.name}</div>
            <div><span className="text-slate-500">TICKER </span>${form.ticker.toUpperCase()}</div>
            <div className="truncate"><span className="text-slate-500">DESC </span>{form.description || "—"}</div>
            <div className="truncate"><span className="text-slate-500">LINKS </span>{[form.website, form.twitter, form.telegram].filter(Boolean).join(" · ") || "—"}</div>
            <div><span className="text-slate-500">PAIR </span>SOL (bonding curve)</div>
            <div><span className="text-slate-500">CHARACTER </span>{character?.characterName} · {character?.avatar?.name} · {character?.voice}</div>
            <div><span className="text-slate-500">AI BRAIN </span>{character?.brainLabel}</div>
          </div>
        </div>
        <div className="flex gap-3 p-3 border border-[#ffb800]/40 bg-[#ffb800]/5 text-[#ffb800] text-xs" data-testid="immutable-warning">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>Pump.fun token name, ticker, image and metadata are <b>immutable</b> after launch. Check every character. The AI brain can be changed later; body and voice are permanent.</div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {opt("pumpportal", "Pump.fun · Wallet", "Free to launch — 0 SOL dev buy, no balance needed beyond Solana's tiny network fee. Server builds the create tx; you sign. Image required.")}
          {opt("handoff", "Official Pump.fun", "Create on pump.fun yourself (also free), then paste the mint to bring it alive.")}
        </div>
        {method === "pumpportal" && (
          <Field label="OPTIONAL DEV BUY (SOL)" hint="0 = FREE LAUNCH">
            <input data-testid="dev-buy-input" type="number" min="0" step="0.01" value={devBuy} onChange={(e) => setDevBuy(e.target.value)} className={inputCls} />
          </Field>
        )}
        {method === "pumpportal" && (
          <div className="flex gap-3 p-3 border border-[#00e699]/30 bg-[#00e699]/5 text-[#00e699] text-xs" data-testid="creator-fee-note">
            <Coins size={16} className="shrink-0 mt-0.5" />
            <div>You sign from your own wallet, so <b>you are the on-chain creator</b>. The token shows under your wallet and you keep <b>100% of Pump.fun creator rewards</b>. SENTIPAD takes no fee and adds no referral.</div>
          </div>
        )}
        {method === "handoff" && (
          <div className="space-y-3">
            <a href={PumpFunHandoffProvider.createUrl} target="_blank" rel="noreferrer" data-testid="open-pumpfun-create" className="inline-flex items-center gap-2 text-sm text-[#00f0ff]">Open pump.fun/create <ExternalLink size={13} /></a>
            <Field label="MINT ADDRESS AFTER LAUNCH">
              <input data-testid="handoff-mint-input" value={mint} onChange={(e) => setMint(e.target.value)} placeholder="Paste mint…pump" className={inputCls} />
            </Field>
          </div>
        )}
        <label className="flex items-center gap-3 text-sm text-slate-300">
          <Checkbox data-testid="immutable-ack-checkbox" checked={ack} onCheckedChange={(v) => setAck(!!v)} /> I confirmed the immutable token metadata.
        </label>
        <button data-testid="confirm-launch-button" disabled={!ack || busy || (method === "handoff" && !mint)} onClick={run}
          className="w-full bg-white text-black py-4 font-display font-black tracking-[0.2em] text-sm disabled:opacity-30 hover:bg-[#00f0ff] transition-colors">
          {busy ? step || "WORKING…" : method === "handoff" ? "LINK & BRING ALIVE" : "LAUNCH ON PUMP.FUN"}
        </button>
      </DialogContent>
    </Dialog>
  );
}

function ImportExisting() {
  const nav = useNavigate();
  const [input, setInput] = useState("");
  const [brain, setBrain] = useState("gemini-3.8-flash");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const b = await api.importToken({ input, brainModel: brain });
      nav(`/token/${b.token.mint}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };
  return (
    <div className="mb-12 border border-[#161a22] bg-[#08090c] p-4" data-testid="import-existing-panel">
      <div className="font-mono text-[10px] tracking-[0.3em] text-slate-500 mb-2">ALREADY ON PUMP.FUN? BRING IT ALIVE</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input data-testid="import-token-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Mint or pump.fun / gmgn / dexscreener link" className={`${inputCls} flex-1`} />
        <button data-testid="import-token-button" disabled={!input || busy} onClick={go} className="px-5 py-3 bg-white text-black font-display font-black text-xs tracking-[0.2em] disabled:opacity-30 hover:bg-[#00f0ff]">{busy ? "WAKING…" : "BRING ALIVE"}</button>
      </div>
      <div className="mt-3"><BrainPicker value={brain} onChange={setBrain} compact prefix="import-" /></div>
      <p className="mt-2 text-[11px] text-slate-600">Body, voice and personality are assigned automatically. Live prices & reactions from Solana RPC (bonding curve) and DexScreener (PumpSwap). No fabricated data.</p>
    </div>
  );
}

export default function Create() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", ticker: "", description: "", website: "", twitter: "", telegram: "" });
  const [brain, setBrain] = useState("gemini-3.8-flash");
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [character, setCharacter] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const fileRef = useRef();
  const director = useMemo(() => new SpeechDirector(), []);
  const ctx = useRef({});
  const [line, setLine] = useState(null);
  ctx.current = { profile: character ? { ...character, ticker: form.ticker.toUpperCase() } : null };
  const draftKey = JSON.stringify([form, brain, image?.url]);

  useEffect(() => {
    director.getContext = () => ctx.current;
    director.setHandlers({ onLine: setLine, onStatus: () => {}, onEmotion: () => {} });
    return () => director.stop();
  }, [director]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === "ticker" ? e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 10) : e.target.value }));

  const onFile = async (f) => {
    if (!f) return;
    setUploading(true);
    try {
      const r = await api.upload(f);
      setImage({ preview: URL.createObjectURL(f), url: r.url, path: r.path });
    } catch (e) {
      toast.error(errMsg(e));
    }
    setUploading(false);
  };

  // Platform assigns a unique body, voice and personality; the creator only picks the AI brain.
  const ensureDraft = async () => {
    if (draft?.key === draftKey) return draft.id;
    const b = await api.createToken({ ...form, ticker: form.ticker.toUpperCase(), imageUrl: image?.url, imagePath: image?.path, brainModel: brain });
    setDraft({ id: b.token.id, key: draftKey });
    setCharacter({ ...b.profile, avatar: b.avatar });
    director.say(`I am ${b.profile.characterName}. ${b.profile.backstory.split(". ")[0]}.`, "SMUG");
    return b.token.id;
  };

  const openLaunch = async () => {
    setAssigning(true);
    try {
      await ensureDraft();
      setLaunchOpen(true);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setAssigning(false);
  };

  const canLaunch = form.name && form.ticker;
  const previewVoice = () => {
    voiceEngine.unlock();
    voiceEngine.init().then(() => director.say(`I am ${character.characterName}. Systems are online.`, "SPEAKING")).catch(() => toast.error("Voice unavailable on this device. Subtitles still work."));
    toast.message("Loading local voice model (first time only)…");
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 pt-10 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-10">
      <div className="rise">
        <ImportExisting />
        <div className="font-mono text-[11px] tracking-[0.35em] text-slate-500 mb-3">CREATE / 01</div>
        <h1 className="font-display font-black uppercase text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-none mb-10">Give it a mind.</h1>
        <div className="space-y-6">
          <div className="grid grid-cols-[1fr_160px] gap-4">
            <Field label="TOKEN NAME" hint={`${form.name.length}/32`}><input data-testid="token-name-input" maxLength={32} value={form.name} onChange={set("name")} placeholder="LOCKHEED" className={inputCls} /></Field>
            <Field label="TICKER"><input data-testid="token-ticker-input" value={form.ticker} onChange={set("ticker")} placeholder="LOCK" className={`${inputCls} uppercase font-mono`} /></Field>
          </div>
          <Field label="DESCRIPTION"><textarea data-testid="token-description-input" maxLength={500} rows={3} value={form.description} onChange={set("description")} className={inputCls} placeholder="What is this token about?" /></Field>
          <div className="grid grid-cols-[120px_1fr] gap-4 items-start">
            <Field label="TOKEN IMAGE">
              <button type="button" data-testid="token-image-upload" onClick={() => fileRef.current?.click()} className="w-[120px] h-[120px] border border-dashed border-[#2a3242] hover:border-[#00f0ff]/60 flex items-center justify-center overflow-hidden bg-[#0b0d10]">
                {image ? <img src={image.preview} alt="" className="w-full h-full object-cover" /> : <span className="flex flex-col items-center gap-2 text-slate-500 font-mono text-[10px]"><Upload size={18} />{uploading ? "UPLOADING" : "SQUARE · 5MB"}</span>}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="token-image-file-input" />
            </Field>
            <div className="grid gap-3">
              <input data-testid="token-website-input" value={form.website} onChange={set("website")} placeholder="Website (optional)" className={inputCls} />
              <input data-testid="token-twitter-input" value={form.twitter} onChange={set("twitter")} placeholder="X / Twitter (optional)" className={inputCls} />
              <input data-testid="token-telegram-input" value={form.telegram} onChange={set("telegram")} placeholder="Telegram (optional)" className={inputCls} />
            </div>
          </div>
          <Field label="AI BRAIN"><BrainPicker value={brain} onChange={setBrain} /></Field>
          <p className="text-xs text-slate-500 leading-relaxed" data-testid="auto-assign-note">
            The 3D body, voice and personality are assigned automatically by the platform. Every launch gets a different mix and they can't be picked or rerolled.
          </p>
        </div>
      </div>

      <div className="lg:sticky lg:top-20 self-start space-y-4 rise" style={{ animationDelay: "100ms" }}>
        <LiveCharacterStage avatar={character?.avatar} params={character?.animationParams} driver={() => director.frame()} className="h-[520px] md:h-[600px] border border-[#161a22]" testid="create-preview-stage">
          {!character && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 text-center px-6">
              <Sparkles size={18} className="text-slate-600" />
              <div className="font-mono text-[11px] tracking-[0.3em] text-slate-500">BODY + VOICE ASSIGNED AT LAUNCH</div>
              <div className="font-mono text-[10px] text-slate-600">Unique mix from 3,000 HD avatars and 28 voices</div>
            </div>
          )}
          {character && (
            <div className="absolute inset-x-0 top-0 p-5 z-10 flex justify-between items-start">
              <div>
                <span className="px-2 py-1 border border-[#00f0ff]/40 font-mono text-[10px] tracking-[0.2em] text-[#00f0ff]">ASSIGNED</span>
                <div className="font-display font-black uppercase text-3xl mt-3 leading-none" data-testid="preview-character-name">{character.characterName}</div>
                <div className="font-mono text-xs text-slate-400 mt-1">${(form.ticker || "TICKER").toUpperCase()} / {character.vibeLabel} / {character.brainLabel}</div>
              </div>
              <button data-testid="preview-voice-button" onClick={previewVoice} className="font-mono text-[10px] tracking-widest border border-[#1e2430] bg-black/50 px-3 py-2 hover:border-[#00f0ff]/50">PREVIEW VOICE</button>
            </div>
          )}
          {line && <p key={line.ts} className="rise absolute bottom-8 inset-x-6 z-10 font-display font-semibold text-lg md:text-xl">{line.text}</p>}
        </LiveCharacterStage>
        <button data-testid="open-launch-dialog-button" disabled={!canLaunch || assigning} onClick={openLaunch}
          className="w-full py-5 bg-[#00f0ff] text-black font-display font-black tracking-[0.25em] disabled:opacity-25 disabled:bg-slate-700 hover:bg-white transition-colors">
          {assigning ? "ASSIGNING CHARACTER…" : "LAUNCH TOKEN"}
        </button>
        {!canLaunch && <div className="font-mono text-[10px] tracking-widest text-slate-600 text-center">NAME + TICKER REQUIRED</div>}
      </div>
      <LaunchDialog open={launchOpen} onOpenChange={setLaunchOpen} form={form} character={character} imageUrl={image?.url} ensureDraft={ensureDraft} onLaunched={(m) => nav(`/token/${m}`)} />
    </div>
  );
}
