"use strict";
/**
 * Sauvegarde de Far Cry Primal sur ce PC : trouve le fichier le plus récent et le lit.
 * Le format et la lecture sont dans public/savefile.js (le même code sert à la version en ligne).
 */
const fs = require("fs");
const path = require("path");
const SaveFile = require("../public/savefile");
const locate = require("./locate");
const { progress, fogBitmap } = SaveFile;

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

const read = (file) => SaveFile.read(fs.readFileSync(file));

module.exports = { read, progress, latestSave, fogBitmap };

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
