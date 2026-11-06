"use strict";
/**
 * Lecture de la sauvegarde de Far Cry Primal (Ubisoft Connect, dossier savegames/<compte>/2010).
 *
 * Format : en-tête de 0x224 octets puis un arbre « binary object » du moteur Dunia.
 *   nœud   = nbEnfants, hash u32 du nom, nbValeurs, valeurs, enfants
 *   valeur = hash u32 du nom, taille, données
 *   compteur : < 0xFE direct ; 0xFF + u32 ; 0xFE + u32 = renvoi arrière vers une donnée déjà écrite
 *              (cible = position qui suit l'octet 0xFE − décalage).
 * Les noms sont des CRC32 ; ceux qui n'ont pas de nom connu sont écrits en hexadécimal.
 */
const fs = require("fs");
const path = require("path");
const { crc32 } = require("zlib");
const { lzo1xDecompress } = require("./lzo");
const locate = require("./locate");

const ROOT_OFFSET = 0x2ad;
const H = (name) => crc32(name);

function parseTree(buf) {
  let p = ROOT_OFFSET;
  const count = () => {
    const b = buf[p];
    if (b < 0xfe) return { n: b, at: p++ };
    const v = buf.readUInt32LE(p + 1);
    const at = p;
    p += 5;
    return b === 0xfe ? { ref: at + 1 - v } : { n: v };
  };
  const node = (depth) => {
    if (depth > 64) throw new Error("arbre trop profond");
    const nc = count();
    if (nc.ref !== undefined) return null; // renvoi vers un nœud déjà lu : ignoré
    const h = buf.readUInt32LE(p);
    p += 4;
    const nv = count();
    const vals = new Map();
    for (let i = 0; i < nv.n; i++) {
      const vh = buf.readUInt32LE(p);
      p += 4;
      const sz = count();
      if (sz.ref !== undefined) {
        vals.set(vh, buf.subarray(sz.ref, sz.ref + buf[sz.ref - 1]));
      } else {
        vals.set(vh, buf.subarray(p, p + sz.n));
        p += sz.n;
      }
    }
    const kids = [];
    for (let i = 0; i < nc.n; i++) {
      const k = node(depth + 1);
      if (k) kids.push(k);
    }
    return { h, vals, kids };
  };
  return node(0);
}

const N = {
  menu: H("CMenuSaveable"),
  progression: H("Progression"),
  time: H("TotalGameTime"),
  openWorldItems: H("OpenWorldItems"),
  id: H("Id"),
  collectible: H("Collectible"),
  collectibleEntity: 0x95fe14b2, // nom inconnu : EntityId de l'objet dans une grotte
  collectibleTaken: 0xc40bb3d5, // nom inconnu : 1 = ramassé
  cave: 0x630310c4, // nom inconnu : grotte perdue
  caveVisited: 0x308d9fbe, // nom inconnu : 1 = grotte visitée
  markerEntity: H("entMarkerEntity"),
  discovered: H("DiscoveredLocations"),
  revealed: H("RevealedLocations"),
  location: H("Location"),
  worldMapItems: H("WorldMapItems"),
  unlockedMarker: 0x5f21a306, // nom inconnu : marqueur de carte débloqué (voyage rapide)
  mission: H("Mission"),
  missionId: H("MissionId"),
  state: H("State"),
  quests: H("quests"),
  questName: 0x6acc6ce5, // nom inconnu : nom de la quête ou de l'objectif
  objectives: H("objectives"),
  completed: H("bIsCompleted"),
  fog: H("FogData"),
  fogData: H("Data"),
  item: H("Item"),
  crafted: H("bCraftedAtLeastOnce"),
  recipe: 0xd8f2aab5, // nom inconnu : arkArchetype de la recette de l'objet
  abilities: H("Abilities"),
  abilityName: H("abilityName"),
  ability: H("Ability"),
  abilityName2: H("AbilityName"),
};

/**
 * Brouillard de guerre : FogData.Data est une grille de 1024 x 1024 bits compressée en LZO1X.
 * Bit à 1 = case explorée ; ligne 0 au nord ; dans un octet, le bit de poids faible est la case la plus à l'ouest.
 * Calage (tools/game/build_index.py) : la grille couvre le monde de -5000 à +5000 m sur chaque axe.
 */
const FOG_SIZE = 1024;

const u64 = (b) => (b && b.length === 8 ? b.readBigUInt64LE(0).toString() : null);
const u32 = (b) => (b && b.length >= 4 ? b.readUInt32LE(0) : null);
const f32 = (b) => (b && b.length === 4 ? b.readFloatLE(0) : null);
const str = (b) => (b && b.length > 1 ? b.subarray(0, b.length - 1).toString("latin1") : "");

/** Extrait de l'arbre ce qui sert à la progression. */
function extract(root) {
  const out = {
    progression: null,
    playTime: null,
    pickups: new Set(),
    discovered: new Set(),
    revealed: new Set(),
    unlocked: new Set(),
    missions: new Map(), // CRC32 -> état
    hunts: new Map(), // nom de quête -> terminée ?
    fog: null, // grille compressée (LZO1X)
    crafted: new Set(), // arkArchetype des recettes fabriquées au moins une fois
    skills: new Set(), // CRC32 des noms internes des compétences obtenues (« SP_TameAnimalsA »…)
  };
  const walk = (n, parent) => {
    const v = n.vals;
    if (n.h === N.menu) {
      out.progression = f32(v.get(N.progression));
      out.playTime = f32(v.get(N.time));
    } else if (n.h === N.abilities && v.has(N.abilityName)) {
      out.skills.add(String(u32(v.get(N.abilityName))));
    } else if (n.h === N.ability && v.has(N.abilityName2)) {
      out.skills.add(String(u32(v.get(N.abilityName2))));
    } else if (n.h === N.item && v.get(N.crafted)?.[0] === 1) {
      out.crafted.add(u64(v.get(N.recipe)));
    } else if (n.h === N.fog) {
      out.fog = v.get(N.fogData) || null;
    } else if (n.h === N.openWorldItems) {
      out.pickups.add(u64(v.get(N.id)));
    } else if (n.h === N.collectible && v.get(N.collectibleTaken)?.[0] === 1) {
      out.pickups.add(u64(v.get(N.collectibleEntity)));
    } else if (n.h === N.cave && v.get(N.caveVisited)?.[0] === 1) {
      out.discovered.add(u64(v.get(N.markerEntity)));
    } else if (n.vals.has(N.location) && parent) {
      if (parent.h === N.discovered) out.discovered.add(u64(v.get(N.location)));
      if (parent.h === N.revealed) out.revealed.add(u64(v.get(N.location)));
    } else if (n.h === N.worldMapItems) {
      out.unlocked.add(u64(v.get(N.unlockedMarker)));
    } else if (n.h === N.mission) {
      out.missions.set(String(u32(v.get(N.missionId))), u32(v.get(N.state)));
    } else if (n.h === N.quests) {
      // ponytail: chasse terminée = tous ses objectifs nommés terminés (hypothèse, non vérifiée sur une partie qui l'a faite)
      const objs = n.kids.flatMap((k) => k.kids).filter((k) => k.h === N.objectives && str(k.vals.get(N.questName)));
      out.hunts.set(str(v.get(N.questName)), objs.length > 0 && objs.every((o) => o.vals.get(N.completed)?.[0] === 1));
    }
    for (const k of n.kids) walk(k, n);
  };
  walk(root, null);
  return out;
}

const MISSION_DONE = 3; // états observés : 0 verrouillée, 1 en cours, 3 terminée, 6 disponible

/** État de chaque lieu de la carte, d'après l'index construit par tools/game/build_index.py. */
function progress(save, index) {
  const status = {};
  const codeState = new Map();
  for (const [crc, state] of save.missions) {
    const code = index.missions[crc];
    if (code) codeState.set(code, state);
  }
  for (const { id: locId, track: ids } of index.locations) {
    if (!ids) continue; // élément non suivi
    let s = null;
    if ((ids.pickup || []).some((id) => save.pickups.has(id))) s = "ramassé";
    else if ((ids.mission || []).some((c) => codeState.get(c) === MISSION_DONE)) s = "terminée";
    else if ((ids.hunt || []).some((h) => save.hunts.get(h))) s = "terminée";
    else if ((ids.marker || []).some((id) => save.unlocked.has(id))) s = "débloqué";
    else if ((ids.marker || []).some((id) => save.discovered.has(id))) s = "découvert";
    else if ((ids.marker || []).some((id) => save.revealed.has(id))) s = "révélé";
    if (s) status[locId] = s;
  }
  const missions = index.missionList.map((m) => ({ ...m, done: codeState.get(m.code) === MISSION_DONE }));
  const crafting = (index.crafting || []).map((c) => ({ ...c, done: save.crafted.has(c.ark) }));
  const skills = (index.skills || []).map((s) => ({ ...s, done: save.skills.has(s.hash) }));
  return { progression: save.progression, playTime: save.playTime, status, missions, crafting, skills };
}

/** Le fichier .save le plus récent (les deux emplacements sont des sauvegardes automatiques alternées). */
function latestSave(dirs = locate.saveDirs()) {
  let best = null;
  for (const dir of dirs) {
    for (const file of locate.primalSaves(dir)) {
      const { mtimeMs } = fs.statSync(file);
      if (!best || mtimeMs > best.mtimeMs) best = { file, mtimeMs };
    }
  }
  return best;
}

function read(file) {
  return extract(parseTree(fs.readFileSync(file)));
}

/** Grille du brouillard décompressée (131 072 octets), ou null si la sauvegarde n'en a pas. */
function fogBitmap(save) {
  if (!save.fog) return null;
  const bits = lzo1xDecompress(save.fog);
  if (bits.length !== (FOG_SIZE * FOG_SIZE) / 8) throw new Error(`brouillard de taille inattendue (${bits.length} octets)`);
  return bits;
}

module.exports = { read, progress, latestSave, parseTree, extract, fogBitmap };

if (require.main === module) {
  // Vérification : node lib/save.js [fichier.save]
  const assert = require("assert");
  const file = process.argv[2] || (latestSave() || {}).file;
  assert(file, "aucune sauvegarde trouvée");
  const save = read(file);
  assert(save.progression > 0 && save.progression <= 100, "progression illisible");
  assert(save.missions.size > 100, "missions illisibles");
  assert(save.pickups.size > 0 && save.discovered.size > 0, "objets ou lieux illisibles");
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "oros.json"), "utf8"));
  const p = progress(save, index);
  const byState = {};
  for (const s of Object.values(p.status)) byState[s] = (byState[s] || 0) + 1;
  console.log(file);
  console.log(`progression ${save.progression.toFixed(1)} % · ${Math.round(save.playTime / 60)} min`);
  console.log("lieux par état :", byState);
  const fog = fogBitmap(save);
  assert(fog, "brouillard absent");
  let explored = 0;
  for (const b of fog) for (let k = 0; k < 8; k++) explored += (b >> k) & 1;
  assert(explored > 0 && explored < fog.length * 8, "brouillard illisible");
  assert(p.crafting.some((c) => c.done), "artisanat illisible");
  assert(p.skills.some((s) => s.done), "compétences illisibles");
  console.log(`compétences : ${p.skills.filter((s) => s.done).length}/${p.skills.length} obtenues (${save.skills.size} dans la sauvegarde)`);
  console.log(`artisanat : ${p.crafting.filter((c) => c.done).length}/${p.crafting.length} améliorations fabriquées`);
  console.log(`brouillard : ${((explored / (fog.length * 8)) * 100).toFixed(1)} % de la grille explorée`);
  console.log("missions titrées terminées :", p.missions.filter((m) => m.done).map((m) => m.title).join(", "));
}
