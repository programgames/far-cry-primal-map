# Oros Map — Far Cry Primal progress tracker

A map of Oros that **reads your Far Cry Primal save file** and ticks off everything you have done:
collectibles picked up, bonfires and outposts taken, caves and places discovered, missions
completed, skills learned and crafting upgrades made. Nothing to tick by hand — keep the map open
on a second screen and it updates every time the game saves.

> Unofficial fan project, not affiliated with or endorsed by Ubisoft.
> Far Cry Primal and all its content (map, texts, icons) are the property of Ubisoft Entertainment.

## Download and start (Windows)

1. Download **`OrosMap-x.y.z-windows.zip`** from the [latest release](../../releases/latest).
2. Unzip the whole file into any folder (right-click → *Extract All…*).
3. Double-click **`OrosMap.exe`**. The map opens in your web browser.
4. Leave the black window open while you use the map; close it to stop the map.

Nothing to install: the download contains everything it needs. If Windows shows
*"Windows protected your PC"*, click **More info → Run anyway** (the app is free and not signed).

Full help: see the [wiki](../../wiki).

## What it shows

- **Map**: the game's own world map, with all collectibles (Daysha hands, Wenja bracelets,
  Izila masks, spirit totems, cave paintings, hunter caches), bonfires, outposts, forts, lost caves,
  camp fires, named places, side missions, Beast Master hunts and animal areas — each at its exact
  position from the game data.
- **Your progress**: what is done is greyed out with a green tick. Option: *hide what is done*.
- **Fog of war**: option to darken the areas you have never explored (read from your save).
- **Missions** tab: the 64 story and side missions, grouped by story line, with a button to show
  the mission giver on the map.
- **Skills** tab: the 80 skills by skill tree, and the 55 crafting upgrades.
- **Summary**: game progress (%) and play time, as the game reports them.

The interface is in French for now; other languages are planned.

## Your save file

The app finds your save automatically (Ubisoft Connect `savegames` folders on every drive; a save is
recognised by its content, so the Ubisoft, Steam and Epic versions all work). If it cannot find it,
click **📁** in the app and choose the folder. The save is only **read**, never modified, and nothing
leaves your PC (the only network request is an optional check for a new version on GitHub).

## For developers

- Runtime: Node.js 22.2+, no npm dependency. `node server.js --open` serves the app on
  `http://localhost:4173`. `node lib/save.js` checks that your save can be read.
- `node tools/package.js` builds `dist/OrosMap/` and the release zip (launcher compiled with the C#
  compiler that ships with Windows, plus a copy of `node.exe`).
- Game data in `data/` is pre-built from files extracted from the game, with the scripts in
  `tools/game/` (`build_data.py`, `build_icons.py`, `build_tiles.py`, Python 3 + Pillow). Building it
  again needs your own extraction of the game files; see the docstrings of those scripts.
- How the save format was decoded: [`docs/save-format.md`](docs/save-format.md).

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/progress` | state of every map element, missions, skills, crafting, progress, play time |
| `GET` | `/api/fog` | fog of war: raw 1024 × 1024 bit grid |
| `POST` | `/api/save-location/pick` | Windows folder dialog to choose the save folder |
| `POST` | `/api/save-location/auto` | back to automatic search |
| `GET` | `/api/update` | newer release on GitHub? |

The server only listens on `127.0.0.1`.

## License

Source code: [MIT](LICENSE). Game content: © Ubisoft.
