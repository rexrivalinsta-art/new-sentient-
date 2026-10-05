# ALIVE.FUN — Living Pump.fun Token Characters

## Original problem statement (summary)
Pump.fun-based launchpad where every token is a LIVE AI 3D character (VRM, Three.js) with local Kokoro voice, Web Audio lip sync, procedural idle/emotion animation, verified market awareness, event aggregation, memory (ATH, drawdowns, whales, streaks) and personality-driven humor. Must be near-zero operating cost (client-side TTS/AI, template dialogue default, optional WebLLM). Pages: /, /create, /token/:mint, /explore, /dev/character-lab.

## User choices
- Wallet: injected Solana wallet (Phantom/Solflare), connect only
- Market data: free sources only
- WebLLM: fully functional opt-in
- Focus: real Pump.fun launch + 3D AI character

## Architecture
- Backend FastAPI (server.py, market.py MarketEngine, providers.py Hub/Simulator/SolanaPumpFeed, registry.py, personalities.py), MongoDB collections: users, tokens, character_profiles, character_memory, market_snapshots, market_events, avatars, files
- Hub multiplexes one provider subscription per mint → broadcasts normalized trade/event/state over WS /api/ws/{mint}
- Real market feed: Solana public RPC logsSubscribe (Pump TradeEvent parsing) + DexScreener polling (PumpSwap/graduated); PumpPortal trade WS requires paid key so not used
- Launch: PumpLaunchProvider (Mock / PumpPortal local-tx wallet-signed / official pump.fun handoff + link mint). Metadata JSON served at /api/tokens/{id}/metadata.json, image via Emergent object storage
- Frontend: StageRenderer (Three.js, ACES, key/fill/rim lights, env, shadows, framing, visibility throttle), CharacterAnimator (9 emotion poses, blink, saccades, breathing, sway), LRU VRM cache (3), Kokoro web worker (q8 wasm), VoiceEngine analyser lip sync, SpeechDirector (priority queue, EventAggregator, idle banter 15–35s, interruption), DialogueEngine (templates + memory callbacks, 12 personalities), AITextEnhancer (native AI → WebLLM → template, number verification + integrity filter)
- Avatar registry: 1,262 CC0 VRMs (100Avatars R1–R3, ToxSam, Halloween Rising, Xmas Chibis, Grifters Squaddies) with license metadata; 8 featured

## Implemented (2026-06)
- All 5 pages, 8 seeded simulated tokens with autopilot, Character Lab with all simulations + $LOCK demo scenario
- Create flow: generate/reroll character from registry, image upload, launch dialog with immutable warning, 3 launch methods
- Verified: real-mint link → live trades via public RPC (tested), PumpPortal create tx builds successfully
- Testing agent iteration_1: backend 27/27, frontend all flows passing

## Iteration 2 (2026-06)
- Avatar registry switched to 3,000 VIPE Heroes (CC BY 4.0, full expressions joy/angry/sorrow/fun + visemes); legacy low-poly CC0 collections disabled
- Backend VRM proxy + object-storage cache (/api/avatar-files/{id}/model), startup pre-warm for live/featured avatars
- Attribution on stage + identity panel
- Cloud brain: Emergent LLM gemini-3.8-flash rewrite per event (shared per token, rate-limited, number/integrity validated, template fallback); lab brain selector cloud/local/template
- Import existing token by mint or pump.fun/gmgn/dexscreener URL (DexScreener metadata + Solana RPC live trades)
- Emotion pose offsets fixed (celebrate arms up etc.)
- Testing iteration_2: all passing

## Iteration 3 (2026-06) — all real, no simulated tokens
- Removed all seeded simulated tokens; /api/launch/mock disabled (410); Create launch = Pump.fun wallet-signed or official pump.fun handoff only
- Feed auto-populated with REAL trending pump.fun tokens (DexScreener free boosts/profiles), each given a character; top-up every 30 min to 12
- DexScreener batched polling for all real tokens (45s): mcap, 1h/24h change, 24h volume; Solana RPC live trades on viewed tokens
- Character Lab remains a dev-only simulator (/dev/character-lab)

## Iteration 4 (2026-06)
- Removed auto-imported trending tokens and the top-up loop: feed shows ONLY tokens launched or deliberately linked/imported by a user here (importedBy="user")
- Home: honest empty state + "PREVIEW · NO TOKEN YET" idle character when no tokens exist

## Backlog
- P1: Kokoro WebGPU path for faster voice on capable desktops; pre-synthesis of queued lines
- P1: Holder count via free source; PumpSwap trade-level parsing (currently state-level via DexScreener)
- P2: Character profile editing UI on token page; per-token voice/avatar changes by creator wallet
- P2: Split server.py into routers; creator ownership checks
