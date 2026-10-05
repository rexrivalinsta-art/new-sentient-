"""Backend API tests for Alive Launchpad - Iteration 2 (VIPE registry + cloud brain + token import)."""
import asyncio
import json
import os
import time
import uuid

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0]).rstrip("/")
API = f"{BASE_URL}/api"

EXPECTED_AVATARS = 3000
EXPECTED_COLLECTION = "VIPE Heroes Genesis"
EXPECTED_COLLECTION_ID = "vipe-heroes-genesis"


# ---------------- health ----------------
def test_root():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------------- VIPE avatar registry ----------------
def test_avatar_stats_vipe():
    r = requests.get(f"{API}/avatars/stats")
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == EXPECTED_AVATARS, f"expected {EXPECTED_AVATARS}, got {d['total']}"
    cols = d.get("collections", [])
    assert len(cols) == 1, f"expected only VIPE collection, got {cols}"
    c = cols[0]
    assert c["name"] == EXPECTED_COLLECTION, c
    assert "CC-BY" in (c.get("license") or ""), c
    assert c["count"] == EXPECTED_AVATARS


def test_avatars_featured_attribution():
    r = requests.get(f"{API}/avatars?featured=true&limit=5")
    assert r.status_code == 200
    d = r.json()
    assert d["total"] >= 1
    assert len(d["items"]) >= 1
    for a in d["items"]:
        assert a.get("collection") == EXPECTED_COLLECTION or a.get("collectionId") == EXPECTED_COLLECTION_ID
        assert a.get("attribution"), f"missing attribution: {a}"
        assert a.get("sourceUrl"), f"missing sourceUrl: {a}"
        assert a.get("thumbnailUrl"), f"missing thumbnailUrl: {a}"
        assert "pinata" in a["thumbnailUrl"] or "ipfs" in a["thumbnailUrl"], a["thumbnailUrl"]


def test_avatar_model_binary_gltf():
    r = requests.get(f"{API}/avatars?featured=true&limit=1")
    assert r.status_code == 200
    item = r.json()["items"][0]
    avid = item["id"]
    r2 = requests.get(f"{API}/avatar-files/{avid}/model", timeout=90)
    assert r2.status_code == 200, f"{r2.status_code}: {r2.text[:200]}"
    assert r2.content[:4] == b"glTF", f"first bytes: {r2.content[:8]!r}"
    assert len(r2.content) > 1000


# ---------------- character generation uses VIPE ----------------
def test_generate_returns_vipe_avatar():
    body = {"vibe": "random", "prompt": "An arrogant military robot commander", "ticker": "QA"}
    r = requests.post(f"{API}/characters/generate", json=body)
    assert r.status_code == 200
    d = r.json()
    avid = d["avatarId"]
    av = requests.get(f"{API}/avatars/{avid}").json()
    assert av.get("collectionId") == EXPECTED_COLLECTION_ID, f"expected VIPE, got {av.get('collectionId')}"
    assert av.get("enabled") is True


# ---------------- seeded tokens use VIPE avatars ----------------
def test_seeded_tokens_use_vipe():
    r = requests.get(f"{API}/tokens?limit=40")
    assert r.status_code == 200
    items = r.json()["items"]
    tickers = {b["token"]["ticker"] for b in items}
    expected = {"LOCK", "DESK", "NEWS", "DEVIL", "PROBE", "HONK", "ROOT", "MOONLAB"}
    missing = expected - tickers
    assert not missing, f"missing seeded tokens: {missing}"
    for b in items:
        if b["token"]["ticker"] in expected:
            av = b.get("avatar") or {}
            assert av.get("collectionId") == EXPECTED_COLLECTION_ID, f"{b['token']['ticker']} avatar not VIPE: {av.get('collectionId')}"


# ---------------- brain/line ----------------
BRAIN_CTX = {
    "event": "LARGE_BUY",
    "facts": {"sol": "4 SOL"},
    "profile": {"characterName": "Commander LOCK", "vibe": "commander", "traits": ["dry humor"], "ticker": "LOCK"},
}


def test_brain_line_cache_and_rate_limit():
    mint = "QAtest1"
    body1 = {"mint": mint, "eventId": "x1", "priority": 4,
             "draft": "Whale-class reinforcement detected. 4 SOL.", "context": BRAIN_CTX}
    r1 = requests.post(f"{API}/brain/line", json=body1, timeout=20)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert "text" in d1 and "source" in d1
    # source must be gemini-3.8-flash or template fallback
    assert d1["source"] in ("gemini-3.8-flash", "template"), d1
    # digit safety: no numbers absent from draft+ctx
    import re
    allowed = set(re.findall(r"\d+(?:\.\d+)?", body1["draft"] + " " + json.dumps(BRAIN_CTX)))
    for n in re.findall(r"\d+(?:\.\d+)?", d1["text"]):
        assert n in allowed, f"hallucinated number {n} in {d1['text']}"

    # same mint + eventId -> identical cached result
    r2 = requests.post(f"{API}/brain/line", json=body1, timeout=20)
    assert r2.status_code == 200
    assert r2.json() == d1, "cache mismatch"

    # different eventId within 4s -> rate-limited template
    body2 = {**body1, "eventId": "x2"}
    r3 = requests.post(f"{API}/brain/line", json=body2, timeout=20)
    assert r3.status_code == 200
    d3 = r3.json()
    assert d3["source"] == "template" and d3.get("reason") == "rate_limited", d3


def test_brain_info():
    r = requests.get(f"{API}/brain/info")
    assert r.status_code == 200
    d = r.json()
    assert d.get("model") == "gemini-3.8-flash"


# ---------------- tokens/import ----------------
IMPORT_URL = "https://dexscreener.com/solana/CZJfrAmMs5Cz4H22PWzfqTJu5FkP7Q2Vvx1oPVL9pump"
IMPORT_MINT = "CZJfrAmMs5Cz4H22PWzfqTJu5FkP7Q2Vvx1oPVL9pump"


def test_token_import_dexscreener_url():
    r = requests.post(f"{API}/tokens/import", json={"input": IMPORT_URL, "vibe": "chaotic"}, timeout=30)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["token"]["mint"] == IMPORT_MINT
    assert b["token"]["status"] == "live"
    assert b.get("avatar")

    # idempotent: same input returns existing token
    r2 = requests.post(f"{API}/tokens/import", json={"input": IMPORT_URL, "vibe": "chaotic"}, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["token"]["mint"] == IMPORT_MINT


def test_token_import_invalid():
    r = requests.post(f"{API}/tokens/import", json={"input": "hello"})
    assert r.status_code == 400


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
