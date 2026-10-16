"""The agents' faces on the website, chosen as the apps choose them.

The apps give every agent a clay face from their catalogue
(ios/SimeonCore/Sources/SimeonCore/Resources/Faces, `AgentFaces` in
AgentFaces.swift; the founder, 12 October 2026: no more butterflies). The page
and its demo show the same people (Simeon, Theo, Iris, Scout, Nora, Mila, Yodo,
Felix), so each wears the face the apps would give them in one team: the Chief
of Staff gets Simeon's own face; any other agent the face its name's gender has
fewest of, ties settled by its id (`AgentFaces.pick`, `AgentVoices.nameGender`
and `stableHash`, ported here as they are).
"""
import json, os, re, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CATALOGUE = f"{REPO}/ios/SimeonCore/Sources/SimeonCore/Resources/Faces"
NAMES = f"{REPO}/desktop/source/shared/voice-call/name-genders.ts"
SIMEON = "clay-simeon"

FACES = json.load(open(f"{CATALOGUE}/faces.json"))["faces"]
POOL = [f for f in FACES if f["id"] != SIMEON]

def _names(const):
    block = re.search(r"\bconst " + const + r" =\s*((?:\"[^\"]*\"\s*\+?\s*)+);", open(NAMES).read()).group(1)
    return " ".join(re.findall(r"\"([^\"]*)\"", block)).split()

WOMEN, MEN = _names("WOMEN_NAMES"), _names("MEN_NAMES")
_women, _men = set(WOMEN), set(MEN)
_titles = {"mrs": "female", "ms": "female", "miss": "female", "madam": "female", "lady": "female",
           "mr": "male", "sir": "male", "lord": "male",
           "dr": None, "doctor": None, "prof": None, "professor": None, "captain": None, "coach": None}

def name_gender(name):
    """"female", "male", or None: `AgentVoices.nameGender`."""
    bare = "".join(c for c in unicodedata.normalize("NFD", name) if not unicodedata.combining(c)).lower()
    for word in re.findall(r"[a-z]+", bare):
        if word in _titles:
            if _titles[word]: return _titles[word]
            continue
        return "female" if word in _women else "male" if word in _men else None
    return None

def stable_hash(text):
    """FNV-1a over the UTF-16 code units: `AgentVoices.stableHash`."""
    h = 2166136261
    units = text.encode("utf-16-le")
    for i in range(0, len(units), 2):
        h ^= units[i] | (units[i + 1] << 8)
        h = (h * 16777619) & 0xFFFFFFFF
    return h

def pick(agent_id, gender, taken):
    """The face fewest agents wear among `gender`'s, ties by the agent's id: `AgentFaces.pick`."""
    candidates = [f for f in POOL if f["gender"] == gender] or POOL
    counts = {f["id"]: taken.count(f["id"]) for f in candidates}
    fewest = min(counts.values())
    free = [f for f in candidates if counts[f["id"]] == fewest]
    return free[stable_hash(agent_id) % len(free)]

def plan(agents):
    """Faces for a team: [(id, name, is Chief of Staff)] in agent-id order, as `AgentFaces.plan` gives them."""
    taken, given = [], {}
    for agent_id, name, chief in sorted(agents, key=lambda a: a[0].encode("utf-16-be")):
        if chief:
            face = next(f for f in FACES if f["id"] == SIMEON)
        else:
            gender = name_gender(name) or ("female" if stable_hash(agent_id) % 2 == 0 else "male")
            face = pick(agent_id, gender, taken)
            taken.append(face["id"])
        given[agent_id] = face
    return given

# Everyone the page and its demo show, as one team: the demo's ids for its own agents
# (desktop/demo/scenario.ts), the page's names for the rest.
CAST = [("simeon", "Simeon", True), ("theo", "Theo", False), ("iris", "Iris", False), ("scout", "Scout", False),
        ("agent-nora", "Nora", False), ("mila", "Mila", False), ("yodo", "Yodo", False), ("felix", "Felix", False)]
GIVEN = plan(CAST)

# The faces the demo's onboarding seats, by seat id (demo-faces.js): the Chief of Staff's web of six, and the cast
# that floats round the connect step. They are the apps' first run's seats as Onboarding.swift had them before its
# first run became the short one (debbbe67), kept here since the demo still shows that onboarding.
SEATS = {"inbox": "clay-06", "research": "clay-20", "travel": "clay-12", "finance": "clay-28", "sales": "clay-22",
         "content": "clay-23", "weekly-standup": "clay-24", "invoice-chaser": "clay-07", "sales-forecast": "clay-19"}

def face(agent_id):
    """The catalogue face this cast member wears, e.g. "clay-07"."""
    return GIVEN[agent_id]["id"]

if __name__ == "__main__":
    for agent_id, name, chief in CAST:
        print(f"{name:7} {face(agent_id):12} {GIVEN[agent_id]['gender']:6} name says {name_gender(name)}")
