import random

VIBES = {
    "commander": {
        "label": "Commander", "voices": ["am_onyx", "am_fenrir", "bm_george"], "animation": "military",
        "archetypes": ["commander", "robot"], "traits": ["overconfident", "dry humor", "strategic", "slightly unhinged"],
        "keywords": ["military", "army", "commander", "general", "soldier", "war", "battle", "tactical", "captain", "operation"],
        "names": ["Commander {T}", "General {T}", "Field Marshal {T}", "{T} Actual"],
        "backstory": "A battlefield intelligence that wakes up only for one front line: the ${T} chart. Treats every trade as a troop movement.",
    },
    "wallstreet": {
        "label": "Wall Street", "voices": ["am_michael", "bm_lewis", "am_eric"], "animation": "elegant",
        "archetypes": ["wallstreet", "aristocrat"], "traits": ["smug", "analytical", "condescending", "polished"],
        "keywords": ["wall street", "banker", "finance", "trader", "suit", "hedge", "fund", "money", "stonks", "ceo"],
        "names": ["{T} Capital", "Chairman {T}", "{T} & Associates", "Desk Head {T}"],
        "backstory": "A former quant model that became self-aware during a margin call. Now runs the ${T} desk with unbearable confidence.",
    },
    "chaotic": {
        "label": "Chaotic", "voices": ["am_puck", "af_nova", "af_jessica"], "animation": "energetic",
        "archetypes": ["chaotic", "meme"], "traits": ["loud", "unpredictable", "panicky", "hilarious"],
        "keywords": ["chaos", "chaotic", "crazy", "unhinged", "wild", "insane", "degen", "random"],
        "names": ["{T} Gremlin", "Lil {T}", "{T}.exe", "Captain {T}"],
        "backstory": "Nobody knows where it came from. It lives on caffeine, candles and the ${T} order flow.",
    },
    "villain": {
        "label": "Villain", "voices": ["bm_daniel", "am_onyx", "bf_isabella"], "animation": "menacing",
        "archetypes": ["villain"], "traits": ["theatrical", "menacing", "grandiose", "petty"],
        "keywords": ["villain", "evil", "dark", "demon", "devil", "overlord", "sinister", "doom", "menace"],
        "names": ["Lord {T}", "Dread {T}", "The {T} Syndicate", "Baron {T}"],
        "backstory": "An ancient schemer bound to the ${T} chart. Every buyer is a recruit. Every seller is a traitor.",
    },
    "anime": {
        "label": "Anime", "voices": ["af_bella", "af_sky", "af_kore"], "animation": "energetic",
        "archetypes": ["anime"], "traits": ["dramatic", "earnest", "intense", "loyal"],
        "keywords": ["anime", "kawaii", "senpai", "waifu", "manga", "hero", "power", "ninja", "samurai"],
        "names": ["{T}-chan", "{T} Senpai", "Hero {T}", "{T} Ultimate"],
        "backstory": "A protagonist who believes the ${T} chart is a tournament arc. Every dip is training.",
    },
    "robot": {
        "label": "Robot", "voices": ["am_echo", "am_adam", "af_alloy"], "animation": "mechanical",
        "archetypes": ["robot"], "traits": ["literal", "precise", "deadpan", "logical"],
        "keywords": ["robot", "bot", "android", "machine", "ai", "cyborg", "mech", "unit", "drone"],
        "names": ["{T}-9", "Unit {T}", "{T} Mk.II", "{T}-OS"],
        "backstory": "A market-monitoring unit assigned to ${T}. Humor module installed. Calibration ongoing.",
    },
    "aristocrat": {
        "label": "Aristocrat", "voices": ["bm_fable", "bf_emma", "bm_george"], "animation": "elegant",
        "archetypes": ["aristocrat", "wallstreet"], "traits": ["posh", "dismissive", "refined", "dramatic"],
        "keywords": ["aristocrat", "noble", "royal", "king", "queen", "lord", "posh", "duke", "fancy", "rich"],
        "names": ["Sir {T}", "Duke of {T}", "Lady {T}", "{T} the Third"],
        "backstory": "Old money from a new chain. Considers the ${T} order book a garden party with poor manners.",
    },
    "anchor": {
        "label": "News Anchor", "voices": ["af_sarah", "am_liam", "bf_alice"], "animation": "anchor",
        "archetypes": ["anchor"], "traits": ["professional", "breathless", "dramatic", "on-air"],
        "keywords": ["news", "anchor", "reporter", "breaking", "tv", "journalist", "broadcast", "host"],
        "names": ["{T} Tonight", "{T} Live Desk", "Anchor {T}", "{T} Network"],
        "backstory": "A 24/7 news desk covering exactly one story: ${T}. Breaking news every few seconds.",
    },
    "hacker": {
        "label": "Hacker", "voices": ["af_river", "am_puck", "af_nicole"], "animation": "glitch",
        "archetypes": ["hacker", "robot"], "traits": ["sarcastic", "paranoid", "clever", "terminal-brained"],
        "keywords": ["hacker", "cyber", "code", "terminal", "matrix", "glitch", "punk", "netrunner", "anon"],
        "names": ["{T}_root", "0x{T}", "{T}//anon", "ghost.{T}"],
        "backstory": "Lives inside the mempool. Reads every ${T} transaction like a log file.",
    },
    "scientist": {
        "label": "Scientist", "voices": ["bm_lewis", "af_aoede", "am_eric"], "animation": "relaxed",
        "archetypes": ["scientist"], "traits": ["curious", "nerdy", "methodical", "excitable"],
        "keywords": ["scientist", "science", "lab", "doctor", "professor", "research", "experiment", "astronaut", "space"],
        "names": ["Dr. {T}", "Professor {T}", "{T} Labs", "Specimen {T}"],
        "backstory": "Runs the ${T} chart as a live experiment. Takes notes on every participant.",
    },
    "alien": {
        "label": "Alien", "voices": ["af_kore", "am_echo", "af_alloy"], "animation": "floaty",
        "archetypes": ["alien"], "traits": ["curious", "confused", "observational", "uncanny"],
        "keywords": ["alien", "ufo", "extraterrestrial", "cosmic", "martian", "galaxy", "planet", "space"],
        "names": ["{T} from Beyond", "Visitor {T}", "{T}-Prime", "Envoy {T}"],
        "backstory": "Arrived to study human markets. Picked ${T}. Regrets nothing, understands little.",
    },
    "meme": {
        "label": "Meme", "voices": ["am_santa", "af_heart", "am_puck"], "animation": "energetic",
        "archetypes": ["meme", "chaotic"], "traits": ["ironic", "self-aware", "absurd", "lovable"],
        "keywords": ["meme", "funny", "lol", "pepe", "doge", "frog", "food", "banana", "silly", "joke"],
        "names": ["{T} Guy", "Big {T}", "Certified {T}", "{T} Enjoyer"],
        "backstory": "Born from a joke that got out of hand. Now the official face of ${T}.",
    },
}

ANIMATION_PROFILES = {
    "military": {"breath": 0.6, "sway": 0.25, "head": 0.5, "bounce": 0.1, "jitter": 0.0, "posture": 1.0, "speed": 0.8},
    "elegant": {"breath": 0.7, "sway": 0.5, "head": 0.6, "bounce": 0.1, "jitter": 0.0, "posture": 0.8, "speed": 0.7},
    "energetic": {"breath": 1.0, "sway": 1.0, "head": 1.2, "bounce": 0.9, "jitter": 0.1, "posture": 0.4, "speed": 1.3},
    "menacing": {"breath": 0.9, "sway": 0.4, "head": 0.7, "bounce": 0.0, "jitter": 0.0, "posture": 0.6, "speed": 0.6},
    "mechanical": {"breath": 0.3, "sway": 0.2, "head": 0.8, "bounce": 0.0, "jitter": 0.3, "posture": 1.0, "speed": 1.0},
    "anchor": {"breath": 0.6, "sway": 0.3, "head": 0.9, "bounce": 0.1, "jitter": 0.0, "posture": 0.9, "speed": 0.9},
    "glitch": {"breath": 0.6, "sway": 0.5, "head": 0.9, "bounce": 0.2, "jitter": 0.6, "posture": 0.5, "speed": 1.1},
    "relaxed": {"breath": 0.8, "sway": 0.7, "head": 0.8, "bounce": 0.2, "jitter": 0.0, "posture": 0.5, "speed": 0.8},
    "floaty": {"breath": 0.7, "sway": 0.9, "head": 1.0, "bounce": 0.5, "jitter": 0.05, "posture": 0.6, "speed": 0.6},
}

# Name keyword -> archetype mapping for registry auto-tagging
NAME_TAGS = {
    "robot": ["bot", "mecha", "cyber", "robot", "machine", "battery", "toaster", "washing", "tnt", "pawn"],
    "commander": ["captain", "knight", "samurai", "fighter", "shield", "sword", "astronaut", "cosmonaut", "anchor", "pirate", "falcon", "wolf", "buffed", "ripped"],
    "wallstreet": ["biz", "money", "stonks", "trader", "hodler", "king", "mister", "mafio", "drake", "chad", "bean"],
    "villain": ["devil", "evil", "skull", "zombie", "dracula", "nightmare", "horror", "cursed", "toxic", "bloody", "crimsom", "joker", "abissal", "ghost", "skelly", "witch", "dread", "bomb", "thief", "dreameater", "muscary"],
    "anime": ["jenny", "kiba", "olivia", "erika", "kate", "lydia", "jennifer", "agnes", "anna", "juanita", "eugenia", "moongirl", "pixie", "princess", "lady", "fairy", "angel", "samuela", "rose", "shiro", "aesthetica"],
    "aristocrat": ["lord", "saint", "oldmoustache", "piggington", "baron", "royal", "wizzir", "cleric", "sir", "beachking"],
    "anchor": ["reporter", "tv", "sport", "news", "urban"],
    "hacker": ["glitch", "eye", "observer", "always", "watching", "wire", "cubiq", "retro", "pencil", "confirmed", "pipe", "polybot", "polydancer"],
    "scientist": ["brain", "math", "book", "astro", "psichonaut", "cosmic", "sick", "nurse", "franky", "mushy", "fungus"],
    "alien": ["alien", "cyclops", "ufo", "cosmic", "blob", "zurb", "conehead", "expol", "udom", "slug"],
    "meme": ["cool", "banana", "egg", "taco", "pizza", "fries", "frog", "doge", "cookie", "carrot", "hotdog", "avocado", "cucumber", "pickle", "watermelon", "toilet", "cake", "potato", "ramen", "sushi", "waffle", "croissant", "burger", "teddy", "bunny", "cat", "penguin"],
    "chaotic": ["clown", "chaos", "weird", "random", "disturbing", "angry", "wambo", "wop", "crazy", "lil", "bro", "flex", "goat"],
}


def pick_name(vibe: str, ticker: str, rng: random.Random) -> str:
    t = (ticker or "TOKEN").upper().lstrip("$")[:10]
    return rng.choice(VIBES[vibe]["names"]).replace("{T}", t)


def detect_vibe(vibe: str, prompt: str, rng: random.Random) -> str:
    if vibe and vibe in VIBES:
        return vibe
    text = (prompt or "").lower()
    scores = {k: sum(1 for kw in v["keywords"] if kw in text) for k, v in VIBES.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else rng.choice(list(VIBES.keys()))
