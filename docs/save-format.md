# Far Cry Primal save format (what this app reads)

Files: `…\Ubisoft Game Launcher\savegames\<account id>\<game id>\1.save` and `2.save`
(two alternating autosaves; `<game id>` is `2010` for the Ubisoft Connect version). The app reads the
most recent one and recognises a save by the map name `primal_main` in its header.

## Container

- `0x224`-byte header (save name, hashes), then a Dunia engine **binary object tree** from `0x2AD`.
- Node: child count, `u32` name hash, value count, values, children.
- Value: `u32` name hash, size, data.
- Counts: byte `< 0xFE` = value; `0xFF` + `u32` = value; `0xFE` + `u32` = back-reference to data already
  written (target = position after the `0xFE` byte − offset).
- Names are CRC32 hashes of property names (most resolved with FCBConverter's string list).

Parser: [`public/savefile.js`](../public/savefile.js).

## What is used

| Data | Where in the tree | Linked to |
| --- | --- | --- |
| Progress %, play time | `CMenuSaveable.Progression`, `TotalGameTime` | — |
| Collectibles picked up | `ActivatedOpenWorldItems/OpenWorldItems.Id`; cave items `Collectible` (`0xc40bb3d5` = taken) | `EntityId` in the game's collectibles library |
| Places discovered / revealed | `DiscoveredLocations`, `RevealedLocations` (`Location`) | `GameElementId` of map objective markers |
| Fast travel unlocked (bonfires, outposts, forts, village) | `WorldMapItems.0x5f21a306` | marker `GameElementId` |
| Lost caves visited | node `0x630310c4`: `entMarkerEntity` + `0x308d9fbe` = 1 | cave entrance marker |
| Missions | `Mission.MissionId` = CRC32 of the lower-case Lua script path; `State` 3 = completed | mission scripts (`domino\user\sigma\…`) |
| Mission titles | `strings` (section *Description*) whose enum = CRC32 of the upper-case code (`VM_090_MAIN`) | — |
| Skills | `Abilities.abilityName` = CRC32 of the internal name (`SP_TameAnimalsA`) | `nomadobjecttemplates.fcb` → localized name |
| Crafting | `Item.0xd8f2aab5` = recipe `arkArchetype`; `bCraftedAtLeastOnce` | `craftingrecipe.ndb` (type 5 = upgrades) |
| Fog of war | `CFogOfWarService/FogData.Data`: **LZO1X** stream → 1024 × 1024 bits (1 = explored, row 0 = north, low bit = west) over the world −5120…+5120 m | — |

## Map

The background is the game's own world map (`worldmap.xbt`, level 3: 20 × 20 tiles of 512 px,
1 m per pixel; file `3_a_b` goes to column `b`, row `a`). Game coordinates are used directly:
x east, y north, metres, world −5120…+5120.
