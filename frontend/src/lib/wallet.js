import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const WalletCtx = createContext(null);

const getProvider = () => {
  if (window.phantom?.solana?.isPhantom) return { name: "Phantom", p: window.phantom.solana };
  if (window.solflare?.isSolflare) return { name: "Solflare", p: window.solflare };
  if (window.solana) return { name: "Wallet", p: window.solana };
  return null;
};

export function WalletProvider({ children }) {
  const [publicKey, setPublicKey] = useState(null);
  const [walletName, setWalletName] = useState(null);

  useEffect(() => {
    const w = getProvider();
    if (!w) return;
    w.p.connect?.({ onlyIfTrusted: true }).then((r) => {
      const pk = (r?.publicKey || w.p.publicKey)?.toString();
      if (pk) { setPublicKey(pk); setWalletName(w.name); }
    }).catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    const w = getProvider();
    if (!w) {
      window.open("https://phantom.app/", "_blank", "noopener");
      throw new Error("No Solana wallet found. Install Phantom or Solflare.");
    }
    const r = await w.p.connect();
    const pk = (r?.publicKey || w.p.publicKey)?.toString();
    setPublicKey(pk);
    setWalletName(w.name);
    api.wallet(pk);
    return pk;
  }, []);

  const disconnect = useCallback(async () => {
    await getProvider()?.p.disconnect?.();
    setPublicKey(null);
  }, []);

  const provider = () => getProvider()?.p;

  return <WalletCtx.Provider value={{ publicKey, walletName, connect, disconnect, provider }}>{children}</WalletCtx.Provider>;
}

export const useWallet = () => useContext(WalletCtx);
