export const fmtUsd = (v) => {
  if (v == null || isNaN(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `$${v.toFixed(0)}`;
};

export const fmtPrice = (v) => {
  if (v == null) return "—";
  if (v >= 1) return `$${v.toFixed(4)}`;
  const s = v.toExponential(3);
  return v > 1e-4 ? `$${v.toFixed(6)}` : `$${s}`;
};

export const fmtSol = (v) => (v == null ? "—" : `${v >= 10 ? v.toFixed(1) : v.toFixed(v >= 1 ? 2 : 3)} SOL`);

export const fmtPct = (v) => (v == null || isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export const pctChange = (now, then) => (now && then ? (now / then - 1) * 100 : null);

export const shortAddr = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—");

export const timeAgo = (ts) => {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const roundNice = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

export const spokenUsd = (v) => {
  if (v == null) return "unknown";
  if (v >= 1e9) return `${roundNice(v / 1e9)} billion`;
  if (v >= 1e6) return `${roundNice(v / 1e6)} million`;
  if (v >= 1e3) return `${Math.round(v / 1e3)} K`;
  return `${Math.round(v)} dollars`;
};

export const spokenSol = (v) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} sol`;

export const spokenMinutes = (m) => {
  if (m < 1) return "moments";
  if (m < 2) return "a minute";
  if (m < 60) return `${Math.round(m)} minutes`;
  const h = m / 60;
  return h < 2 ? "an hour" : `${Math.round(h)} hours`;
};
