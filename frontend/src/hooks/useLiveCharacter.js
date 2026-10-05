import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpeechDirector } from "@/brain/SpeechDirector";
import { voiceEngine } from "@/voice/VoiceEngine";
import { useMarketFeed } from "@/lib/useMarketFeed";
import { detectDevice } from "@/lib/device";

export function useVoiceInfo() {
  const [info, setInfo] = useState(voiceEngine.info());
  useEffect(() => voiceEngine.subscribe(setInfo), []);
  return info;
}

/** Wires market feed -> SpeechDirector -> stage driver. */
export function useLiveCharacter(mint, profile, { autoVoice = true } = {}) {
  const director = useMemo(() => new SpeechDirector(), []);
  const [line, setLine] = useState(null);
  const [status, setStatus] = useState("LISTENING");
  const [emotion, setEmotion] = useState("IDLE");
  const [log, setLog] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const [muted, setMuted] = useState(false);
  const [live, setLive] = useState(false);
  const voice = useVoiceInfo();

  const feed = useMarketFeed(mint, {
    onEvent: (ev) => {
      setLastEvent(ev);
      director.handleEvent(ev);
    },
  });
  const ctx = useRef({});
  ctx.current = { profile, state: feed.state, memory: feed.memory, mint };

  useEffect(() => {
    director.getContext = () => ctx.current;
    director.setHandlers({
      onLine: (l) => {
        setLine(l);
        setLog((g) => [{ id: `${l.ts}-${Math.random()}`, ...l }, ...g].slice(0, 60));
      },
      onLineEnd: () => setTimeout(() => setLine((l) => (l && Date.now() - l.ts > 2500 ? null : l)), 2600),
      onStatus: setStatus,
      onEmotion: setEmotion,
    });
    director.start();
    return () => director.stop();
  }, [director]);

  // Background voice warm-up on desktop after the character is on screen.
  useEffect(() => {
    if (!autoVoice || detectDevice().mobile) return undefined;
    const t = setTimeout(() => voiceEngine.init().catch(() => {}), 2500);
    return () => clearTimeout(t);
  }, [autoVoice]);

  const enterLive = useCallback(() => {
    voiceEngine.unlock();
    voiceEngine.init().catch(() => {});
    voiceEngine.setMuted(false);
    director.muted = false;
    setMuted(false);
    setLive(true);
  }, [director]);

  const toggleMute = useCallback(() => {
    const m = !director.muted;
    director.muted = m;
    voiceEngine.setMuted(m);
    if (m) voiceEngine.stop();
    setMuted(m);
  }, [director]);

  const driver = useCallback(() => director.frame(), [director]);

  return { ...feed, director, line, status, emotion, log, lastEvent, voice, live, muted, enterLive, toggleMute, driver };
}
