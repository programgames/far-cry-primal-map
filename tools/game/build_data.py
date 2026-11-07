"""Construit data/oros.json à partir des fichiers extraits du jeu (aucune donnée MapGenie).

Usage : python -I tools/game/build_data.py [racine fcp-extract] [dossier fcp-wiki-fr]
        (par défaut E:/fcp-extract et E:/fcp-wiki-fr)

Coordonnées : celles du jeu, en mètres (x vers l'est, y vers le nord), monde de -5120 à +5120.
Sources (dans fcp-extract) :
  work/worldmap_points.json   objets à collectionner (EntityId, position, icône)
  work/markers.json           marqueurs de la carte du jeu (GameElementId, nom interne, textes)
  work/ndb/mapobjectivetype   types et sous-types de marqueurs (bûcher, avant-poste, animaux…)
  work/ndb/craftingrecipe     recettes de l'atelier
  work/fcb/nomadobjecttemplates.fcb.converted.xml   compétences (nom interne -> texte)
  work/strings.json           textes du jeu (français et anglais)
  tools/filelists             chemins des scripts de mission (MissionId = CRC32 du chemin)
Wiki FR : palette « FCP missions » (lignes d'histoire) et page « Compétences » (arbres).
Wiki EN (dossier en/ à côté de fr/) : mêmes pages, pour les textes anglais.
Textes anglais : champ « en » de chaque élément ({"title": …, "desc": …}), lu par public/app.js.
"""
import json
import math
import re
import sys
import zlib
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
APP = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "E:/fcp-extract")
WIKI = Path(sys.argv[2] if len(sys.argv) > 2 else "E:/fcp-wiki-fr") / "fr"
WIKI_EN = WIKI.parent / "en"
load = lambda p: json.load(open(p, encoding="utf-8"))
WORLD = 5120  # demi-largeur du monde (m) : la carte du jeu fait 20 x 512 px à 1 m par pixel

strings = load(SRC / "work/strings.json")
by_id = {s["id"]: s for s in strings}
TAG = re.compile(r"<[^>]+>")
clean = lambda t: TAG.sub("", t or "").replace("\xa0", " ").strip()
text = lambda i, lang="fr": clean(by_id.get(int(i), {}).get(lang)) if i and str(i).lstrip("-").isdigit() and int(i) > 0 else ""
norm = lambda t: re.sub(r"[^a-z0-9]+", " ", t.lower().translate(str.maketrans("àâäéèêëîïôöùûüçœ", "aaaeeeeiioouuuco"))).strip()
report = []

# ------------------------------------------------------------------ casse des titres
# Le jeu écrit les noms en MAJUSCULES. Noms propres : mots écrits avec une majuscule au milieu des titres du wiki.
wiki_titles = [l.strip().split(";")[-1] for l in open(WIKI.parent / "titres.csv", encoding="utf-8")]
mission_palette = open(WIKI / "Modèle/FCP missions.wiki", encoding="utf-8").read()
wiki_titles += [l or t for t, l in re.findall(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]", mission_palette)]
# … et mots que les phrases françaises du jeu (hors textes tout en majuscules) écrivent avec une majuscule.
game_sentences = [clean(s["fr"]) for s in strings if s.get("fr") and clean(s["fr"]).upper() != clean(s["fr"])]
seen = Counter((w.lower(), w[0].isupper()) for t in wiki_titles + game_sentences for w in re.findall(r"\w+", t)[1:]
               if len(w) > 2 and not w.isupper())
proper = {w: w.capitalize() for (w, up), n in seen.items() if up and n > seen[(w, False)]}
proper.update({"wenja": "Wenja", "udam": "Udam", "izila": "Izila", "oros": "Oros"})


def nice(t, en=""):
    """Casse normale. Un mot aussi présent dans le texte anglais du jeu est un nom propre (Sajas, Nakuti…)."""
    t = clean(t)
    if t.upper() != t:
        return t
    shared = {w.lower() for w in re.findall(r"\w+", clean(en)) if len(w) > 2}
    fix = lambda m: m.group(0).capitalize() if m.group(0) in shared else proper.get(m.group(0), m.group(0))
    return re.sub(r"\w+", fix, t.capitalize())


def en_nice(t):
    """Casse des titres anglais : Eagle Cry Peak, Cave of Bones, Primitive Heal II."""
    t = clean(t)
    if t.upper() != t:
        return t
    t = re.sub(r"[A-Za-z][A-Za-z']*", lambda m: m.group(0) if re.fullmatch("[IVX]+", m.group(0)) else m.group(0).capitalize(), t)
    return re.sub(r"(?<=\s)(A|An|And|At|By|For|From|In|Into|Of|On|Or|The|To|With)\b", lambda m: m.group(0).lower(), t)


def game_title(locid, lang="fr"):
    """Titre en casse normale d'un texte du jeu, par son identifiant."""
    s = by_id.get(int(locid), {}) if locid and str(locid).lstrip("-").isdigit() else {}
    if not s.get("fr"):
        return ""
    return nice(s["fr"], s.get("en", "")) if lang == "fr" else en_nice(s.get("en", ""))


# ------------------------------------------------------------------ types de marqueurs
xml = open(SRC / "work/ndb/mapobjectivetype.ndb.rml.converted.xml", encoding="utf-8-sig").read()
TYPES, SUBS = {}, {}
for g in re.finditer(r"<Generic ([^>]*)>(.*?)</Generic>", xml, re.S):
    a = dict(re.findall(r'(\w+)="([^"]*)"', g.group(1)))
    TYPES[a["hidKey"]] = a["Name"]
    for s in re.finditer(r"<MapObjectiveSubType ([^>]*)/>", g.group(2)):
        b = dict(re.findall(r'(\w+)="([^"]*)"', s.group(1)))
        locid = b["locidNameLocalizationID"]
        SUBS[b["disSubTypeId"]] = (b["MarkerLabel"], game_title(locid), game_title(locid, "en"))
markers = load(SRC / "work/markers.json")
for m in markers:
    m["type"] = TYPES.get(m.get("mapobjtypeMapObjectiveType"), "")
    m["sub"], m["subname"], m["subname_en"] = SUBS.get(m.get("MapObjectiveSubType"), ("", "", ""))
    m["name"] = m.get("text_Name") or ""
of = lambda *types: [m for m in markers if m["type"] in types]
dist = lambda a, b: math.hypot(a["x"] - b["x"], a["y"] - b["y"])

# ------------------------------------------------------------------ catégories
GROUPS = [
    {"id": "places", "title": "Lieux", "color": "#EB6B1F", "en": {"title": "Locations"}},
    {"id": "collectibles", "title": "Objets de collection", "color": "#20B4DA", "en": {"title": "Collectibles"}},
    {"id": "missions", "title": "Missions", "color": "#B15FD6", "en": {"title": "Missions"}},
    {"id": "hunting", "title": "Zones de chasse", "color": "#E0B341", "en": {"title": "Hunting Areas"}},
]
CATS = []  # id, groupe, titre, état visé (None = élément non suivi), icône, titre anglais


def cat(cid, group, title, goal, icon, title_en):
    CATS.append({"id": cid, "group": group, "title": title, "goal": goal, "icon": icon, "en": {"title": title_en}})


for args in [  # titres anglais : ceux des textes anglais du jeu
    ("bonfire", "places", "Bûcher", "débloqué", "bonfire", "Bonfire"),
    ("outpost", "places", "Avant-poste", "débloqué", "outpost", "Outpost"),
    ("fort", "places", "Fort", "débloqué", "fort", "Fort"),
    ("village", "places", "Village", "débloqué", "village", "Village"),
    ("cave", "places", "Grotte perdue", "découvert", "lostcave", "Lost Cave"),
    ("campfire", "places", "Feu de camp", "découvert", "campfire", "Campfire"),
    ("landmark", "places", "Lieu", "découvert", "landmark", "Landmark"),
    ("lume", "collectibles", "Main daysha", "ramassé", "lume", "Daysha Hand"),
    ("relic", "collectibles", "Bracelet wenja", "ramassé", "relic", "Wenja Bracelet"),
    ("iziliamask", "collectibles", "Masque izila", "ramassé", "iziliamask", "Izila Mask"),
    ("totem", "collectibles", "Esprit-totem wenja", "ramassé", "totem", "Wenja Spirit Totem"),
    ("cavepainting", "collectibles", "Peinture rupestre", "ramassé", "cavepainting", "Cave Painting"),
    ("treasuremap", "collectibles", "Cache de chasseur", "ramassé", "treasuremap", "Hunter Cache"),
    ("helpwenja", "missions", "Aidez les Wenja", "terminée", "helpingwinja", "Help Wenja"),
    ("tribalclash", "missions", "Choc tribal", "terminée", "tribewar", "Tribal Clash"),
    ("villagemission", "missions", "Mission de village", "terminée", "villagequest", "Village Mission"),
    ("beasthunt", "missions", "Chasse de Maître des Bêtes", "terminée", "hunting", "Beast Master Hunt"),
]:
    cat(*args)
ANIMAL_ICON = {"TibetanWolf": "wolf", "AsianTapir": "tapir", "Goat": "goat", "Bear": "brownbear",
               "sabertoothAnimal": "sabretooth", "Deer": "deer", "Elk": "elk", "Yak": "yak",
               "cavebearAnimal": "cavebear", "Dhole": "dhole", "DemonFish": "bitefish", "Boar": "boar",
               "mammothAnimal": "eldermammoth", "rhinoAnimal": "rhino", "woollyMammothAnimal": "mammoth",
               "cavelionAnimal": "cavelion", "europeanjaguarAnimal": "jaguar", "HoneyBadger": "badger",
               "SnowLeopard": "leopard", "Macaque": "monkey"}
animal_names = {}  # sous-type -> (titre, titre anglais)
for m in of("Sigma/Animals"):
    if m["sub"] in ANIMAL_ICON:
        animal_names[m["sub"]] = (nice(m["subname"]), m["subname_en"])
for sub, (name, name_en) in sorted(animal_names.items(), key=lambda kv: kv[1]):
    cat("animal_" + ANIMAL_ICON[sub], "hunting", name, None, ANIMAL_ICON[sub], name_en)

# ------------------------------------------------------------------ lieux
locations = []


def place(cid, m, title, desc="", icon=None, en=(), **track):
    """en : (titre, description) en anglais."""
    loc = {"id": str(m.get("GameElementId") or m.get("EntityId")), "cat": cid, "title": title,
           "x": round(m["x"], 1), "y": round(m["y"], 1)}
    if desc:
        loc["desc"] = desc
    loc["en"] = {k: v for k, v in zip(("title", "desc"), en) if v}
    if icon:
        loc["icon"] = icon
    if track:
        loc["track"] = track
    locations.append(loc)
    return loc


tip = lambda m, lang="fr": game_title(m.get("locidmapObjectiveToolTipId"), lang)
info = lambda m, lang="fr": text(m.get("locidMapObjectiveToolTipInfoId"), lang)

for m in of("FC3/RadioTower", "FC3/RadioTowerOverFOW"):
    place("bonfire", m, tip(m) or "Bûcher", info(m), en=(tip(m, "en") or "Bonfire", info(m, "en")),
          marker=[m["GameElementId"]])
for m in of("FC3/Safehouse"):
    if m["sub"] == "Outpost":
        place("outpost", m, tip(m) or "Avant-poste", info(m), en=(tip(m, "en") or "Outpost", info(m, "en")),
              marker=[m["GameElementId"]])
    else:
        place("fort", m, tip(m) or nice(m["subname"]), info(m), icon="fort_udam" if "Udam" in m["sub"] else "fort_izila",
              en=(tip(m, "en") or m["subname_en"], info(m, "en")), marker=[m["GameElementId"]])
village = next(m for m in of("Sigma/Tribe") if m["sub"] == "Village")
place("village", village, "Votre village", en=("Your Village",), marker=[m["GameElementId"] for m in of("Sigma/Tribe")])

discovery = of("FC3/LocationDiscovery")
# Grottes perdues : nom officiel (textes « Cave »). Lien marqueur d'entrée -> texte relevé dans une sauvegarde :
# chaque nœud de grotte (0x630310c4) y donne entMarkerEntity et l'identifiant de son nom (0x1c8e4164) ;
# ce sont des données fixes du jeu, présentes dans toute sauvegarde, visitée ou non.
CAVE_NAMES = {
    "2092135874685833431": 428213, "2092135941996024554": 428214, "2092135626037005068": 428215,
    "2092136040555874541": 428218, "2092136077620939103": 428219, "2093102336195961155": 428220,
    "2092135994315770231": 428217, "2092229872437954798": 428202, "2092136119398304451": 428201,
    "2092164186835529183": 429532, "2092412480482446989": 428203, "2092633903727650033": 428207,
    "2092467377600990401": 428197, "2092538258704651994": 428196, "2093796617682444688": 428221,
    "2093797171903102962": 428198, "2093805400982840240": 428195, "2093805798514775506": 428209,
    "2094510840173591615": 428194, "2094512180517960249": 428199, "2094512711005135017": 428257,
    "2094513066298339362": 428222,
}
entrances = of("Sigma/CaveEntrance")
cave_pois = [p for p in discovery if p["subname"].lower().startswith("grotte")]
pairs = sorted((dist(p, e), i, j) for i, e in enumerate(entrances) for j, p in enumerate(cave_pois))
cave_name, used = {}, set()
for d, i, j in pairs:
    if d < 600 and i not in cave_name and j not in used:
        cave_name[i] = cave_pois[j]
        used.add(j)
for i, e in enumerate(entrances):
    poi = cave_name.get(i)
    track = [e["GameElementId"]] + ([poi["GameElementId"]] if poi else [])
    name = game_title(CAVE_NAMES.get(e["GameElementId"])) or (poi["subname"] if poi else "Grotte perdue")
    name_en = game_title(CAVE_NAMES.get(e["GameElementId"]), "en") or (poi["subname_en"] if poi else "Lost Cave")
    place("cave", e, name, en=(name_en,), marker=track)
cave_poi_ids = {cave_pois[j]["GameElementId"] for j in used}
report.append(f"grottes nommées : {len(cave_name)}/{len(entrances)}")
primary = [l for l in locations]
by_name = {norm(l["title"]): l for l in primary}
for m in discovery:
    if m["GameElementId"] in cave_poi_ids:
        continue
    if m["sub"] == "FireCamp":
        place("campfire", m, "Feu de camp", en=("Campfire",), marker=[m["GameElementId"]])
        continue
    # Marqueur de découverte d'un bûcher, d'un avant-poste… (même nom, ou à moins de 150 m) :
    # il sert à l'état « découvert » de ce lieu au lieu de créer un doublon.
    host = by_name.get(norm(m["subname"])) or min(primary, key=lambda l: dist(l, m))
    if norm(host["title"]) == norm(m["subname"]) or dist(host, m) < 150:
        host["track"]["marker"].append(m["GameElementId"])
    elif m["subname"]:
        place("landmark", m, m["subname"], en=(m["subname_en"],), marker=[m["GameElementId"]])
named_places = [l for l in locations if l["cat"] in ("bonfire", "outpost", "fort", "village", "cave", "landmark")]

# ------------------------------------------------------------------ objets à collectionner
points = load(SRC / "work/worldmap_points.json")
treasure_tips = of("FC3/Activity")
for icon in ("lume", "relic", "iziliamask", "totem", "cavepainting", "treasuremap"):
    clusters = []  # le jeu stocke certains objets en double à quelques mètres
    for p in (p for p in points if p.get("IconName") == icon):
        near = next((c for c in clusters if dist(c[0], p) < 10), None)
        (near.append(p) if near else clusters.append([p]))
    for c in clusters:
        p = c[0]
        host = min(named_places, key=lambda l: dist(l, p))
        where = where_en = ""
        if dist(host, p) < 600:
            inside = host["cat"] == "cave" and dist(host, p) < 400
            where = ("Dans : " if inside else "Près de : ") + host["title"]
            where_en = ("In: " if inside else "Near: ") + host["en"]["title"]
        desc, desc_en = where, where_en
        if icon == "treasuremap":
            t = min(treasure_tips, key=lambda m: dist(m, p))
            near = dist(t, p) < 80
            desc = "\n\n".join(x for x in (info(t) if near else "", where) if x)
            desc_en = "\n\n".join(x for x in (info(t, "en") if near else "", where_en) if x)
        c2 = next(c2 for c2 in CATS if c2["id"] == icon)
        place(icon, p, c2["title"], desc, en=(c2["en"]["title"], desc_en), pickup=[q["EntityId"] for q in c])
    report.append(f"{icon:14} {len(clusters)} objets")

# ------------------------------------------------------------------ missions
missions = {}  # CRC32 du chemin du script -> code (« mis_030_main »)
for f in (SRC / "tools/filelists").glob("*.filelist"):
    for line in open(f, encoding="utf-8", errors="ignore"):
        path = line.strip().lower()
        parts = path.split("\\")
        if parts[:3] == ["domino", "user", "sigma"] and parts[-1].endswith(".lua") and parts[-1].count(".") == 2:
            missions[str(zlib.crc32(path.encode()))] = parts[-1].split(".")[1]
by_enum = {}
for s in strings:
    e = s.get("enum") or ""
    by_enum.setdefault(int(e, 16) if re.fullmatch(r"0x[0-9A-Fa-f]+", e) else zlib.crc32(e.encode()), s)
titles, titles_en = {}, {}
for code in set(missions.values()):
    s = by_enum.get(zlib.crc32(code.upper().encode()))
    if s and s["section"] == "Description":
        titles[code], titles_en[code] = clean(s["fr"]), clean(s["en"])

SQ = re.compile(r"(sq[a-z]{2}_[a-z]\d[a-z]?)_")
quests = defaultdict(list)
for m in of("FC3/QuestGiver"):
    k = SQ.search(m["name"])
    if k:
        quests[k.group(1)].append(m)
for code, ms in sorted(quests.items()):
    ms.sort(key=lambda m: ("overfow" in m["name"], "after" in m["name"]))  # le donneur d'origine d'abord
    m = ms[0]
    place("tribalclash" if code[:4] in ("sqbh", "sqsa") else "helpwenja", m, nice(m["subname"]), info(m),
          en=(m["subname_en"], info(m, "en")), mission=[code + "_main"])
villagers = defaultdict(list)
for m in of("FC3/QuestGiver"):
    k = re.search(r"(vm_\d{3})_", m["name"])
    if k and k.group(1) + "_main" in titles:
        villagers[k.group(1)].append(m)
for code, ms in sorted(villagers.items()):
    m = ms[0]
    place("villagemission", m, nice(titles[code + "_main"]), info(m),
          en=(en_nice(titles_en[code + "_main"]), info(m, "en")), mission=[code + "_main"])
HUNTS = {"cavebear": ("cavebear", "hunt_bear"), "sabretooth": ("sabertooth", "hunt_sabretooth"),
         "direwolf": ("wolfpack", "hunt_wolf"), "mammoth": ("mammoth", "hunt_mammoth")}
for sub, (quest, icon) in HUNTS.items():
    ms = sorted((m for m in of("Sigma/EpicHunt") if m["sub"] == sub), key=lambda m: "questgiver" not in m["name"])
    if ms:
        place("beasthunt", ms[0], nice(ms[0]["subname"]), icon=icon, en=(ms[0]["subname_en"],), hunt=[quest])

for m in of("Sigma/Animals"):
    if m["sub"] in ANIMAL_ICON:
        name, name_en = animal_names[m["sub"]]
        place("animal_" + ANIMAL_ICON[m["sub"]], m, name, en=(name_en,))

# ------------------------------------------------------------------ onglet Missions
# Lignes d'histoire, ordre du jeu et titres en casse normale : palette « FCP missions » du wiki FR.
bare = lambda t: re.sub(r"^(le|la|les|l) ", "", norm(t))
bare_en = lambda t: re.sub(r"^(the|a|an) ", "", norm(t))
by_bare = defaultdict(list)
for c, t in sorted(titles.items()):
    by_bare[bare(t)].append(c)


def palette_lines(wiki_text):
    """(ligne d'histoire, titre) de chaque mission d'une palette « FCP missions »."""
    out, header = [], None
    for line in wiki_text.splitlines():
        if line.startswith("!"):
            header = line.split("|")[-1].strip().lstrip("!").strip()
        elif header and line.startswith("|") and "[[" in line:
            for target, label in re.findall(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]", line):
                out.append((header, label or target))
            header = None
    return out


lines = palette_lines(mission_palette)
lines_en = palette_lines(open(WIKI_EN / "Template/FCP missions.wiki", encoding="utf-8").read())
placed, mission_list = set(), []
for group, title in lines:
    codes = [c for c in by_bare.get(bare(title), []) if c not in placed]
    if codes:
        placed.add(codes[0])
        mission_list.append({"code": codes[0], "title": title, "group": group})
FALLBACK = {"str": "Conclusion", "shc": "Missions de grotte", "mis": "Introduction", "end": "Conclusion"}
for c, t in sorted(titles.items()):
    if c not in placed:
        same = next((l for _, l in lines if norm(l) == norm(t)), None)
        mission_list.append({"code": c, "title": same or nice(t), "group": FALLBACK.get(c.split("_")[0], "Autres missions")})
order = list(dict.fromkeys(m["group"] for m in mission_list))
mission_list.sort(key=lambda m: order.index(m["group"]))
GIVER = re.compile(r"giver|missionlocation")
for m in mission_list:  # position : donneur de la mission (ou lieu de mission)
    prefix = m["code"].rsplit("_", 1)[0]
    hits = [p for p in markers if GIVER.search(p["name"]) and re.search(rf"(^|[_.]){re.escape(prefix)}(_|$)|{prefix.replace('_', '')}_", p["name"])]
    hits.sort(key=lambda p: "givermarker" not in p["name"])
    if hits:
        m["x"], m["y"] = round(hits[0]["x"], 1), round(hits[0]["y"], 1)
report.append(f"missions : {len(mission_list)} titrées, {len(placed)} placées par le wiki, {sum('x' in m for m in mission_list)} situées")

# Textes anglais : palette du wiki EN, retrouvée par le titre anglais du jeu. Mission absente de la palette :
# ligne d'histoire anglaise la plus fréquente parmi les missions de la même ligne française.
en_line = {}
for g, t in lines_en:
    en_line.setdefault(bare_en(t), (g, t))
votes = defaultdict(Counter)
for m in mission_list:
    g, t = en_line.get(bare_en(titles_en[m["code"]]), ("", ""))
    m["en"] = {"title": t or en_nice(titles_en[m["code"]]), "group": g}
    if g:
        votes[m["group"]][g] += 1
FALLBACK_EN = {"Conclusion": "Conclusion", "Missions de grotte": "Cave Missions", "Introduction": "Intro"}
for m in mission_list:
    if not m["en"]["group"]:
        v = votes[m["group"]].most_common(1)
        m["en"]["group"] = v[0][0] if v else FALLBACK_EN.get(m["group"], "Other Missions")
report.append(f"missions EN : {sum(sum(v.values()) for v in votes.values())} placées par le wiki EN")

# ------------------------------------------------------------------ atelier
recipes = []
xml = open(SRC / "work/ndb/craftingrecipe.ndb.rml.converted.xml", encoding="utf-8").read()
for g in re.finditer(r"<Generic ([^>]*)>", xml):
    a = dict(re.findall(r'(\w+)="([^"]*)"', g.group(1)))
    name = text(a["locidItemNameId"])
    # ark 0 = niveau final fictif d'une chaîne ; « XX - Archived » = recettes retirées du jeu.
    if (a["cftrcptpeType"] == "5" and name and a["arkArchetype"] != "0" and not a["Name"].startswith("XX")
            and all(r["ark"] != a["arkArchetype"] for r in recipes)):
        recipes.append({"ark": a["arkArchetype"], "group": nice(name), "level": int(a["iCurrentLevel"]) + 1, "sort": int(a["iSortId"]),
                        "en": {"group": en_nice(text(a["locidItemNameId"], "en"))}})
recipes.sort(key=lambda r: (r["sort"], r["group"], r["level"]))
crafting = [{k: r[k] for k in ("ark", "group", "level", "en")} for r in recipes]
report.append(f"atelier : {len(crafting)} améliorations")

# ------------------------------------------------------------------ compétences
tpl = ET.parse(SRC / "work/fcb/nomadobjecttemplates.fcb.converted.xml").getroot()


def fval(o, n):
    f = o.find(f"field[@name='{n}']") if o is not None else None
    return next((v for k, v in f.attrib.items() if k.startswith("value-")), None) if f is not None else None


skill_hash, skill_en = {}, {}  # nom -> hash ; hash -> nom anglais
for ab in tpl.iter("object"):
    if ab.get("name") == "Ability" and (fval(ab, "text_name") or "").startswith("SP_"):
        locid = fval(ab.find("object[@name='Properties']"), "locidLocalizedSkillName") or 0
        name = text(locid)
        if name:
            h = skill_hash.setdefault(norm(name), zlib.crc32(fval(ab, "text_name").encode()))
            skill_en.setdefault(h, en_nice(text(locid, "en")))


def skill_rows(path):
    """(personnage, nom de l'arbre, compétence) de chaque ligne d'une page « Compétences » du wiki."""
    rows, tree, prev = [], None, ""
    for line in open(path, encoding="utf-8"):
        m = re.match(r"==\s*\[\[([^\]]+)\]\]\s*-\s*(.+?)\s*==", line)
        if m:
            tree = m.groups()
        elif tree and line.startswith("|") and not line.startswith(("|-", "|}")) and prev.startswith("|-"):
            rows.append((*tree, line[1:].strip()))
        prev = line
    return rows


# Page anglaise : même découpage par personnage ; ses titres donnent la casse des noms anglais.
rows_en = skill_rows(WIKI_EN / "Skills (Far Cry Primal).wiki")
tree_en = {who: f"{tree} ({who})" for who, tree, _ in rows_en}
title_en = {norm(t): t for _, _, t in rows_en}
skills = []
for who, tree, title in skill_rows(WIKI / "Compétences (Far Cry Primal).wiki"):
    if norm(title) in skill_hash:
        h = skill_hash[norm(title)]
        skills.append({"hash": str(h), "title": title, "tree": f"{tree} ({who})",
                       "en": {"title": title_en.get(norm(skill_en[h]), skill_en[h]), "tree": tree_en[who]}})
report.append(f"compétences : {len(skills)}, dont {sum(s['en']['title'] in title_en.values() for s in skills)} titres du wiki EN")

# ------------------------------------------------------------------ écriture
ids = Counter(l["id"] for l in locations)
assert not [i for i, n in ids.items() if n > 1], "identifiants de lieux en double"
lacks_en = lambda o, keys: any(o.get(k) and not o["en"].get(k) for k in keys)  # (« group » des catégories = identifiant)
missing_en = ([o for o in GROUPS + CATS + locations + skills if lacks_en(o, ("title", "desc", "tree"))]
              + [o for o in mission_list + crafting if lacks_en(o, ("title", "group"))])
assert not missing_en, f"textes anglais absents : {missing_en[:5]}"
data = {
    "version": 2,
    "world": {"min": -WORLD, "max": WORLD},
    # Brouillard de guerre : grille de 1024 x 1024 bits sur le même monde (voir lib/save.js).
    "fog": {"min": -WORLD, "max": WORLD},
    "groups": GROUPS,
    "categories": CATS,
    "locations": locations,
    "missions": missions,
    "missionList": mission_list,
    "crafting": crafting,
    "skills": skills,
}
out = APP / "data/oros.json"
json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
per_cat = Counter(l["cat"] for l in locations)
print(f"{out} : {len(locations)} lieux, {sum(1 for l in locations if 'track' in l)} suivis")
print(", ".join(f"{c['title']} {per_cat[c['id']]}" for c in CATS))
print("\n".join(report))
