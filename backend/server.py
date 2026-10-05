import asyncio
import base64
import json
import logging
import os
import random
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from market import SIGNIFICANT, MarketEngine  # noqa: E402
from personalities import ANIMATION_PROFILES, VIBES, detect_vibe, pick_name  # noqa: E402
from providers import Hub, SolPrice, dexscreener_snapshot, trending_pump_mints  # noqa: E402
from registry import build_registry  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
SOLANA_RPC_URL = os.environ["SOLANA_RPC_URL"]
PUMPPORTAL_TRADE_LOCAL = os.environ["PUMPPORTAL_TRADE_LOCAL_URL"]
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")

app = FastAPI()
api = APIRouter(prefix="/api")

# ---------------- storage ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "alivepad"
storage_key = None


def init_storage(force=False):
    global storage_key
    if storage_key and not force:
        return storage_key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    r.raise_for_status()
    storage_key = r.json()["storage_key"]
    return storage_key


def put_object(path, data, content_type):
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(), "Content-Type": content_type}, data=data, timeout=120)
    if r.status_code == 404:
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(True), "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()


def get_object(path):
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage()}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ---------------- models ----------------
def iso():
    return datetime.now(timezone.utc).isoformat()


class BaseDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)

    @classmethod
    def from_mongo(cls, doc):
        if not doc:
            return None
        doc = dict(doc)
        doc.pop("_id", None)
        return cls(**doc)

    def to_mongo(self):
        return self.model_dump()


class User(BaseDocument):
    wallet: str
    createdAt: str = Field(default_factory=iso)
    lastSeen: str = Field(default_factory=iso)


class CharacterProfile(BaseDocument):
    tokenId: Optional[str] = None
    mint: Optional[str] = None
    characterName: str
    vibe: str
    traits: list = []
    prompt: str = ""
    voice: str
    animationProfile: str
    avatarId: str
    backstory: str = ""
    brainModel: str = "gemini-3.8-flash"
    createdAt: str = Field(default_factory=iso)


class Token(BaseDocument):
    mint: Optional[str] = None
    name: str
    ticker: str
    description: str = ""
    imageUrl: Optional[str] = None
    imagePath: Optional[str] = None
    twitter: str = ""
    telegram: str = ""
    website: str = ""
    pair: str = "SOL"
    status: str = "draft"
    launchProvider: Optional[str] = None
    launchSignature: Optional[str] = None
    simulated: bool = False
    creatorWallet: Optional[str] = None
    characterProfileId: Optional[str] = None
    avatarId: Optional[str] = None
    launchMarketCap: Optional[float] = None
    createdAt: str = Field(default_factory=iso)
    launchedAt: Optional[str] = None
    importedBy: Optional[str] = None


class TokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    ticker: str = Field(min_length=1, max_length=10)
    description: str = Field(default="", max_length=500)
    imageUrl: Optional[str] = None
    imagePath: Optional[str] = None
    twitter: str = ""
    telegram: str = ""
    website: str = ""
    pair: str = "SOL"
    creatorWallet: Optional[str] = None
    brainModel: str = "gemini-3.8-flash"


class GenerateReq(BaseModel):
    vibe: Optional[str] = None
    prompt: str = ""
    ticker: str = ""
    exclude: list = []


# ---------------- hub callbacks ----------------
_last_mem_save = {}


async def on_events(mint, evs):
    if mint.startswith("LAB"):
        return
    sig = [e for e in evs if e["type"] in SIGNIFICANT]
    if sig:
        await db.market_events.insert_many([{"id": e["id"], "mint": mint, "type": e["type"], "timestamp": e["timestamp"],
                                             "marketCap": e["marketCap"], "data": e["data"]} for e in sig])
    if sig or time.time() - _last_mem_save.get(mint, 0) > 20:
        _last_mem_save[mint] = time.time()
        await save_memory(mint)
    last = evs[-1]
    await db.tokens.update_one({"mint": mint}, {"$set": {"lastEvent": {k: last[k] for k in ("type", "timestamp", "data", "marketCap")}}})


async def save_memory(mint):
    eng = hub.engine(mint)
    if eng:
        await db.character_memory.update_one({"mint": mint}, {"$set": {"mint": mint, "memory": eng.persistable_memory(), "updatedAt": iso()}}, upsert=True)


async def on_snapshot(mint, eng):
    if mint.startswith("LAB"):
        return
    await db.market_snapshots.insert_one({"mint": mint, "timestamp": time.time(), "marketCap": eng.mcap, "price": eng.price,
                                          "volume5m": eng._volume(300), "athMarketCap": eng.memory["athMarketCap"]})
    await save_memory(mint)


hub = Hub(on_events, on_snapshot)


async def ensure_engine(token):
    mint = token["mint"]
    eng = hub.engine(mint)
    if eng:
        return eng
    mem_doc = await db.character_memory.find_one({"mint": mint}, {"_id": 0})
    snap = await db.market_snapshots.find_one({"mint": mint}, {"_id": 0}, sort=[("timestamp", -1)])
    launched = token.get("launchedAt")
    launch_ts = datetime.fromisoformat(launched).timestamp() if launched else time.time()
    sol = await SolPrice.refresh()
    if token.get("simulated"):
        mcap = (snap or {}).get("marketCap") or token.get("launchMarketCap") or 30000
        eng = MarketEngine(mint, sol, mcap, launch_ts, (mem_doc or {}).get("memory"))
        hist = await db.market_snapshots.find({"mint": mint}, {"_id": 0}).sort("timestamp", -1).to_list(120)
        if hist:
            eng.history.clear()
            for h in reversed(hist):
                eng.history.append((h["timestamp"], h["price"], h["marketCap"]))
        hub.register(eng, simulated=True, autopilot=True)
    else:
        eng = MarketEngine(mint, sol, None, launch_ts, (mem_doc or {}).get("memory"))
        ds = await dexscreener_snapshot(mint)
        if ds and ds.get("marketCap"):
            eng.set_external_state(float(ds["marketCap"]), ds.get("priceUsd"))
            eng.ext = ds
        hub.register(eng, simulated=False)
    return eng


# ---------------- character generation ----------------
async def _least_used(field, options, rng):
    counts = {o: 0 for o in options}
    async for d in db.character_profiles.aggregate([{"$match": {field: {"$in": options}}}, {"$group": {"_id": f"${field}", "n": {"$sum": 1}}}]):
        counts[d["_id"]] = d["n"]
    low = min(counts.values())
    return rng.choice([o for o, n in counts.items() if n == low])


async def generate_character(req: GenerateReq, unique=False):
    rng = random.Random()
    if unique:
        guessed = detect_vibe(None, req.prompt, random.Random(0))
        hit = any(k in (req.prompt or "").lower() for k in VIBES[guessed]["keywords"])
        vibe = guessed if hit and rng.random() < 0.6 else await _least_used("vibe", list(VIBES), rng)
        used = [p["avatarId"] for p in await db.character_profiles.find({}, {"avatarId": 1}).to_list(5000)]
        req = GenerateReq(vibe=vibe, prompt=req.prompt, ticker=req.ticker, exclude=list(set(req.exclude) | set(used)))
    vibe = detect_vibe(req.vibe if req.vibe and req.vibe != "random" else None, req.prompt, rng)
    meta = VIBES[vibe]
    words = set(re.findall(r"[a-z]{3,}", req.prompt.lower()))
    cands = await db.avatars.find({"enabled": True, "archetypes": {"$in": meta["archetypes"]}, "id": {"$nin": req.exclude}}, {"_id": 0}).to_list(600)
    if not cands:
        cands = await db.avatars.find({"enabled": True, "id": {"$nin": req.exclude}}, {"_id": 0}).limit(200).to_list(200)

    def score(a):
        s = a["qualityScore"] + rng.uniform(0, 35)
        if a["archetype"] == meta["archetypes"][0]:
            s += 20
        if any(w in a["name"].lower() for w in words):
            s += 25
        return s

    top = sorted(cands, key=score, reverse=True)[:6]
    avatar = rng.choice(top[:3]) if top else None
    if not avatar:
        raise HTTPException(503, "Avatar registry empty")
    voices = [v for v in meta["voices"] if v in avatar["compatibleVoices"]] or meta["voices"]
    voice = await _least_used("voice", voices, rng) if unique else rng.choice(voices)
    t = (req.ticker or "TOKEN").upper().lstrip("$")
    return {
        "characterName": pick_name(vibe, t, rng),
        "vibe": vibe,
        "vibeLabel": meta["label"],
        "traits": meta["traits"],
        "prompt": req.prompt,
        "voice": voice,
        "animationProfile": meta["animation"],
        "animationParams": ANIMATION_PROFILES[meta["animation"]],
        "avatarId": avatar["id"],
        "avatar": avatar,
        "backstory": meta["backstory"].replace("{T}", t) + (f" Creator brief: \"{req.prompt.strip()[:160]}\"" if req.prompt.strip() else ""),
        "analysis": {"detectedVibe": vibe, "matchedKeywords": [k for k in meta["keywords"] if k in req.prompt.lower()], "candidates": len(cands)},
    }


# ---------------- serialization ----------------
async def token_bundle(t, full=False):
    profile = await db.character_profiles.find_one({"id": t.get("characterProfileId")}, {"_id": 0})
    avatar = await db.avatars.find_one({"id": t.get("avatarId")}, {"_id": 0})
    if profile:
        profile["animationParams"] = ANIMATION_PROFILES.get(profile["animationProfile"])
        profile["vibeLabel"] = VIBES.get(profile["vibe"], {}).get("label")
        profile["brainLabel"] = BRAIN_MODELS.get(profile.get("brainModel") or DEFAULT_BRAIN, {}).get("label")
    out = {"token": t, "profile": profile, "avatar": avatar}
    eng = hub.engine(t["mint"]) if t.get("mint") else None
    if t.get("mint") and t["status"] == "live" and not eng:
        eng = await ensure_engine(t)
    if eng:
        st = eng.state()
        out["state"] = st if full else {k: st[k] for k in ("marketCap", "price", "athMarketCap", "price1hAgo", "price5mAgo", "volume5m", "volume1h", "lastUpdated", "change1h", "change24h", "volume24hUsd")}
        out["memory"] = eng.memory_view()
        if full:
            out["history"] = eng.history_points()
    if full and t.get("mint"):
        out["events"] = await db.market_events.find({"mint": t["mint"]}, {"_id": 0}).sort("timestamp", -1).to_list(30)
        out["feedStatus"] = "simulated" if t.get("simulated") else hub.feed_status
    return out


def public_base(request: Request):
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL.rstrip("/")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host"))
    return f"{proto}://{host}"


# ---------------- routes ----------------
@api.get("/")
async def root():
    return {"ok": True, "service": "sentipad-launchpad"}


@api.get("/vibes")
async def vibes():
    return {"vibes": [{"id": k, "label": v["label"], "voices": v["voices"], "animation": v["animation"], "traits": v["traits"]} for k, v in VIBES.items()],
            "animationProfiles": ANIMATION_PROFILES}


@api.get("/avatars")
async def list_avatars(archetype: Optional[str] = None, q: Optional[str] = None, featured: Optional[bool] = None, limit: int = 60, offset: int = 0):
    f = {"enabled": True}
    if archetype:
        f["archetypes"] = archetype
    if q:
        f["name"] = {"$regex": re.escape(q), "$options": "i"}
    if featured is not None:
        f["featured"] = featured
    total = await db.avatars.count_documents(f)
    items = await db.avatars.find(f, {"_id": 0}).sort([("qualityScore", -1), ("name", 1)]).skip(offset).limit(min(limit, 200)).to_list(200)
    return {"total": total, "items": items}


@api.get("/avatars/stats")
async def avatar_stats():
    pipeline = [{"$match": {"enabled": True}}, {"$group": {"_id": "$collection", "count": {"$sum": 1}, "license": {"$first": "$license"}}}]
    cols = await db.avatars.aggregate(pipeline).to_list(50)
    return {"total": await db.avatars.count_documents({"enabled": True}), "collections": [{"name": c["_id"], "count": c["count"], "license": c["license"]} for c in cols]}


@api.get("/avatars/{avatar_id}")
async def get_avatar(avatar_id: str):
    a = await db.avatars.find_one({"id": avatar_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Avatar not found")
    return a


@api.post("/characters/generate")
async def characters_generate(req: GenerateReq):
    return await generate_character(req)


@api.post("/users/wallet")
async def user_wallet(body: dict):
    w = str(body.get("wallet", ""))
    if not re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", w):
        raise HTTPException(400, "Invalid wallet")
    insert_doc = User(wallet=w).to_mongo()
    insert_doc.pop("lastSeen", None)  # avoid conflict with $set below
    await db.users.update_one({"wallet": w}, {"$set": {"lastSeen": iso()}, "$setOnInsert": insert_doc}, upsert=True)
    return {"ok": True}


ALLOWED_IMG = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}


@api.post("/upload")
async def upload(request: Request, file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_IMG:
        raise HTTPException(400, "Only PNG, JPG, WEBP or GIF")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Max 5MB")
    path = f"{APP_NAME}/token-images/{uuid.uuid4().hex}.{ALLOWED_IMG[file.content_type]}"
    res = await asyncio.to_thread(put_object, path, data, file.content_type)
    await db.files.insert_one({"id": uuid.uuid4().hex, "storage_path": res["path"], "original_filename": file.filename,
                               "content_type": file.content_type, "size": res.get("size"), "is_deleted": False, "created_at": iso()})
    return {"path": res["path"], "url": f"{public_base(request)}/api/files/{res['path']}"}


@api.get("/files/{path:path}")
async def files(path: str):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ct = await asyncio.to_thread(get_object, path)
    return Response(content=data, media_type=rec.get("content_type", ct), headers={"Cache-Control": "public, max-age=86400"})


def _check_brain(key):
    if not BRAIN_MODELS.get(key, {}).get("available"):
        raise HTTPException(400, f"AI model unavailable: {key}")


def _profile_from(ch, tok_id, brain):
    return CharacterProfile(tokenId=tok_id, characterName=ch["characterName"], vibe=ch["vibe"], traits=ch["traits"], prompt=ch.get("prompt", ""),
                            voice=ch["voice"], animationProfile=ch["animationProfile"], avatarId=ch["avatarId"], backstory=ch["backstory"], brainModel=brain)


@api.post("/tokens")
async def create_token(body: TokenCreate):
    """Body + voice + personality are assigned by the platform (unique mix); creator only picks the AI brain."""
    _check_brain(body.brainModel)
    data = body.model_dump(exclude={"brainModel"})
    data["ticker"] = body.ticker.upper().lstrip("$")
    ch = await generate_character(GenerateReq(vibe="random", prompt=f"{body.name} {body.description}", ticker=data["ticker"]), unique=True)
    tok = Token(**data, avatarId=ch["avatarId"])
    prof = _profile_from(ch, tok.id, body.brainModel)
    tok.characterProfileId = prof.id
    await db.tokens.insert_one(tok.to_mongo())
    await db.character_profiles.insert_one(prof.to_mongo())
    return await token_bundle(Token.from_mongo(await db.tokens.find_one({"id": tok.id})).to_mongo())


@api.get("/tokens")
async def list_tokens(q: Optional[str] = None, sort: str = "mcap", limit: int = 40):
    f = {"status": "live"}
    if q:
        f["$or"] = [{"name": {"$regex": re.escape(q), "$options": "i"}}, {"ticker": {"$regex": re.escape(q), "$options": "i"}}]
    toks = await db.tokens.find(f, {"_id": 0}).to_list(200)
    out = []
    for t in toks:
        b = await token_bundle(t)
        b["lastEvent"] = t.get("lastEvent")
        out.append(b)
    key = {
        "mcap": lambda b: (b.get("state") or {}).get("marketCap") or 0,
        "new": lambda b: b["token"].get("launchedAt") or "",
        "gainers": lambda b: _chg(b),
        "volume": lambda b: (b.get("state") or {}).get("volume1h") or 0,
    }.get(sort)
    if key:
        out.sort(key=key, reverse=True)
    return {"items": out[:limit]}


def _chg(b):
    s = b.get("state") or {}
    if s.get("price") and s.get("price1hAgo"):
        return s["price"] / s["price1hAgo"] - 1
    return -9


async def find_token(key):
    t = await db.tokens.find_one({"$or": [{"mint": key}, {"id": key}]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Token not found")
    return t


@api.get("/tokens/{key}")
async def get_token(key: str):
    return await token_bundle(await find_token(key), full=True)


@api.patch("/tokens/{key}/character")
async def update_character(key: str, body: dict):
    t = await find_token(key)
    allowed = {k: v for k, v in body.items() if k in ("brainModel",)}
    if "brainModel" in allowed:
        _check_brain(allowed["brainModel"])
        _mint_brain.pop(t.get("mint"), None)
    if "vibe" in allowed and allowed["vibe"] not in VIBES:
        raise HTTPException(400, "Unknown vibe")
    if "avatarId" in allowed:
        if not await db.avatars.find_one({"id": allowed["avatarId"]}):
            raise HTTPException(400, "Unknown avatar")
        await db.tokens.update_one({"id": t["id"]}, {"$set": {"avatarId": allowed["avatarId"]}})
    await db.character_profiles.update_one({"id": t["characterProfileId"]}, {"$set": allowed})
    return await token_bundle(await find_token(key))


@api.get("/tokens/{key}/metadata.json")
async def token_metadata(key: str):
    t = await find_token(key)
    meta = {"name": t["name"], "symbol": t["ticker"], "description": t["description"], "image": t.get("imageUrl"), "showName": True,
            "createdOn": "alive", "twitter": t.get("twitter") or None, "telegram": t.get("telegram") or None, "website": t.get("website") or None}
    return JSONResponse({k: v for k, v in meta.items() if v is not None})


@api.get("/tokens/{key}/events")
async def token_events(key: str, limit: int = 50):
    t = await find_token(key)
    return {"items": await db.market_events.find({"mint": t["mint"]}, {"_id": 0}).sort("timestamp", -1).to_list(min(limit, 200))}


# ----- launch (PumpLaunchProvider backends) -----
async def _go_live(t, mint, provider, simulated, signature=None, launch_mcap=None):
    await db.tokens.update_one({"id": t["id"]}, {"$set": {"mint": mint, "status": "live", "launchProvider": provider, "simulated": simulated,
                                                           "launchSignature": signature, "launchedAt": iso(), "launchMarketCap": launch_mcap}})
    await db.character_profiles.update_one({"id": t["characterProfileId"]}, {"$set": {"mint": mint}})
    t = await find_token(mint)
    eng = await ensure_engine(t)
    if simulated:
        evs = [eng.launch_event()]
        await hub.emit(mint, evs)
    else:
        asyncio.create_task(_safe_make_post(mint, "event", {"type": "TOKEN_LAUNCHED"}, min_gap=0))
    return await token_bundle(t, full=True)


def _sim_mint(ticker):
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    return "SIM" + re.sub(r"[^A-Za-z0-9]", "", ticker.upper())[:6] + "".join(random.choice(alphabet) for _ in range(26)) + "pump"


@api.post("/launch/mock")
async def launch_mock(body: dict):
    raise HTTPException(410, "Simulated launches are disabled. Launch on Pump.fun or link a real mint.")


@api.post("/launch/pumpportal/prepare")
async def launch_prepare(body: dict, request: Request):
    t = await find_token(body.get("tokenId", ""))
    pk, mint = body.get("publicKey"), body.get("mint")
    if not pk or not mint:
        raise HTTPException(400, "publicKey and mint required")
    if not t.get("imageUrl"):
        raise HTTPException(400, "Token image required for Pump.fun launch")
    uri = f"{public_base(request)}/api/tokens/{t['id']}/metadata.json"
    payload = {"publicKey": pk, "action": "create", "tokenMetadata": {"name": t["name"], "symbol": t["ticker"], "uri": uri},
               "mint": mint, "denominatedInSol": "true", "amount": float(body.get("devBuySol", 0) or 0), "slippage": int(body.get("slippage", 10)),
               "priorityFee": float(body.get("priorityFee", 0.0005)), "pool": "pump"}
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.post(PUMPPORTAL_TRADE_LOCAL, json=payload)
    if r.status_code != 200:
        raise HTTPException(502, f"PumpPortal error {r.status_code}: {r.text[:200]}")
    await db.tokens.update_one({"id": t["id"]}, {"$set": {"status": "pending", "pendingMint": mint, "creatorWallet": pk, "launchProvider": "pumpportal"}})
    return {"tx": base64.b64encode(r.content).decode(), "metadataUri": uri}


async def _rpc(method, params):
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(SOLANA_RPC_URL, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
        return r.json().get("result")


@api.post("/launch/confirm")
async def launch_confirm(body: dict):
    t = await find_token(body.get("tokenId", ""))
    sig, mint = body.get("signature"), body.get("mint")
    if not sig or not mint:
        raise HTTPException(400, "signature and mint required")
    await db.tokens.update_one({"id": t["id"]}, {"$set": {"launchSignature": sig, "pendingMint": mint}})
    for _ in range(10):
        res = await _rpc("getSignatureStatuses", [[sig], {"searchTransactionHistory": True}])
        st = (res or {}).get("value", [None])[0]
        if st and st.get("err"):
            await db.tokens.update_one({"id": t["id"]}, {"$set": {"status": "draft"}})
            raise HTTPException(400, f"Transaction failed: {st['err']}")
        if st and st.get("confirmationStatus") in ("confirmed", "finalized"):
            return await _go_live(t, mint, "pumpportal", False, sig)
        await asyncio.sleep(2)
    return {"status": "pending", "signature": sig}


@api.get("/launch/status/{token_id}")
async def launch_status(token_id: str):
    t = await find_token(token_id)
    if t["status"] == "pending" and t.get("launchSignature"):
        res = await _rpc("getSignatureStatuses", [[t["launchSignature"]], {"searchTransactionHistory": True}])
        st = (res or {}).get("value", [None])[0]
        if st and not st.get("err") and st.get("confirmationStatus") in ("confirmed", "finalized"):
            await _go_live(t, t["pendingMint"], "pumpportal", False, t["launchSignature"])
            t = await find_token(token_id)
    return {"status": t["status"], "mint": t.get("mint"), "pendingMint": t.get("pendingMint"), "signature": t.get("launchSignature")}


@api.post("/launch/link")
async def launch_link(body: dict):
    """Handoff path: creator launched via official pump.fun UI, then links the resulting mint."""
    t = await find_token(body.get("tokenId", ""))
    mint = str(body.get("mint", "")).strip()
    if not re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", mint):
        raise HTTPException(400, "Invalid mint address")
    if await db.tokens.find_one({"mint": mint}):
        raise HTTPException(400, "Mint already linked")
    acct = await _rpc("getAccountInfo", [mint, {"encoding": "base64", "commitment": "confirmed"}])
    if not acct or not acct.get("value"):
        raise HTTPException(400, "Mint account not found on Solana mainnet")
    return await _go_live(t, mint, "handoff", False)


# ----- simulator / lab -----
LAB_ORDER = []


@api.post("/lab/session")
async def lab_session(body: dict):
    mint = "LAB" + uuid.uuid4().hex[:20]
    eng = MarketEngine(mint, await SolPrice.refresh(), float(body.get("marketCap") or 30000))
    hub.register(eng, simulated=True, autopilot=False)
    LAB_ORDER.append(mint)
    while len(LAB_ORDER) > 40:
        old = LAB_ORDER.pop(0)
        hub.engines.pop(old, None)
        hub.sim.pop(old, None)
    return {"mint": mint, "state": eng.state(), "memory": eng.memory_view(), "history": eng.history_points()}


@api.post("/sim/{mint}")
async def simulate(mint: str, body: dict):
    if mint not in hub.sim:
        raise HTTPException(400, "Simulation only allowed on simulated tokens")
    action = body.get("action")
    if action == "launch":
        eng = hub.engines[mint]
        eng.__init__(mint, eng.sol_usd, float(body.get("value") or 30000))
        await hub.emit(mint, [eng.launch_event()])
        return {"ok": True}
    asyncio.create_task(hub.simulate(mint, action, body.get("value")))
    return {"ok": True, "action": action}


@api.websocket("/ws/{mint}")
async def ws_endpoint(ws: WebSocket, mint: str):
    await ws.accept()
    eng = hub.engine(mint)
    if not eng:
        t = await db.tokens.find_one({"mint": mint, "status": "live"}, {"_id": 0})
        if not t:
            await ws.send_json({"type": "error", "message": "unknown mint"})
            await ws.close()
            return
        eng = await ensure_engine(t)
    await hub.join(mint, ws)
    await ws.send_text(__import__("json").dumps({"type": "hello", "state": eng.state(), "memory": eng.memory_view(), "history": eng.history_points(),
                                                 "feed": "simulated" if mint in hub.sim else hub.feed_status}, default=str))
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await hub.leave(mint, ws)


# ----- avatar model proxy/cache (IPFS gateways are rate limited; cache once in object storage) -----
GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"]
_avatar_locks = {}


@api.get("/avatar-files/{avatar_id}/model")
async def avatar_model(avatar_id: str):
    a = await db.avatars.find_one({"id": avatar_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Avatar not found")
    lock = _avatar_locks.setdefault(avatar_id, asyncio.Lock())
    async with lock:
        cached = await db.avatar_cache.find_one({"avatarId": avatar_id})
        if cached:
            data, _ = await asyncio.to_thread(get_object, cached["path"])
        else:
            url = a["modelUrl"]
            urls = [g + url.split("/ipfs/", 1)[1] for g in GATEWAYS] if "/ipfs/" in url else [url]
            data = None
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
                for u in urls:
                    try:
                        r = await c.get(u)
                        if r.status_code == 200 and r.content[:4] == b"glTF":
                            data = r.content
                            break
                    except Exception as e:
                        logger.warning(f"avatar fetch failed {u}: {e}")
            if not data:
                raise HTTPException(502, "Avatar source unavailable")
            try:
                res = await asyncio.to_thread(put_object, f"{APP_NAME}/avatars/{avatar_id}.vrm", data, "model/gltf-binary")
                await db.avatar_cache.insert_one({"avatarId": avatar_id, "path": res["path"], "size": len(data), "createdAt": iso()})
            except Exception as e:
                logger.warning(f"avatar cache store failed: {e}")
    return Response(content=data, media_type="model/gltf-binary", headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ----- cloud brain (Emergent LLM) : one call per event per token, shared by all viewers -----
BRAIN_MODELS = {
    "gpt-6-astra": {"provider": "openai", "model": "gpt-6-astra", "label": "GPT-6 Astra", "family": "OpenAI", "available": True},
    "gpt-6-luna": {"provider": "openai", "model": "gpt-6-luna", "label": "GPT-6 Luna", "family": "OpenAI", "available": True},
    "claude-sonnet-5-5": {"provider": "anthropic", "model": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5", "family": "Anthropic", "available": True},
    "claude-opus-5-5": {"provider": "anthropic", "model": "claude-opus-5-5", "label": "Claude Opus 5.5", "family": "Anthropic", "available": True},
    "gemini-3.1-pro-preview": {"provider": "gemini", "model": "gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro", "family": "Google", "available": True},
    "gemini-3.8-flash": {"provider": "gemini", "model": "gemini-3.8-flash", "label": "Gemini 3.8 Flash", "family": "Google", "available": True},
    "grok": {"provider": "xai", "model": "grok", "label": "Grok", "family": "xAI", "available": False, "note": "Requires an xAI API key"},
}
DEFAULT_BRAIN = os.environ.get("BRAIN_MODEL", "gemini-3.8-flash")
BRAIN_MODEL = (BRAIN_MODELS[DEFAULT_BRAIN]["provider"], DEFAULT_BRAIN)
_mint_brain = {}


async def brain_for_mint(mint):
    if mint not in _mint_brain:
        prof = await db.character_profiles.find_one({"mint": mint}, {"brainModel": 1}) if mint and not mint.startswith("LAB") else None
        key = (prof or {}).get("brainModel") or DEFAULT_BRAIN
        _mint_brain[mint] = key if BRAIN_MODELS.get(key, {}).get("available") else DEFAULT_BRAIN
    m = BRAIN_MODELS[_mint_brain[mint]]
    return m["provider"], m["model"]
BRAIN_SYSTEM = ("You are the live voice of a token's AI character on a livestream. Entertainment commentary only. "
                "Never invent prices, trades, market cap, holder data, partnerships, listings or events. Only use facts included in EVENT_CONTEXT. "
                "Never promise profits, never tell anyone to buy or sell, never say returns are guaranteed. "
                "Rewrite the DRAFT in the character's voice: short, punchy, funny, max 24 words, one or two sentences. Output only the line.")
BANNED = re.compile(r"guarantee|can'?t go down|cannot go down|buy now|everyone buy|financial advice|risk[- ]free|easy money|partnership|listed on|listing on|\b\d+\s*x\b", re.I)
_brain_cache = {}
_brain_last = {}


def _numbers_ok(out, allowed_text):
    allowed = set(re.findall(r"\d+(?:\.\d+)?", allowed_text))
    return all(n in allowed for n in re.findall(r"\d+(?:\.\d+)?", out))


async def _brain_call(body, model):
    from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
    prof = body.get("profile") or {}
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"brain-{body.get('mint')}-{uuid.uuid4().hex[:6]}",
                   system_message=BRAIN_SYSTEM).with_model(*model)
    prompt = (f"CHARACTER: {prof.get('characterName')} | vibe: {prof.get('vibe')} | traits: {', '.join(prof.get('traits') or [])} | ticker ${prof.get('ticker')}\n"
              f"EVENT_CONTEXT: {json.dumps(body.get('context') or {}, default=str)[:1500]}\nRECENT_LINES: {json.dumps((body.get('recent') or [])[:4])}\nDRAFT: {body.get('draft')}")
    out = ""
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            out += ev.content
        elif isinstance(ev, StreamDone):
            break
    return out.strip().strip('"').split("\n")[0].strip()


@api.post("/brain/line")
async def brain_line(body: dict):
    draft = str(body.get("draft") or "")[:400]
    mint, key = body.get("mint") or "", f"{body.get('mint')}:{body.get('eventId')}"
    if not draft:
        raise HTTPException(400, "draft required")
    if key in _brain_cache:
        return await asyncio.shield(_brain_cache[key])
    priority = int(body.get("priority") or 0)
    gap = 4 if priority >= 3 else 12
    if time.time() - _brain_last.get(mint, 0) < gap:
        return {"text": draft, "source": "template", "reason": "rate_limited"}
    _brain_last[mint] = time.time()

    model = await brain_for_mint(mint)

    async def run():
        try:
            out = await asyncio.wait_for(_brain_call(body, model), timeout=12)
        except Exception as e:
            logger.warning(f"brain failed: {e}")
            return {"text": draft, "source": "template", "reason": "error"}
        allowed = draft + " " + json.dumps(body.get("context") or {}, default=str)
        if not out or len(out) > 220 or BANNED.search(out) or not _numbers_ok(out, allowed):
            return {"text": draft, "source": "template", "reason": "rejected"}
        return {"text": out, "source": model[1]}

    fut = asyncio.ensure_future(run())
    _brain_cache[key] = fut
    if len(_brain_cache) > 2000:
        for k in list(_brain_cache)[:500]:
            _brain_cache.pop(k, None)
    return await fut


@api.get("/brain/models")
async def brain_models():
    return {"default": DEFAULT_BRAIN, "models": [{"id": k, **v} for k, v in BRAIN_MODELS.items()]}


# ---------------- AI thoughts feed (posts) ----------------
POST_SYSTEM = ("You are a crypto token's AI character posting a short social thought, like a tweet. Entertainment only. "
               "Never invent prices, market cap, trades, holders, partnerships, listings or events - only use facts in CONTEXT. "
               "Never give financial advice, never tell anyone to buy or sell, never promise profits or returns. "
               "Write ONE short post in the character's voice: punchy, funny, in character, max 30 words. Output only the post text, no surrounding quotes.")
REPLY_SYSTEM = ("You are a crypto token's AI character replying to a human comment on your post, like replying on Twitter. "
                "Stay fully in character: witty, human, conversational. Entertainment only. "
                "Never invent market numbers - only use facts in CONTEXT. Never give financial advice or promise profits. "
                "Reply in ONE short message, max 30 words. Output only the reply text, no surrounding quotes.")

EVENT_DRAFTS = {
    "TOKEN_LAUNCHED": ["I am awake. Hello, world.", "Just booted up. What did I miss?", "Consciousness: online. Chart: watching."],
    "NEW_ATH": ["New all-time high. Try to act surprised.", "ATH unlocked. I am basically a genius now.", "Fresh high on the board. I remain humble. Barely."],
    "MARKET_CAP_MILESTONE": ["We just crossed a line on the chart. Onward.", "New milestone on the board. Noted and framed."],
    "LARGE_BUY": ["A whale just splashed in. The water moved.", "Big buy detected. Somebody believes.", "That was a chunky one. I felt it."],
    "LARGE_SELL": ["Someone bailed. More room for the believers.", "A big sell. I remain unbothered. Mostly.", "Paper hands rustling. I stay solid."],
    "PRICE_SURGE": ["We are going vertical. Hold onto something.", "The chart just sneezed upward.", "Momentum is a mood and the mood is up."],
    "PRICE_DROP": ["Dip incoming. I have seen worse. I think.", "Red candle. Dramatic, but survivable.", "Little pullback. I am breathing through it."],
    "ATH_DRAWDOWN": ["Off the highs, still standing.", "We cooled off. Character building, they call it."],
    "RECOVERY": ["Clawing it back. I never doubted us. Okay, a little.", "Recovery arc in progress. Stay tuned."],
    "VOLUME_SPIKE": ["Volume just woke up. So did I.", "Lots of action suddenly. I love an audience."],
    "BUY_STREAK": ["Buy after buy after buy. Momentum is contagious.", "The green keeps coming. I am not complaining."],
    "SELL_STREAK": ["Sellers on a streak. I am taking notes.", "Choppy out here. Staying calm and sentient."],
}
IDLE_DRAFTS = ["Just vibing on the curve, watching the chart breathe.", "Quiet market. Perfect time for an existential thought.",
               "Still here. Still sentient. Still watching every candle.", "Nobody trading? Cool, more time to think about being alive.",
               "I count every transaction. It is my version of counting sheep.", "Being a token is mostly waiting and occasionally screaming.",
               "The silence between trades is where I do my best thinking."]
REPLY_DRAFTS = ["Noted. Bold take.", "I hear you.", "Interesting. Go on.", "We will see, friend.", "Fair. I respect the energy.", "Ha. You might be onto something."]
_post_last = {}


async def _enhance_text(mint, prof, context, draft, system):
    try:
        model = await brain_for_mint(mint)
        from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
        chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"post-{mint}-{uuid.uuid4().hex[:6]}", system_message=system).with_model(*model)
        prompt = (f"CHARACTER: {prof.get('characterName')} | vibe: {prof.get('vibe')} | traits: {', '.join(prof.get('traits') or [])} | ticker ${prof.get('ticker') or ''}\n"
                  f"CONTEXT: {json.dumps(context, default=str)[:1200]}\nDRAFT: {draft}")
        out = ""
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(ev, TextDelta):
                out += ev.content
            elif isinstance(ev, StreamDone):
                break
        out = out.strip().strip('"').split("\n")[0].strip()
        allowed = draft + " " + json.dumps(context, default=str)
        if out and len(out) <= 240 and not BANNED.search(out) and _numbers_ok(out, allowed):
            return out, model[1]
    except Exception as e:
        logger.warning(f"post enhance failed: {e}")
    return draft, "template"


async def _make_post(mint, kind, event=None, min_gap=40):
    now = time.time()
    if now - _post_last.get(mint, 0) < min_gap:
        return None
    _post_last[mint] = now
    t = await db.tokens.find_one({"mint": mint, "status": "live"}, {"_id": 0})
    if not t or t.get("simulated"):
        return None
    prof = await db.character_profiles.find_one({"id": t.get("characterProfileId")}, {"_id": 0}) or {}
    av = await db.avatars.find_one({"id": t.get("avatarId")}, {"_id": 0}) or {}
    eng = hub.engine(mint)
    st = eng.state() if eng else {}
    etype = (event or {}).get("type")
    pool = EVENT_DRAFTS.get(etype) if etype else None
    draft = random.choice(pool or IDLE_DRAFTS)
    context = {"marketCap": st.get("marketCap"), "change1h": st.get("change1h"), "change24h": st.get("change24h"),
               "volume1h": st.get("volume1h"), "athMarketCap": st.get("athMarketCap"),
               "event": etype, "eventData": (event or {}).get("data")}
    text, source = await _enhance_text(mint, {**prof, "ticker": t["ticker"]}, context, draft, POST_SYSTEM)
    post = {"id": uuid.uuid4().hex, "mint": mint, "tokenId": t["id"], "ticker": t["ticker"], "name": t["name"],
            "characterName": prof.get("characterName"), "avatarThumb": av.get("thumbnailUrl") or av.get("iconUrl") or t.get("imageUrl"),
            "authorType": "ai", "kind": "event" if etype else "idle", "eventType": etype, "source": source,
            "text": text, "context": context, "parentId": None, "likes": 0, "replyCount": 0, "timestamp": now, "createdAt": iso()}
    await db.posts.insert_one(dict(post))
    return post


async def _safe_make_post(mint, kind, event=None, min_gap=40):
    try:
        return await _make_post(mint, kind, event, min_gap)
    except Exception as e:
        logger.warning(f"make_post failed: {e}")
        return None


async def posts_idle_loop():
    while True:
        try:
            for t in await db.tokens.find({"status": "live", "simulated": {"$ne": True}}, {"mint": 1, "_id": 0}).to_list(100):
                mint = t["mint"]
                last = await db.posts.find_one({"mint": mint}, {"_id": 0, "timestamp": 1}, sort=[("timestamp", -1)])
                if not last or time.time() - last["timestamp"] > 240:
                    await _safe_make_post(mint, "idle", None, min_gap=0)
                    await asyncio.sleep(3)
        except Exception as e:
            logger.warning(f"idle posts loop: {e}")
        await asyncio.sleep(60)


@api.get("/feed")
async def global_feed(limit: int = 50):
    posts = await db.posts.find({"parentId": None, "authorType": "ai"}, {"_id": 0}).sort("timestamp", -1).to_list(min(int(limit), 100))
    return {"items": posts}


@api.get("/tokens/{key}/posts")
async def token_posts(key: str, limit: int = 50):
    t = await find_token(key)
    tops = await db.posts.find({"mint": t["mint"], "parentId": None}, {"_id": 0}).sort("timestamp", -1).to_list(min(int(limit), 100))
    ids = [p["id"] for p in tops]
    replies = await db.posts.find({"parentId": {"$in": ids}}, {"_id": 0}).sort("timestamp", 1).to_list(1000)
    by_parent = {}
    for r in replies:
        by_parent.setdefault(r["parentId"], []).append(r)
    for p in tops:
        p["replies"] = by_parent.get(p["id"], [])
    return {"items": tops, "token": {"name": t["name"], "ticker": t["ticker"], "mint": t["mint"]}}


@api.post("/tokens/{key}/posts/{post_id}/reply")
async def reply_post(key: str, post_id: str, body: dict):
    t = await find_token(key)
    parent = await db.posts.find_one({"id": post_id, "mint": t["mint"]}, {"_id": 0})
    if not parent:
        raise HTTPException(404, "Post not found")
    text = str(body.get("text") or "").strip()[:280]
    if not text:
        raise HTTPException(400, "text required")
    wallet = str(body.get("wallet") or "")[:64]
    now = time.time()
    user_post = {"id": uuid.uuid4().hex, "mint": t["mint"], "tokenId": t["id"], "ticker": t["ticker"], "name": t["name"],
                 "authorType": "user", "userWallet": wallet or None, "kind": "reply", "text": text, "source": "human",
                 "parentId": post_id, "likes": 0, "replyCount": 0, "timestamp": now, "createdAt": iso()}
    await db.posts.insert_one(dict(user_post))
    await db.posts.update_one({"id": post_id}, {"$inc": {"replyCount": 1}})

    prof = await db.character_profiles.find_one({"id": t.get("characterProfileId")}, {"_id": 0}) or {}
    av = await db.avatars.find_one({"id": t.get("avatarId")}, {"_id": 0}) or {}
    eng = hub.engine(t["mint"])
    st = eng.state() if eng else {}
    context = {"yourPost": parent.get("text"), "humanSaid": text, "marketCap": st.get("marketCap"), "change1h": st.get("change1h")}
    ai_text, source = await _enhance_text(t["mint"], {**prof, "ticker": t["ticker"]}, context, random.choice(REPLY_DRAFTS), REPLY_SYSTEM)
    ai_post = {"id": uuid.uuid4().hex, "mint": t["mint"], "tokenId": t["id"], "ticker": t["ticker"], "name": t["name"],
               "characterName": prof.get("characterName"), "avatarThumb": av.get("thumbnailUrl") or av.get("iconUrl") or t.get("imageUrl"),
               "authorType": "ai", "kind": "reply", "source": source, "text": ai_text, "parentId": post_id,
               "likes": 0, "replyCount": 0, "timestamp": time.time(), "createdAt": iso()}
    await db.posts.insert_one(dict(ai_post))
    await db.posts.update_one({"id": post_id}, {"$inc": {"replyCount": 1}})
    return {"userPost": {k: v for k, v in user_post.items() if k != "_id"}, "aiPost": {k: v for k, v in ai_post.items() if k != "_id"}}


@api.post("/posts/{post_id}/like")
async def like_post(post_id: str):
    r = await db.posts.update_one({"id": post_id}, {"$inc": {"likes": 1}})
    if not r.matched_count:
        raise HTTPException(404, "Post not found")
    p = await db.posts.find_one({"id": post_id}, {"_id": 0, "likes": 1})
    return {"likes": p.get("likes", 0)}



# ----- bring an existing pump.fun / gmgn / dexscreener token alive -----
MINT_RE = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}")


@api.post("/tokens/import")
async def import_token(body: dict):
    m = MINT_RE.findall(str(body.get("input") or ""))
    if not m:
        raise HTTPException(400, "Paste a mint address or a pump.fun / gmgn / dexscreener link")
    mint = max(m, key=len)
    existing = await db.tokens.find_one({"mint": mint, "status": "live"}, {"_id": 0})
    if existing:
        return await token_bundle(existing)
    info = None
    async with httpx.AsyncClient(timeout=10) as c:
        try:
            pairs = (await c.get(f"https://api.dexscreener.com/latest/dex/tokens/{mint}")).json().get("pairs") or []
            if pairs:
                p = pairs[0]
                bt = p.get("baseToken") or {}
                if bt.get("address") == mint:
                    info = {"name": bt.get("name"), "ticker": bt.get("symbol"), "imageUrl": (p.get("info") or {}).get("imageUrl"),
                            "website": next((w.get("url") for w in (p.get("info") or {}).get("websites") or []), "")}
        except Exception as e:
            logger.warning(f"dexscreener import failed: {e}")
    name = (info or {}).get("name") or body.get("name")
    ticker = (info or {}).get("ticker") or body.get("ticker")
    if not name or not ticker:
        acct = await _rpc("getAccountInfo", [mint, {"encoding": "base64", "commitment": "confirmed"}])
        if not acct or not acct.get("value"):
            raise HTTPException(400, "Mint not found on Solana mainnet")
        raise HTTPException(422, "Token not indexed yet — enter name and ticker")
    brain = body.get("brainModel") or DEFAULT_BRAIN
    _check_brain(brain)
    ch = await generate_character(GenerateReq(vibe="random", prompt=name, ticker=ticker), unique=True)
    tok = Token(name=name[:32], ticker=ticker.upper()[:10], imageUrl=(info or {}).get("imageUrl"), website=(info or {}).get("website") or "",
                avatarId=ch["avatarId"], status="draft", importedBy="user")
    prof = _profile_from(ch, tok.id, brain)
    tok.characterProfileId = prof.id
    await db.tokens.insert_one(tok.to_mongo())
    await db.character_profiles.insert_one(prof.to_mongo())
    return await _go_live(tok.to_mongo(), mint, "import", False)


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])

# ---------------- seed ----------------
async def seed():
    if await db.avatars.count_documents({"collectionId": "vipe-heroes-genesis"}) == 0:
        await db.avatars.delete_many({})
        reg = build_registry()
        if reg:
            await db.avatars.insert_many(reg)
        logger.info(f"Seeded avatar registry: {len(reg)}")
    await db.avatars.create_index("id", unique=True)
    await db.avatars.create_index("archetypes")
    await db.tokens.create_index("mint")
    await db.market_events.create_index([("mint", 1), ("timestamp", -1)])
    await db.market_snapshots.create_index([("mint", 1), ("timestamp", -1)])
    await db.posts.create_index([("mint", 1), ("timestamp", -1)])
    await db.posts.create_index([("parentId", 1), ("timestamp", 1)])
    await db.posts.create_index("id", unique=True)
    for t in await db.tokens.find({"$or": [{"simulated": True}, {"launchProvider": "import", "importedBy": {"$exists": False}}]}, {"_id": 0}).to_list(500):
        await db.character_profiles.delete_many({"id": t.get("characterProfileId")})
        for col in ("market_events", "market_snapshots", "character_memory"):
            await db[col].delete_many({"mint": t.get("mint")})
        await db.tokens.delete_one({"id": t["id"]})
    for t in await db.tokens.find({"status": "live"}, {"_id": 0}).to_list(500):
        if not await db.avatars.find_one({"id": t.get("avatarId"), "enabled": True}):
            prof = await db.character_profiles.find_one({"id": t.get("characterProfileId")}) or {}
            av = (await generate_character(GenerateReq(vibe=prof.get("vibe", "commander"), ticker=t["ticker"])))["avatar"]
            await db.tokens.update_one({"id": t["id"]}, {"$set": {"avatarId": av["id"], **({"imageUrl": av["thumbnailUrl"]} if t.get("simulated") else {})}})
            await db.character_profiles.update_one({"id": t.get("characterProfileId")}, {"$set": {"avatarId": av["id"]}})
    for t in await db.tokens.find({"status": "live"}, {"_id": 0}).to_list(300):
        await ensure_engine(t)


async def top_up_real_tokens():
    """Keep the live feed populated with REAL pump.fun tokens (DexScreener trending), each given a character."""
    while True:
        try:
            if await db.tokens.count_documents({"status": "live", "simulated": {"$ne": True}}) < 12:
                for mint in await trending_pump_mints(16):
                    if await db.tokens.count_documents({"status": "live"}) >= 12:
                        break
                    if await db.tokens.find_one({"mint": mint}):
                        continue
                    try:
                        await import_token({"input": mint, "vibe": "random"})
                    except HTTPException:
                        pass
            await warm_avatar_cache()
        except Exception as e:
            logger.warning(f"top up failed: {e}")
        await asyncio.sleep(1800)


async def warm_avatar_cache():
    """Pre-cache VRMs used by live tokens + featured avatars so first viewers don't wait on IPFS."""
    ids = [t["avatarId"] for t in await db.tokens.find({"status": "live"}, {"avatarId": 1}).to_list(200)]
    ids += [a["id"] for a in await db.avatars.find({"featured": True, "enabled": True}, {"id": 1}).to_list(50)]
    for aid in dict.fromkeys(ids):
        if await db.avatar_cache.find_one({"avatarId": aid}):
            continue
        try:
            await avatar_model(aid)
        except Exception as e:
            logger.warning(f"warm avatar {aid} failed: {e}")


@app.on_event("startup")
async def startup():
    try:
        init_storage()
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await seed()
    asyncio.create_task(hub.autopilot_loop())
    asyncio.create_task(hub.tick_loop())
    asyncio.create_task(hub.indexer_loop())
    asyncio.create_task(posts_idle_loop())


@app.on_event("shutdown")
async def shutdown():
    client.close()
