import { useEffect, useRef, useState } from "react";
import { WS_BASE } from "@/lib/api";

/** Client side of MarketDataProvider: one socket per viewer to the multiplexing backend hub. */
export function useMarketFeed(mint, { onEvent } = {}) {
  const [state, setState] = useState(null);
  const [memory, setMemory] = useState(null);
  const [history, setHistory] = useState([]);
  const [trades, setTrades] = useState([]);
  const [feed, setFeed] = useState("connecting");
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    if (!mint) return undefined;
    let ws;
    let closed = false;
    let retry = 1000;
    let pingT;
    const seen = new Set();

    const connect = () => {
      ws = new WebSocket(`${WS_BASE}/${mint}`);
      ws.onopen = () => {
        retry = 1000;
        pingT = setInterval(() => ws.readyState === 1 && ws.send("ping"), 25000);
      };
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.type === "hello") {
          setState(msg.state);
          setMemory(msg.memory);
          setHistory(msg.history || []);
          setTrades(msg.state?.recentTrades || []);
          setFeed(msg.feed === "idle" ? "connecting" : msg.feed);
        } else if (msg.type === "state") {
          setState(msg.state);
          setMemory(msg.memory);
          if (msg.state?.marketCap) setHistory((h) => [...h.slice(-400), { t: msg.state.lastUpdated, mcap: msg.state.marketCap }]);
        } else if (msg.type === "trade") {
          if (seen.has(msg.trade.signature)) return;
          seen.add(msg.trade.signature);
          setTrades((t) => [msg.trade, ...t].slice(0, 60));
        } else if (msg.type === "event") {
          cb.current?.(msg.event);
        } else if (msg.type === "feed") {
          setFeed(msg.status);
        } else if (msg.type === "error") {
          setFeed("error");
        }
      };
      ws.onclose = () => {
        clearInterval(pingT);
        if (closed) return;
        setFeed("reconnecting");
        setTimeout(connect, retry);
        retry = Math.min(retry * 2, 15000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearInterval(pingT);
      ws?.close();
    };
  }, [mint]);

  return { state, memory, history, trades, feed };
}
