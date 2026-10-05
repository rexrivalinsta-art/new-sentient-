import json
import re
from pathlib import Path
from personalities import NAME_TAGS, VIBES

DATA_DIR = Path(__file__).parent / "data"

# Collections imported only when the source registry explicitly declares CC0 per collection.
CC0_COLLECTIONS = ["100avatars-r1", "100avatars-r2", "100avatars-r3", "toxsam", "halloween-rising", "xmas-chibis", "grifters-squaddies"]

FEATURED = {
    "Polybot": (["commander", "robot", "hacker"], 98),
    "Bizdude": (["wallstreet", "aristocrat"], 96),
    "StonksReporter": (["anchor", "wallstreet"], 96),
    "Devil": (["villain"], 95),
    "CoolAlien": (["alien", "meme"], 95),
    "Cyberpal": (["hacker", "robot"], 94),
    "Astronaut": (["scientist", "commander"], 94),
    "Clown": (["chaotic", "meme"], 93),
}

STYLE_BY_COLLECTION = {
    "100avatars-r1": "low-poly stylized", "100avatars-r2": "low-poly stylized", "100avatars-r3": "low-poly stylized",
    "toxsam": "stylized humanoid", "halloween-rising": "chibi", "xmas-chibis": "chibi", "grifters-squaddies": "stylized squad",
}


def _archetypes_for(name: str, collection: str) -> list:
    n = re.sub(r"[^a-z]", "", name.lower())
    tags = [arch for arch, kws in NAME_TAGS.items() if any(k in n for k in kws)]
    if collection == "halloween-rising":
        tags += ["villain", "chaotic"]
    if collection == "xmas-chibis":
        tags += ["anime", "meme"]
    if collection == "grifters-squaddies":
        tags += ["chaotic", "wallstreet"]
    return list(dict.fromkeys(tags)) or ["meme"]


def build_registry() -> list:
    projects = {p["id"]: p for p in json.loads((DATA_DIR / "projects.json").read_text())}
    out = []
    for cid in CC0_COLLECTIONS:
        proj = projects.get(cid)
        f = DATA_DIR / f"{cid}.json"
        if not proj or proj.get("license") != "CC0" or not f.exists():
            continue
        for a in json.loads(f.read_text()):
            if a.get("format") != "VRM" or not a.get("model_file_url"):
                continue
            name = a["name"]
            featured = FEATURED.get(name) if cid.startswith("100avatars") else None
            archetypes = featured[0] if featured else _archetypes_for(name, cid)
            voices = []
            for arch in archetypes:
                voices += VIBES.get(arch, {}).get("voices", [])
            arweave = "arweave.net" in a["model_file_url"]
            out.append({
                "id": a["id"],
                "name": name,
                "modelUrl": a["model_file_url"],
                "thumbnailUrl": a.get("thumbnail_url"),
                "collection": proj["name"],
                "collectionId": cid,
                "license": "CC0",
                "licenseSource": "opensourceavatars.com registry (per-collection CC0 declaration)",
                "author": proj.get("creator_id"),
                "tags": archetypes + [STYLE_BY_COLLECTION.get(cid, "stylized")],
                "archetype": archetypes[0],
                "archetypes": archetypes,
                "style": STYLE_BY_COLLECTION.get(cid, "stylized"),
                "animationProfile": VIBES.get(archetypes[0], {}).get("animation", "relaxed"),
                "compatibleVoices": list(dict.fromkeys(voices))[:6],
                "qualityScore": featured[1] if featured else (70 if arweave else 55),
                "featured": bool(featured),
                "enabled": True,
            })
    return out
