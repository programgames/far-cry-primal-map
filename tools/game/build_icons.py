"""Icônes de la carte : sprite public/assets/game-markers.png + data/icons.json, depuis les images du jeu.

Usage : python -I tools/game/build_icons.py [racine fcp-extract]
Les clés sont celles de data/oros.json (champ « icon » des catégories et des lieux).
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "E:/fcp-extract")
APP = Path(__file__).resolve().parents[2]
MAP = ROOT / "icons/mapicon"
ANIMALS = ROOT / "icons/animals"
OPENWORLD = ROOT / "png/common_ui/singleplayer/textures/hud/icons/openworld"

RATIO = 2  # sprite en double résolution
ICONS = {  # clé -> (image du jeu, plus grand côté affiché en px CSS)
    "bonfire": (MAP / "tx_map_icon_pilllaroffirehostile.png", 26),
    "campfire": (MAP / "tx_map_campfire.png", 22),
    "fort": (MAP / "tx_map_icon_fortresshostile.png", 26),
    "landmark": (MAP / "tx_map_icon_majorpoidiscovered.png", 24),
    "lostcave": (MAP / "tx_cave.png", 26),
    "outpost": (MAP / "tx_map_icon_outposthostile.png", 26),
    "village": (MAP / "tx_village_icon.png", 36),
    "lume": (OPENWORLD / "tx_collectible_lume.png", 22),
    "treasuremap": (OPENWORLD / "tx_collectible_map.png", 22),
    "iziliamask": (OPENWORLD / "tx_collectible_izilia_mask.png", 22),
    "relic": (OPENWORLD / "tx_collectible_relic.png", 22),
    "totem": (OPENWORLD / "tx_collectible_totem.png", 22),
    "cavepainting": (OPENWORLD / "tx_collectible_painting.png", 22),
    "hunting": (MAP / "tx_huntingicon.png", 26),
    "helpingwinja": (MAP / "tx_helpingwinja.png", 26),
    "tribewar": (MAP / "tx_tribewar.png", 26),
    "villagequest": (MAP / "tx_villagequest.png", 26),
    "badger": (ANIMALS / "tx_honey_badger.png", 34),
    "bitefish": (ANIMALS / "tx_demon_fish.png", 34),
    "boar": (ANIMALS / "tx_boar_icon.png", 34),
    "brownbear": (ANIMALS / "tx_bear.png", 34),
    "cavebear": (ANIMALS / "tx_map_icon_animal_cavebear.png", 36),
    "cavelion": (ANIMALS / "tx_map_icon_animal_cavelion.png", 36),
    "deer": (ANIMALS / "tx_deer_icon.png", 32),
    "dhole": (ANIMALS / "tx_dhole.png", 32),
    "eldermammoth": (ANIMALS / "tx_map_icon_animal_mammoth.png", 40),
    "goat": (ANIMALS / "tx_ibextest.png", 32),
    "jaguar": (ANIMALS / "tx_map_icon_animal_europeanjaguar.png", 36),
    "leopard": (ANIMALS / "tx_snow_leopard.png", 34),
    "mammoth": (ANIMALS / "tx_map_icon_animal_woollymammoth.png", 38),
    "monkey": (ANIMALS / "tx_macaque.png", 28),
    "sabretooth": (ANIMALS / "tx_map_icon_animal_sabertooth.png", 36),
    "elk": (ANIMALS / "tx_irishelk.png", 34),
    "tapir": (ANIMALS / "tx_asiantapir_icon.png", 32),
    "wolf": (ANIMALS / "tx_tibetan_wolf.png", 32),
    "rhino": (ANIMALS / "tx_map_icon_animal_rhino.png", 36),
    "yak": (ANIMALS / "tx_yak.png", 34),
    "hunt_sabretooth": (MAP / "tx_mission_sabertooth.png", 36),
    "hunt_mammoth": (MAP / "tx_mission_mammoth.png", 36),
    "hunt_bear": (MAP / "tx_mission_bear.png", 36),
    "hunt_wolf": (MAP / "tx_mission_wolf.png", 36),
    "fort_udam": (MAP / "tx_mission_udam.png", 36),
    "fort_izila": (MAP / "tx_mission_izila.png", 36),
}

data = json.load(open(APP / "data/oros.json", encoding="utf-8"))
used = {c["icon"] for c in data["categories"]} | {l["icon"] for l in data["locations"] if "icon" in l}
missing = used - set(ICONS)
assert not missing, f"icônes sans image : {missing}"

images = {}
for k, (src, box) in ICONS.items():
    im = Image.open(src).convert("RGBA")
    im = im.crop(im.getbbox() or (0, 0, *im.size))  # retire les marges transparentes
    scale = box * RATIO / max(im.size)
    images[k] = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)

SHEET_W, PAD = 512, 2
x = y = row_h = 0
placed = {}
for k, im in sorted(images.items(), key=lambda kv: -kv[1].height):
    if x + im.width > SHEET_W:
        x, y, row_h = 0, y + row_h + PAD, 0
    placed[k] = (x, y)
    x += im.width + PAD
    row_h = max(row_h, im.height)
sheet = Image.new("RGBA", (SHEET_W, y + row_h), (0, 0, 0, 0))
for k, (px, py) in placed.items():
    sheet.alpha_composite(images[k], (px, py))
out_png = APP / "public/assets/game-markers.png"
sheet.save(out_png, optimize=True)

icons = {
    "sprite": {"url": "assets/game-markers.png", "width": sheet.width, "height": sheet.height, "pixelRatio": RATIO},
    "icons": {k: {"x": placed[k][0], "y": placed[k][1], "width": images[k].width, "height": images[k].height, "pixelRatio": RATIO} for k in images},
}
json.dump(icons, open(APP / "data/icons.json", "w", encoding="utf-8"), indent=1)
print(f"{out_png} : {sheet.width}x{sheet.height}, {len(images)} icônes")
