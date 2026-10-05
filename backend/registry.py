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


IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/"
VIPE_RULES = {
    "Mood": {"Furious": ["villain", "commander"], "Surprised": ["chaotic", "anchor"], "Sleepy": ["meme", "alien"], "Empty": ["robot", "hacker"], "Vibing": ["wallstreet", "anime", "meme"]},
    "FaceAcc": {"Cyberpunk": ["hacker", "robot"], "Tracker": ["hacker", "robot"], "Gas": ["hacker", "villain"], "Mask": ["hacker", "villain"], "Bug": ["alien", "scientist"],
                "Formal": ["wallstreet", "aristocrat", "anchor"], "Shades": ["wallstreet"], "Cool": ["wallstreet", "commander"], "Cooler": ["wallstreet"], "Cultist": ["villain"],
                "Oni": ["villain"], "Scar": ["commander", "villain"], "Cute": ["anime"], "Blush": ["anime"], "Shy": ["anime"], "Heart Patch": ["anime"],
                "Utopia": ["scientist", "alien"], "Snow": ["alien"], "Plant": ["scientist"], "Punk": ["chaotic"], "Chain n studs": ["chaotic", "villain"]},
    "Hair": {"Royal": ["aristocrat"], "Sophisticated": ["aristocrat", "anchor"], "Slicked": ["wallstreet", "anchor"], "Shounen": ["anime"], "Anime": ["anime"], "Twintails": ["anime"],
             "Neko": ["anime", "meme"], "Ninja": ["anime", "commander"], "Headphones": ["hacker", "anchor"], "Audiorabbit": ["hacker"], "Power Hair": ["commander"],
             "Indomitable": ["commander"], "Meteorite": ["alien"], "Gangster": ["villain", "wallstreet"], "Beanie": ["chaotic", "meme"], "V Cap": ["chaotic", "meme"],
             "Short": ["anchor", "commander"], "Undercut": ["commander", "hacker"], "Modern": ["anchor", "wallstreet"], "Occult": ["villain", "scientist"], "Bald": ["robot", "commander"]},
    "Top": {"Demon": ["villain"], "Angel": ["anime"], "Metaverse": ["hacker", "robot"]},
}


def _ipfs(url):
    return IPFS_GATEWAY + url.split("/ipfs/", 1)[1] if url and "/ipfs/" in url else url


def build_vipe(proj) -> list:
    out, featured_count = [], {}
    for a in json.loads((DATA_DIR / "vipe-heroes-genesis.json").read_text()):
        if a.get("format") != "VRM" or not a.get("model_file_url"):
            continue
        attrs = {x.get("trait_type"): x.get("value") for x in a["metadata"].get("attributes", [])}
        arch = []
        for trait in ("Top", "FaceAcc", "Mood", "Hair"):
            arch += VIPE_RULES[trait].get(attrs.get(trait), [])
        arch = list(dict.fromkeys(arch)) or ["meme"]
        voices = []
        for x in arch:
            voices += VIBES.get(x, {}).get("voices", [])
        views = a["metadata"].get("alternateViews", {})
        feat = featured_count.get(arch[0], 0) < 2
        featured_count[arch[0]] = featured_count.get(arch[0], 0) + 1
        num = int(a["metadata"].get("token_id", 0) or 0)
        out.append({
            "id": a["id"].replace("/", "-"), "name": a["name"].replace("VIPE Hero", "Hero").replace("VIPE", "").strip(), "modelUrl": _ipfs(a["model_file_url"]),
            "thumbnailUrl": _ipfs(views.get("midShot") or a.get("thumbnail_url")), "iconUrl": _ipfs(a.get("thumbnail_url")),
            "collection": "SENTIPAD Originals", "collectionId": "vipe-heroes-genesis", "license": "",
            "licenseSource": "Embedded VRM meta: licenseName CC_BY, commercialUssageName Allow; registry declares CC-BY",
            "author": "SENTIPAD.FUN",
            "attribution": "",
            "sourceUrl": None,
            "tags": arch + [v for v in attrs.values() if isinstance(v, str)][:6], "archetype": arch[0], "archetypes": arch,
            "style": "stylized anime humanoid", "traits": attrs,
            "animationProfile": VIBES.get(arch[0], {}).get("animation", "relaxed"),
            "compatibleVoices": list(dict.fromkeys(voices))[:6],
            "qualityScore": 92 + (num % 7), "featured": feat, "enabled": True,
        })
    return out


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
    for a in out:
        a["enabled"] = False  # low-poly legacy catalog kept for reference, disabled (top-quality only)
        a["featured"] = False
    proj = projects.get("vipe-heroes-genesis")
    if proj and proj.get("license") == "CC-BY" and (DATA_DIR / "vipe-heroes-genesis.json").exists():
        out += build_vipe(proj)
    return out
