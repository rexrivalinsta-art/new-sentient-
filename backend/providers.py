import asyncio
import base64
import json
import struct
import logging
import os
import random
import time
import uuid

import httpx
import websockets

from market import SUPPLY, MarketEngine

log = logging.getLogger("providers")

SOLANA_WS_URL = os.environ["SOLANA_WS_URL"]
DEXSCREENER = "https://api.dexscreener.com/latest/dex/tokens/"
COINGECKO = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"


class SolPrice:
    value = 150.0
    updated = 0.0

    @classmethod
    async def refresh(cls):
        if time.time() - cls.updated < 120:
            return cls.value
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(COINGECKO)
                cls.value = float(r.json()["solana"]["usd"])
                cls.updated = time.time()
        except Exception as e:
            log.warning(f"sol price refresh failed: {e}")
        return cls.value


def _fake_wallet(rng):
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    return "".join(rng.choice(alphabet) for _ in range(44))


class Hub:
    """One provider subscription per mint, broadcast normalized messages to all viewers."""

    def __init__(self, on_events, on_snapshot):
        self.engines = {}
        self.clients = {}
        self.sim = {}
        self.real = set()
        self.on_events = on_events
        self.on_snapshot = on_snapshot
        self.feed = SolanaPumpFeed(self)
        self.feed_status = "idle"

    # ----- client mgmt -----
    async def join(self, mint, ws):
        self.clients.setdefault(mint, set()).add(ws)
        if mint in self.real:
            await self.feed.subscribe(mint)

    async def leave(self, mint, ws):
        s = self.clients.get(mint, set())
        s.discard(ws)
        if not s and mint in self.real:
            await self.feed.unsubscribe(mint)

    async def broadcast(self, mint, msg):
        dead = []
        data = json.dumps(msg, default=str)
        for ws in list(self.clients.get(mint, ())):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.get(mint, set()).discard(ws)

    def engine(self, mint):
        return self.engines.get(mint)

    def register(self, engine, simulated, autopilot=False):
        self.engines[engine.mint] = engine
        if simulated:
            self.sim[engine.mint] = {"autopilot": autopilot, "drift": random.uniform(-0.2, 0.6), "busy": False}
        else:
            self.real.add(engine.mint)

    async def ingest(self, mint, trade):
        eng = self.engines.get(mint)
        if not eng:
            return
        evs = eng.apply_trade(trade)
        if not evs:
            return
        await self.broadcast(mint, {"type": "trade", "trade": trade})
        await self.emit(mint, evs)

    async def emit(self, mint, evs):
        eng = self.engines[mint]
        for ev in evs:
            await self.broadcast(mint, {"type": "event", "event": ev})
        await self.broadcast(mint, {"type": "state", "state": eng.state(), "memory": eng.memory_view()})
        await self.on_events(mint, evs)

    # ----- simulation (MockMarketDataProvider) -----
    def make_trade(self, eng, side, sol, rng=random):
        sol = round(max(sol, 0.01), 3)
        mcap = eng.mcap or 30000
        usd = sol * eng.sol_usd
        impact = usd * 1.9 / mcap
        new_mcap = max(4000, mcap * (1 + impact) if side == "buy" else mcap * (1 - impact))
        price = new_mcap / SUPPLY
        return {"signature": "SIM" + uuid.uuid4().hex, "timestamp": time.time(), "side": side,
                "wallet": _fake_wallet(rng), "solAmount": sol, "tokenAmount": round(usd / price),
                "priceAfter": price, "marketCapAfter": round(new_mcap, 2), "simulated": True}

    def sol_for_target(self, eng, target, n):
        mcap = eng.mcap or 30000
        ratio = (target / mcap) ** (1 / n)
        return abs(ratio - 1) * mcap / 1.9 / eng.sol_usd

    async def run_sequence(self, mint, steps):
        """steps: list of (side, sol, delay_before)"""
        eng = self.engines[mint]
        st = self.sim.get(mint)
        if st:
            st["busy"] = True
        try:
            for side, sol, delay in steps:
                if delay:
                    await asyncio.sleep(delay)
                if callable(sol):
                    sol = sol()
                await self.ingest(mint, self.make_trade(eng, side, sol))
        finally:
            if st:
                st["busy"] = False

    def to_target_steps(self, mint, target, n=4, gap=0.9):
        eng = self.engines[mint]
        side = "buy" if target >= (eng.mcap or 0) else "sell"
        steps = []
        for i in range(n):
            steps.append((side, (lambda i=i: self.sol_for_target(eng, target, n - i)), gap if i else 0))
        return steps

    async def simulate(self, mint, action, value=None):
        eng = self.engines[mint]
        thr = eng.whale_threshold()
        r = random.uniform
        m = eng.mcap or 30000
        ath = eng.memory["athMarketCap"] or m
        seqs = {
            "small_buy": [("buy", r(0.1, 0.5), 0)],
            "whale_buy": [("buy", thr * r(1.3, 2.2), 0)],
            "small_sell": [("sell", r(0.1, 0.5), 0)],
            "whale_sell": [("sell", thr * r(1.3, 2.0), 0)],
            "buy_streak": [("buy", r(0.2, 0.9), 0 if i == 0 else r(1.2, 2.2)) for i in range(5)],
            "sell_streak": [("sell", r(0.2, 0.9), 0 if i == 0 else r(1.2, 2.2)) for i in range(5)],
        }
        if action in seqs:
            steps = seqs[action]
        elif action == "rally":
            steps = self.to_target_steps(mint, m * 1.2, 4)
        elif action == "dump":
            steps = self.to_target_steps(mint, m * 0.8, 4)
        elif action == "new_ath":
            steps = self.to_target_steps(mint, max(ath * 1.12, 100500 if ath < 100000 else ath * 1.12), 4)
        elif action == "recovery":
            if m > ath * 0.8:
                await self.run_sequence(mint, self.to_target_steps(mint, ath * 0.68, 3, 0.6))
                await asyncio.sleep(1.5)
            steps = self.to_target_steps(mint, max(eng.memory["lowSinceAth"] or eng.mcap, 1) * 1.3, 3)
        elif action == "set_mcap" and value:
            steps = self.to_target_steps(mint, float(value), 3, 0.7)
        elif action == "quiet":
            await self.emit(mint, [eng.force_quiet()])
            return
        elif action == "lock_demo":
            asyncio.create_task(self.lock_demo(mint))
            return
        else:
            return
        await self.run_sequence(mint, steps)

    async def lock_demo(self, mint):
        eng = self.engines[mint]
        eng.__init__(mint, eng.sol_usd, 30000)
        await self.emit(mint, [eng.launch_event()])
        gap = 6.5
        await asyncio.sleep(gap)
        await self.run_sequence(mint, [("buy", 0.2, 0)])
        await asyncio.sleep(gap)
        await self.run_sequence(mint, [("buy", 0.5, 0)])
        await asyncio.sleep(gap)
        await self.run_sequence(mint, [("buy", 4.0, 0)])
        await asyncio.sleep(gap)
        await self.run_sequence(mint, self.to_target_steps(mint, 52000, 2, 1.0))
        await asyncio.sleep(gap)
        await self.run_sequence(mint, [("sell", 1.0, 0)])
        await asyncio.sleep(gap)
        await self.run_sequence(mint, self.to_target_steps(mint, 100500, 4, 1.2))
        await asyncio.sleep(gap + 2)
        await self.run_sequence(mint, self.to_target_steps(mint, 72000, 3, 1.2))
        await asyncio.sleep(gap + 2)
        await self.run_sequence(mint, self.to_target_steps(mint, 91000, 3, 1.2))

    async def autopilot_loop(self):
        while True:
            await asyncio.sleep(random.uniform(3, 8))
            for mint, st in list(self.sim.items()):
                if not st["autopilot"] or st["busy"] or random.random() < 0.45:
                    continue
                eng = self.engines[mint]
                if random.random() < 0.08:
                    st["drift"] = random.uniform(-0.4, 0.6)
                side = "buy" if random.random() < 0.5 + st["drift"] * 0.25 else "sell"
                sol = random.choice([random.uniform(0.05, 0.6)] * 6 + [random.uniform(0.6, 2.0)] * 2 + [eng.whale_threshold() * random.uniform(1.1, 1.8)])
                if (eng.mcap or 0) > 900000 and side == "buy" and random.random() < 0.5:
                    side = "sell"
                if (eng.mcap or 0) < 9000:
                    side = "buy"
                await self.ingest(mint, self.make_trade(eng, side, sol))

    async def indexer_loop(self):
        """Poll DexScreener for watched real mints (covers PumpSwap after graduation). Ingests state, never trades."""
        while True:
            await asyncio.sleep(30)
            for mint in list(self.real):
                if not self.clients.get(mint):
                    continue
                eng = self.engines.get(mint)
                if not eng or time.time() - eng.last_trade_ts < 25:
                    continue
                snap = await dexscreener_snapshot(mint)
                if snap and snap.get("marketCap"):
                    evs = eng.apply_price_update(float(snap["marketCap"]), snap.get("priceUsd"))
                    if evs:
                        await self.emit(mint, evs)
                    else:
                        await self.broadcast(mint, {"type": "state", "state": eng.state(), "memory": eng.memory_view()})

    async def tick_loop(self):
        last_snap = 0
        while True:
            await asyncio.sleep(5)
            sol = await SolPrice.refresh()
            for mint, eng in list(self.engines.items()):
                if mint in self.real:
                    eng.sol_usd = sol
                evs = eng.tick()
                if evs and (self.clients.get(mint) or mint in self.sim):
                    await self.emit(mint, evs)
            if time.time() - last_snap > 60:
                last_snap = time.time()
                for mint, eng in list(self.engines.items()):
                    if eng.mcap:
                        await self.on_snapshot(mint, eng)


B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    pad = len(b) - len(b.lstrip(b"\0"))
    return "1" * pad + out


TRADE_EVENT_DISC = bytes.fromhex("bddb7fd34ee661ee")


def parse_trade_event(raw: bytes):
    """Pump.fun bonding-curve TradeEvent (Anchor event emitted in program logs)."""
    if raw[:8] != TRADE_EVENT_DISC or len(raw) < 129:
        return None
    o = 8
    mint = b58encode(raw[o:o + 32]); o += 32
    sol, tok = struct.unpack_from("<QQ", raw, o); o += 16
    is_buy = raw[o]; o += 1
    user = b58encode(raw[o:o + 32]); o += 32
    ts, vsol, vtok = struct.unpack_from("<qQQ", raw, o)
    if not vtok:
        return None
    mcap_sol = (vsol / 1e9) / (vtok / 1e6) * 1e9
    return {"mint": mint, "sol": sol / 1e9, "tokens": tok / 1e6, "buy": bool(is_buy), "wallet": user, "mcapSol": mcap_sol}


class SolanaPumpFeed:
    """SolanaPumpMarketDataProvider: one shared Solana RPC websocket; logsSubscribe per watched mint; parses Pump TradeEvents.
    Graduated (PumpSwap) tokens are additionally tracked via DexScreener polling in Hub.indexer_loop."""

    def __init__(self, hub):
        self.hub = hub
        self.subs = {}
        self.sub_ids = {}
        self.mint_sub = {}
        self.ws = None
        self.task = None
        self.req = 100
        self.pending = {}

    async def subscribe(self, mint):
        self.subs[mint] = self.subs.get(mint, 0) + 1
        if not self.task:
            self.task = asyncio.create_task(self.run())
        elif self.ws and self.subs[mint] == 1:
            await self._sub(mint)

    async def unsubscribe(self, mint):
        if mint not in self.subs:
            return
        self.subs[mint] -= 1
        if self.subs[mint] <= 0:
            self.subs.pop(mint)
            sid = self.mint_sub.pop(mint, None)
            if sid is not None and self.ws:
                self.sub_ids.pop(sid, None)
                await self._send({"jsonrpc": "2.0", "id": self._id(), "method": "logsUnsubscribe", "params": [sid]})

    def _id(self):
        self.req += 1
        return self.req

    async def _sub(self, mint):
        rid = self._id()
        self.pending[rid] = mint
        await self._send({"jsonrpc": "2.0", "id": rid, "method": "logsSubscribe", "params": [{"mentions": [mint]}, {"commitment": "confirmed"}]})

    async def _send(self, msg):
        try:
            if self.ws:
                await self.ws.send(json.dumps(msg))
        except Exception as e:
            log.warning(f"rpc ws send failed: {e}")

    async def _status(self, status):
        self.hub.feed_status = status
        for mint in list(self.subs):
            await self.hub.broadcast(mint, {"type": "feed", "status": status})

    async def run(self):
        backoff = 1
        while True:
            if not self.subs:
                await asyncio.sleep(2)
                continue
            try:
                async with websockets.connect(SOLANA_WS_URL, ping_interval=20, max_size=2**22) as ws:
                    self.ws = ws
                    self.pending = {}
                    self.sub_ids = {}
                    self.mint_sub = {}
                    backoff = 1
                    for mint in list(self.subs):
                        await self._sub(mint)
                    await self._status("live")
                    async for raw in ws:
                        msg = json.loads(raw)
                        if "id" in msg and msg.get("id") in self.pending:
                            mint = self.pending.pop(msg["id"])
                            if "result" in msg:
                                self.sub_ids[msg["result"]] = mint
                                self.mint_sub[mint] = msg["result"]
                            continue
                        params = msg.get("params") or {}
                        mint = self.sub_ids.get(params.get("subscription"))
                        val = (params.get("result") or {}).get("value") or {}
                        if not mint or val.get("err"):
                            continue
                        for line in val.get("logs") or []:
                            if not line.startswith("Program data: "):
                                continue
                            try:
                                ev = parse_trade_event(base64.b64decode(line[14:]))
                            except Exception:
                                ev = None
                            if not ev or ev["mint"] != mint or ev["sol"] <= 0:
                                continue
                            eng = self.hub.engines.get(mint)
                            if not eng:
                                continue
                            mcap = ev["mcapSol"] * eng.sol_usd
                            await self.hub.ingest(mint, {
                                "signature": val.get("signature"), "timestamp": time.time(), "side": "buy" if ev["buy"] else "sell",
                                "wallet": ev["wallet"], "solAmount": round(ev["sol"], 4), "tokenAmount": ev["tokens"],
                                "priceAfter": mcap / SUPPLY, "marketCapAfter": round(mcap, 2), "pool": "pump", "simulated": False})
            except Exception as e:
                log.warning(f"solana rpc ws error: {e}")
            self.ws = None
            await self._status("reconnecting")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


async def dexscreener_snapshot(mint):
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(DEXSCREENER + mint)
            pairs = (r.json() or {}).get("pairs") or []
            if not pairs:
                return None
            p = max(pairs, key=lambda x: (x.get("liquidity") or {}).get("usd") or 0)
            return {"marketCap": p.get("marketCap") or p.get("fdv"), "priceUsd": float(p.get("priceUsd") or 0) or None,
                    "dex": p.get("dexId"), "pairAddress": p.get("pairAddress")}
    except Exception as e:
        log.warning(f"dexscreener failed: {e}")
        return None
