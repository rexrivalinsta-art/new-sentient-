import { Link, NavLink } from "react-router-dom";
import { useWallet } from "@/lib/wallet";
import { shortAddr } from "@/lib/format";
import { toast } from "sonner";

const nav = [["/how-it-works", "How It Works"], ["/explore", "Explore"], ["/create", "Create"], ["/dev/character-lab", "Character Lab"]];

export function Header() {
  const { publicKey, connect, disconnect, walletName } = useWallet();
  const onWallet = async () => {
    try {
      if (publicKey) await disconnect();
      else await connect();
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <header className="fixed top-0 inset-x-0 z-50 h-14 bg-[#050608]/85 backdrop-blur-md border-b border-[#14181f]">
      <div className="h-full max-w-[1600px] mx-auto px-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" data-testid="nav-logo" className="flex items-center gap-2.5">
            <span className="w-2 h-2 bg-[#ff2e51] live-dot" />
            <span className="font-display font-black tracking-tight text-base">SENTIPAD<span className="text-slate-500">.FUN</span></span>
          </Link>
          <span data-testid="header-tagline" className="hidden lg:inline-block pl-3 border-l border-[#1e2430] font-mono text-[10px] tracking-[0.3em] text-slate-500 uppercase">Every token is sentient</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          {nav.map(([to, label]) => (
            <NavLink key={to} to={to} data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
              className={({ isActive }) => `font-mono text-[11px] tracking-[0.2em] uppercase transition-colors ${isActive ? "text-white" : "text-slate-500 hover:text-slate-200"}`}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/create" data-testid="nav-create-button" className="md:hidden font-mono text-[11px] tracking-widest px-3 py-2 border border-[#1e2430]">CREATE</Link>
          <button data-testid="wallet-connect-button" onClick={onWallet}
            className="font-mono text-[11px] tracking-[0.15em] px-3 md:px-4 py-2 border border-[#1e2430] hover:border-[#00f0ff]/60 bg-[#0d0f12] transition-colors">
            {publicKey ? `${walletName || "WALLET"} · ${shortAddr(publicKey)}` : "CONNECT WALLET"}
          </button>
        </div>
      </div>
      <nav className="md:hidden flex border-t border-[#14181f] bg-[#050608]">
        {nav.map(([to, label]) => (
          <NavLink key={to} to={to} data-testid={`mnav-${label.toLowerCase().replace(/\s/g, "-")}`}
            className={({ isActive }) => `flex-1 text-center py-2 font-mono text-[10px] tracking-widest uppercase ${isActive ? "text-white" : "text-slate-500"}`}>{label}</NavLink>
        ))}
      </nav>
    </header>
  );
}
