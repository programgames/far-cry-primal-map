"""Fond de carte : tuiles Leaflet tiles/{z}/{x}/{y}.jpg tirées de la carte du monde du jeu.

Usage : python -I tools/game/build_tiles.py [dossier png/worldmap de fcp-extract]

Source : niveau 3 de worldmap.xbt (converti en PNG), 20 x 20 tuiles de 512 px, 1 m par pixel ;
le fichier 3_a_b va en colonne b, ligne a ; le pixel (0, 0) est le coin nord-ouest du monde (-5120, +5120).
Sortie : zooms 0 à 5, tuiles de 320 px ; au zoom 5, 1 pixel = 1 m (voir la projection dans public/app.js).
Les tuiles entièrement noires (hors du monde) ne sont pas écrites.
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "E:/fcp-extract/png/worldmap")
OUT = Path(__file__).resolve().parents[2] / "tiles"
SIZE, TILE, GRID, MAXZ = 10240, 320, 20, 5

world = Image.new("RGB", (SIZE, SIZE))
for f in SRC.glob("3_*_*.png"):
    _, a, b = map(int, f.stem.split("_"))
    world.paste(Image.open(f).convert("RGB"), (b * 512, a * 512))

if OUT.exists():
    shutil.rmtree(OUT)
written = 0
for z in range(MAXZ, -1, -1):
    img = world if z == MAXZ else world.resize((SIZE >> (MAXZ - z),) * 2, Image.LANCZOS)
    n = img.width // TILE
    for x in range(n):
        for y in range(n):
            tile = img.crop((x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE))
            if max(tile.getextrema(), key=lambda e: e[1])[1] < 6:
                continue  # hors du monde
            path = OUT / str(z) / str(x) / f"{y}.jpg"
            path.parent.mkdir(parents=True, exist_ok=True)
            tile.save(path, quality=84, optimize=True)
            written += 1
    print(f"zoom {z} : {n} x {n}")
print(f"{written} tuiles dans {OUT}")
