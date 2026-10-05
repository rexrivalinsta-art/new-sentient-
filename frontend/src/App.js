import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/Header";
import { WalletProvider } from "@/lib/wallet";
import Home from "@/pages/Home";
import Create from "@/pages/Create";
import TokenPage from "@/pages/TokenPage";
import Explore from "@/pages/Explore";
import CharacterLab from "@/pages/CharacterLab";

function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#050608] text-slate-100">
          <Header />
          <main className="pt-[88px] md:pt-14">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<Create />} />
              <Route path="/token/:mint" element={<TokenPage />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/dev/character-lab" element={<CharacterLab />} />
            </Routes>
          </main>
          <footer className="border-t border-[#13161d] mt-24 px-4 md:px-8 py-8 max-w-[1600px] mx-auto font-mono text-[10px] tracking-widest text-slate-600 flex flex-col md:flex-row justify-between gap-2">
            <span>CHARACTERS ARE ENTERTAINMENT. NOT FINANCIAL ADVICE. COMMENTARY USES VERIFIED MARKET DATA ONLY.</span>
            <span>SENTIPAD.FUN · LAUNCHPAD FOR SENTIENT BEINGS · LOCAL VOICE · REAL-TIME 3D</span>
          </footer>
        </div>
        <Toaster theme="dark" position="bottom-right" />
      </BrowserRouter>
    </WalletProvider>
  );
}

export default App;
