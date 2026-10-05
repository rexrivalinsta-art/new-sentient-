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

## Backlog
- P1: Kokoro WebGPU path for faster voice on capable desktops; pre-synthesis of queued lines
- P1: Holder count via free source; PumpSwap trade-level parsing (currently state-level via DexScreener)
- P2: Character profile editing UI on token page; per-token voice/avatar changes by creator wallet
- P2: Split server.py into routers; creator ownership checks
