import { api } from "@/lib/api";

/**
 * PumpLaunchProvider interface: prepareLaunch() / launch() / getLaunchStatus() / getMintAddress()
 * Pump.fun has no documented first-party HTTP create endpoint; the supported paths are:
 *  - PumpPortal local-transaction API (documented third-party): server builds the create tx, the creator's wallet signs it.
 *  - Official pump.fun/create UI handoff, then link the resulting mint.
 */
export const MockPumpLaunchProvider = {
  id: "mock",
  label: "Simulated launch",
  async prepareLaunch({ tokenId }) {
    return { tokenId };
  },
  async launch(prepared, { launchMarketCap = 30000 } = {}) {
    const b = await api.launchMock(prepared.tokenId, launchMarketCap);
    return { mint: b.token.mint, status: "live" };
  },
  getLaunchStatus: (tokenId) => api.launchStatus(tokenId),
  getMintAddress: async (tokenId) => (await api.launchStatus(tokenId)).mint,
};

export const PumpPortalLaunchProvider = {
  id: "pumpportal",
  label: "Launch on Pump.fun (wallet-signed)",
  async prepareLaunch({ tokenId, publicKey, devBuySol = 0 }) {
    const { Keypair } = await import("@solana/web3.js");
    const mintKeypair = Keypair.generate();
    const res = await api.launchPrepare({ tokenId, publicKey, mint: mintKeypair.publicKey.toBase58(), devBuySol, slippage: 10, priorityFee: 0.0005 });
    return { tokenId, mintKeypair, tx: res.tx, metadataUri: res.metadataUri };
  },
  async launch(prepared, { provider }) {
    const { VersionedTransaction } = await import("@solana/web3.js");
    const bytes = Uint8Array.from(atob(prepared.tx), (c) => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(bytes);
    tx.sign([prepared.mintKeypair]);
    const { signature } = await provider.signAndSendTransaction(tx);
    const mint = prepared.mintKeypair.publicKey.toBase58();
    const r = await api.launchConfirm({ tokenId: prepared.tokenId, signature, mint });
    return { mint, signature, status: r.status || r.token?.status || "pending" };
  },
  getLaunchStatus: (tokenId) => api.launchStatus(tokenId),
  getMintAddress: async (tokenId) => {
    const s = await api.launchStatus(tokenId);
    return s.mint || s.pendingMint;
  },
};

export const PumpFunHandoffProvider = {
  id: "handoff",
  label: "Official Pump.fun create page",
  createUrl: "https://pump.fun/create",
  async prepareLaunch({ tokenId }) {
    return { tokenId };
  },
  async launch(prepared, { mint }) {
    const b = await api.launchLink(prepared.tokenId, mint);
    return { mint: b.token.mint, status: "live" };
  },
  getLaunchStatus: (tokenId) => api.launchStatus(tokenId),
  getMintAddress: async (tokenId) => (await api.launchStatus(tokenId)).mint,
};
