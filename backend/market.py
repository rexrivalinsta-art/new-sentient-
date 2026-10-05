import statistics
import time
import uuid
from collections import deque

SUPPLY = 1_000_000_000

THRESHOLDS = {
    "streak_levels": [4, 7, 12, 20],
    "whale_floor_min_sol": 0.75,
    "whale_floor_mcap_pct": 0.012,
    "whale_median_mult": 5.0,
    "surge_pct": 15.0,
    "drop_pct": -15.0,
    "surge_cooldown": 75,
    "volume_spike_mult": 3.0,
    "volume_spike_min_sol": 3.0,
    "volume_cooldown": 120,
    "drawdown_levels": [25, 40, 60],
    "recovery_from_low_pct": 18.0,
    "quiet_after_s": 40,
    "quiet_cooldown": 70,
    "ath_cooldown": 25,
    "milestones": [10e3, 25e3, 50e3, 75e3, 100e3, 150e3, 250e3, 500e3, 750e3, 1e6, 2.5e6, 5e6, 10e6, 25e6, 50e6, 100e6],
}

PRIORITY = {
    "TOKEN_LAUNCHED": 5, "NEW_ATH": 5, "MARKET_CAP_MILESTONE": 5, "LARGE_BUY": 4, "LARGE_SELL": 4,
    "PRICE_SURGE": 4, "PRICE_DROP": 4, "ATH_DRAWDOWN": 4, "RECOVERY": 4, "BUY_STREAK": 3, "SELL_STREAK": 3,
    "VOLUME_SPIKE": 3, "BUY": 1, "SELL": 1, "QUIET_MARKET": 0,
}

SIGNIFICANT = {"TOKEN_LAUNCHED", "NEW_ATH", "MARKET_CAP_MILESTONE", "LARGE_BUY", "LARGE_SELL", "PRICE_SURGE",
               "PRICE_DROP", "ATH_DRAWDOWN", "RECOVERY", "VOLUME_SPIKE"}


def now():
    return time.time()


class MarketEngine:
    """Verified market state + event detection + derived character memory for one mint."""

    def __init__(self, mint, sol_usd=150.0, launch_mcap=None, launch_ts=None, memory=None):
        self.mint = mint
        self.sol_usd = sol_usd
        self.trades = deque(maxlen=400)
        self.history = deque(maxlen=3000)  # (ts, price, mcap)
        self.seen = deque(maxlen=2000)
        self.seen_set = set()
        self.cool = {}
        self.consecutive_buys = 0
        self.consecutive_sells = 0
        self.streak_start = None
        self.last_trade_ts = now()
        self.price = (launch_mcap / SUPPLY) if launch_mcap else None
        self.mcap = launch_mcap
        self.holder_count = None
        self.launch_ts = launch_ts or now()
        m = memory or {}
        self.memory = {
            "launchMarketCap": m.get("launchMarketCap", launch_mcap),
            "athMarketCap": m.get("athMarketCap", launch_mcap),
            "athTimestamp": m.get("athTimestamp", self.launch_ts),
            "previousAth": m.get("previousAth"),
            "largestBuy": m.get("largestBuy"),
            "largestSell": m.get("largestSell"),
            "milestonesReached": m.get("milestonesReached", []),
            "lastMilestone": m.get("lastMilestone"),
            "highlights": m.get("highlights", []),
            "drawdownLevel": m.get("drawdownLevel", 0),
            "lowSinceAth": m.get("lowSinceAth"),
            "recovering": m.get("recovering", False),
            "walletCounts": m.get("walletCounts", {}),
            "eventCount": m.get("eventCount", 0),
        }
        if launch_mcap:
            self.history.append((now(), self.price, launch_mcap))

    # ---------- derived ----------
    def _value_ago(self, seconds):
        cutoff = now() - seconds
        val = None
        for ts, p, _ in self.history:
            if ts <= cutoff:
                val = p
            else:
                break
        if val is None and self.history and now() - self.history[0][0] >= seconds * 0.5:
            val = self.history[0][1]
        return val

    def _volume(self, seconds):
        cutoff = now() - seconds
        return round(sum(t["solAmount"] for t in self.trades if t["timestamp"] >= cutoff), 4)

    def _largest(self, side, seconds=300):
        cutoff = now() - seconds
        c = [t for t in self.trades if t["side"] == side and t["timestamp"] >= cutoff]
        return max(c, key=lambda t: t["solAmount"]) if c else None

    def whale_threshold(self):
        mcap_sol = (self.mcap or 0) / max(self.sol_usd, 1)
        floor = max(THRESHOLDS["whale_floor_min_sol"], min(mcap_sol * THRESHOLDS["whale_floor_mcap_pct"], 25))
        sizes = [t["solAmount"] for t in list(self.trades)[-40:]]
        if len(sizes) >= 8:
            med = statistics.median(sizes)
            floor = max(floor, min(med * THRESHOLDS["whale_median_mult"], 60))
        return round(floor, 3)

    def state(self):
        last = self.trades[-1] if self.trades else None
        return {
            "mint": self.mint, "price": self.price, "marketCap": self.mcap,
            "athMarketCap": self.memory["athMarketCap"],
            "price1mAgo": self._value_ago(60), "price5mAgo": self._value_ago(300), "price1hAgo": self._value_ago(3600),
            "volume1m": self._volume(60), "volume5m": self._volume(300), "volume1h": self._volume(3600),
            "holderCount": self.holder_count, "lastTrade": last, "recentTrades": list(self.trades)[-25:][::-1],
            "consecutiveBuys": self.consecutive_buys, "consecutiveSells": self.consecutive_sells,
            "largestBuy5m": self._largest("buy"), "largestSell5m": self._largest("sell"),
            "launchTimestamp": self.launch_ts, "lastUpdated": now(), "solUsd": self.sol_usd,
            "whaleThresholdSol": self.whale_threshold(),
        }

    def memory_view(self):
        m = {k: v for k, v in self.memory.items() if k != "walletCounts"}
        m["recurringWallets"] = [{"wallet": w, "trades": c} for w, c in sorted(self.memory["walletCounts"].items(), key=lambda x: -x[1]) if c >= 3][:5]
        m["minutesSinceLaunch"] = round((now() - self.launch_ts) / 60, 1)
        ath = self.memory["athMarketCap"]
        m["drawdownFromAth"] = round((1 - self.mcap / ath) * 100, 1) if ath and self.mcap else 0
        m["minutesSinceAth"] = round((now() - (self.memory["athTimestamp"] or now())) / 60, 1)
        m["consecutiveBuys"] = self.consecutive_buys
        m["consecutiveSells"] = self.consecutive_sells
        return m

    def history_points(self, limit=300):
        pts = list(self.history)[-limit:]
        return [{"t": ts, "mcap": mc} for ts, _, mc in pts]

    # ---------- events ----------
    def _cooldown(self, key, seconds):
        t = now()
        if t - self.cool.get(key, 0) < seconds:
            return False
        self.cool[key] = t
        return True

    def _event(self, etype, data):
        ev = {"id": uuid.uuid4().hex[:12], "type": etype, "priority": PRIORITY[etype], "timestamp": now(),
              "mint": self.mint, "data": data, "marketCap": self.mcap, "athMarketCap": self.memory["athMarketCap"]}
        if etype in SIGNIFICANT:
            self.memory["highlights"] = ([{"type": etype, "timestamp": ev["timestamp"], "marketCap": self.mcap, "data": data}] + self.memory["highlights"])[:14]
            self.memory["eventCount"] += 1
        return ev

    def launch_event(self):
        return self._event("TOKEN_LAUNCHED", {"launchMarketCap": self.mcap})

    def set_holder_count(self, n):
        self.holder_count = n

    def set_external_state(self, mcap, price=None):
        """Initial snapshot from an indexer (no events emitted)."""
        if not mcap:
            return
        self.mcap = mcap
        self.price = price or mcap / SUPPLY
        if not self.memory["launchMarketCap"]:
            self.memory["launchMarketCap"] = mcap
        if not self.memory["athMarketCap"] or mcap > self.memory["athMarketCap"]:
            self.memory["athMarketCap"] = mcap
            self.memory["athTimestamp"] = now()
        self.history.append((now(), self.price, mcap))

    def apply_trade(self, trade):
        sig = trade["signature"]
        if sig in self.seen_set:
            return []
        self.seen.append(sig)
        self.seen_set.add(sig)
        if len(self.seen_set) > 1900:
            self.seen_set = set(self.seen)
        prev_mcap = self.mcap
        threshold = self.whale_threshold()
        self.trades.append(trade)
        self.last_trade_ts = trade["timestamp"]
        self.mcap = trade["marketCapAfter"]
        self.price = trade["priceAfter"]
        self.history.append((trade["timestamp"], self.price, self.mcap))
        if trade.get("wallet"):
            wc = self.memory["walletCounts"]
            wc[trade["wallet"]] = wc.get(trade["wallet"], 0) + 1
            if len(wc) > 500:
                for w in sorted(wc, key=wc.get)[:100]:
                    wc.pop(w, None)

        evs = []
        side = trade["side"]
        base = {"sol": trade["solAmount"], "wallet": trade.get("wallet"), "mcapBefore": prev_mcap, "mcapAfter": self.mcap,
                "whaleThreshold": threshold, "walletTrades": self.memory["walletCounts"].get(trade.get("wallet"), 1)}
        if prev_mcap is None and self.memory["launchMarketCap"] is None:
            self.memory["launchMarketCap"] = self.mcap
            self.memory["athMarketCap"] = self.mcap

        # streaks
        if side == "buy":
            if self.consecutive_buys == 0:
                self.streak_start = (trade["timestamp"], prev_mcap or self.mcap, 0.0)
            self.consecutive_buys += 1
            self.consecutive_sells = 0
        else:
            if self.consecutive_sells == 0:
                self.streak_start = (trade["timestamp"], prev_mcap or self.mcap, 0.0)
            self.consecutive_sells += 1
            self.consecutive_buys = 0
        count = self.consecutive_buys or self.consecutive_sells
        streak_trades = list(self.trades)[-count:]
        streak_sol = round(sum(t["solAmount"] for t in streak_trades), 3)

        large = trade["solAmount"] >= threshold
        if side == "buy":
            lb = self.memory["largestBuy"]
            if not lb or trade["solAmount"] > lb["sol"]:
                self.memory["largestBuy"] = {"sol": trade["solAmount"], "wallet": trade.get("wallet"), "timestamp": trade["timestamp"], "marketCap": self.mcap}
            evs.append(self._event("LARGE_BUY" if large else "BUY", base))
        else:
            ls = self.memory["largestSell"]
            if not ls or trade["solAmount"] > ls["sol"]:
                self.memory["largestSell"] = {"sol": trade["solAmount"], "wallet": trade.get("wallet"), "timestamp": trade["timestamp"], "marketCap": self.mcap}
            evs.append(self._event("LARGE_SELL" if large else "SELL", base))

        if count in THRESHOLDS["streak_levels"]:
            start_ts, start_mcap, _ = self.streak_start
            evs.append(self._event("BUY_STREAK" if side == "buy" else "SELL_STREAK", {
                "count": count, "seconds": round(trade["timestamp"] - start_ts, 1), "totalSol": streak_sol,
                "mcapChangePct": round((self.mcap / start_mcap - 1) * 100, 1) if start_mcap else 0}))

        evs += self._price_checks(prev_mcap, trade["timestamp"])

        # volume spike
        v1 = self._volume(60)
        v15 = self._volume(900)
        avg = max((v15 - v1) / 14, 0.01)
        if v1 >= THRESHOLDS["volume_spike_min_sol"] and v1 >= avg * THRESHOLDS["volume_spike_mult"] and self._cooldown("vol", THRESHOLDS["volume_cooldown"]):
            evs.append(self._event("VOLUME_SPIKE", {"volume1m": v1, "avgPerMin": round(avg, 3), "multiple": round(v1 / avg, 1)}))
        return evs

    def _price_checks(self, prev_mcap, ts):
        evs = []
        # ATH / milestones
        mem = self.memory
        if mem["athMarketCap"] is None or self.mcap > mem["athMarketCap"]:
            old = mem["athMarketCap"]
            mem["athMarketCap"] = self.mcap
            mem["athTimestamp"] = ts
            mem["drawdownLevel"] = 0
            mem["lowSinceAth"] = None
            mem["recovering"] = False
            launch = mem["launchMarketCap"] or old
            if old and old >= launch * 1.1 and self.mcap > old * 1.03 and self._cooldown("ath", THRESHOLDS["ath_cooldown"]):
                mem["previousAth"] = {"marketCap": old, "timestamp": mem.get("_prevAthTs", self.launch_ts)}
                evs.append(self._event("NEW_ATH", {"previousAth": old, "athMarketCap": self.mcap}))
            mem["_prevAthTs"] = ts
        for ms in THRESHOLDS["milestones"]:
            if prev_mcap and prev_mcap < ms <= self.mcap and ms not in mem["milestonesReached"]:
                mem["milestonesReached"].append(ms)
                prev_ms = mem["lastMilestone"]
                mem["lastMilestone"] = {"value": ms, "timestamp": ts}
                evs.append(self._event("MARKET_CAP_MILESTONE", {"milestone": ms, "previousMilestone": prev_ms}))

        # drawdown / recovery
        ath = mem["athMarketCap"]
        if ath and self.mcap < ath:
            dd = (1 - self.mcap / ath) * 100
            mem["lowSinceAth"] = min(mem["lowSinceAth"] or self.mcap, self.mcap)
            for lvl in THRESHOLDS["drawdown_levels"]:
                if dd >= lvl > mem["drawdownLevel"]:
                    mem["drawdownLevel"] = lvl
                    mem["recovering"] = False
                    evs.append(self._event("ATH_DRAWDOWN", {"drawdownPct": round(dd, 1), "athMarketCap": ath,
                                                            "minutesSinceAth": round((now() - mem["athTimestamp"]) / 60, 1)}))
            low = mem["lowSinceAth"]
            if mem["drawdownLevel"] and not mem["recovering"] and low and self.mcap >= low * (1 + THRESHOLDS["recovery_from_low_pct"] / 100):
                mem["recovering"] = True
                evs.append(self._event("RECOVERY", {"fromLow": low, "recoveryPct": round((self.mcap / low - 1) * 100, 1),
                                                    "athMarketCap": ath, "drawdownPct": round(dd, 1)}))

        # surge/drop
        p5 = self._value_ago(300) or self._value_ago(120)
        if p5 and self.price:
            chg = (self.price / p5 - 1) * 100
            if chg >= THRESHOLDS["surge_pct"] and self._cooldown("surge", THRESHOLDS["surge_cooldown"]):
                evs.append(self._event("PRICE_SURGE", {"changePct": round(chg, 1), "windowMin": 5}))
            elif chg <= THRESHOLDS["drop_pct"] and self._cooldown("drop", THRESHOLDS["surge_cooldown"]):
                evs.append(self._event("PRICE_DROP", {"changePct": round(chg, 1), "windowMin": 5}))

        return evs

    def apply_price_update(self, mcap, price=None):
        """Indexer price update without individual trades (e.g. PumpSwap via DexScreener)."""
        if not mcap or (self.mcap and abs(mcap / self.mcap - 1) < 0.002):
            return []
        prev = self.mcap
        self.mcap = mcap
        self.price = price or mcap / SUPPLY
        self.history.append((now(), self.price, mcap))
        if prev is None:
            self.set_external_state(mcap, price)
            return []
        return self._price_checks(prev, now())

    def tick(self):
        if now() - self.last_trade_ts >= THRESHOLDS["quiet_after_s"] and self._cooldown("quiet", THRESHOLDS["quiet_cooldown"]):
            return [self._event("QUIET_MARKET", {"secondsSinceTrade": round(now() - self.last_trade_ts)})]
        return []

    def force_quiet(self):
        self.cool["quiet"] = now()
        return self._event("QUIET_MARKET", {"secondsSinceTrade": round(now() - self.last_trade_ts)})

    def persistable_memory(self):
        return {k: v for k, v in self.memory.items()}
