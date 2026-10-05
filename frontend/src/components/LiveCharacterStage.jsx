import { useEffect, useRef, useState } from "react";
import { detectDevice, qualityPreset } from "@/lib/device";
import { API } from "@/lib/api";

export const modelUrlFor = (avatar) => (avatar?.id ? `${API}/avatar-files/${encodeURIComponent(avatar.id)}/model` : null);

/** Reusable cinematic VRM stage. Lazy-loads Three.js; falls back to poster on WebGL/VRM failure. */
export function LiveCharacterStage({ avatar, params, driver, quality, framing = "upper", className = "", children, testid = "live-character-stage" }) {
  const host = useRef(null);
  const stage = useRef(null);
  const [phase, setPhase] = useState("loading");
  const [progress, setProgress] = useState(0);
  const driverRef = useRef(driver);
  driverRef.current = driver;
  const q = quality || qualityPreset();

  useEffect(() => {
    if (q === "none" || !detectDevice().webgl) {
      setPhase("fallback");
      return undefined;
    }
    let disposed = false;
    import("@/three/StageRenderer").then(({ StageRenderer }) => {
      if (disposed || !host.current) return;
      stage.current = new StageRenderer(host.current, { quality: q, framing });
      stage.current.driver = () => driverRef.current?.();
      setPhase((p) => (p === "loading" ? "loading" : p));
    }).catch(() => setPhase("fallback"));
    return () => {
      disposed = true;
      stage.current?.dispose();
      stage.current = null;
    };
  }, [q, framing]);

  useEffect(() => {
    if (!avatar?.modelUrl || phase === "fallback") return undefined;
    let cancelled = false;
    setPhase("loading");
    setProgress(0);
    const wait = () => new Promise((r) => {
      const chk = () => (stage.current || cancelled ? r() : setTimeout(chk, 50));
      chk();
    });
    wait().then(() => stage.current?.setAvatar(modelUrlFor(avatar), params, (p) => !cancelled && setProgress(p)))
      .then((vrm) => !cancelled && vrm && setPhase("ready"))
      .catch((e) => {
        console.warn("VRM load failed", e);
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar?.modelUrl, phase === "fallback"]);

  useEffect(() => {
    stage.current?.setParams(params);
  }, [params]);

  const showPoster = phase !== "ready";
  return (
    <div data-testid={testid} className={`relative overflow-hidden bg-[#07080b] ${className}`}>
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(60,72,92,0.28),transparent_65%)]" />
      <div ref={host} className="absolute inset-0" data-testid="stage-canvas-host" />
      {showPoster && avatar?.thumbnailUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img src={avatar.thumbnailUrl} alt={avatar.name} data-testid="stage-poster" className={`h-[70%] object-contain poster-breathe ${phase === "loading" ? "opacity-30 blur-[1px]" : "opacity-90"}`} />
        </div>
      )}
      {phase === "loading" && avatar && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 text-center" data-testid="stage-loading">
          <div className="font-mono text-[10px] tracking-[0.3em] text-slate-400 mb-2">MATERIALIZING BODY {Math.round(progress * 100)}%</div>
          <div className="h-px bg-[#1e2430]"><div className="h-px bg-[#00f0ff] transition-[width] duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} /></div>
        </div>
      )}
      {(phase === "error" || phase === "fallback") && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-widest text-slate-500" data-testid="stage-fallback-note">
          {phase === "error" ? "3D BODY UNAVAILABLE — POSTER MODE" : "WEBGL UNAVAILABLE — POSTER MODE"}
        </div>
      )}
      <div className="absolute inset-0 scanline pointer-events-none opacity-40" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#050608] to-transparent pointer-events-none" />
      {children}
    </div>
  );
}
