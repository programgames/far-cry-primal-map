/**
 * Lecture de la sauvegarde de Far Cry Primal (Ubisoft Connect, dossier savegames/<compte>/2010).
 * Sans dépendance, sur des Uint8Array : sert au serveur (lib/save.js) et à la version en ligne (app.js).
 *
 * Format : en-tête de 0x224 octets puis un arbre « binary object » du moteur Dunia.
 *   nœud   = nbEnfants, hash u32 du nom, nbValeurs, valeurs, enfants
 *   valeur = hash u32 du nom, taille, données
 *   compteur : < 0xFE direct ; 0xFF + u32 ; 0xFE + u32 = renvoi arrière vers une donnée déjà écrite
 *              (cible = position qui suit l'octet 0xFE − décalage).
 * Les noms sont des CRC32 ; ceux qui n'ont pas de nom connu sont écrits en hexadécimal.
 */
(() => {
  "use strict";

  const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(text) {
    let c = 0xffffffff;
    for (let i = 0; i < text.length; i++) c = CRC_TABLE[(c ^ text.charCodeAt(i)) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const H = crc32;
  const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

  const ROOT_OFFSET = 0x2ad;

  function parseTree(buf) {
    const dv = view(buf);
    let p = ROOT_OFFSET;
    const count = () => {
      const b = buf[p];
      if (b < 0xfe) return { n: b, at: p++ };
      const v = dv.getUint32(p + 1, true);
      const at = p;
      p += 5;
      return b === 0xfe ? { ref: at + 1 - v } : { n: v };
    };
    const node = (depth) => {
      if (depth > 64) throw new Error("arbre trop profond");
      const nc = count();
      if (nc.ref !== undefined) return null; // renvoi vers un nœud déjà lu : ignoré
      const h = dv.getUint32(p, true);
      p += 4;
      const nv = count();
      const vals = new Map();
      for (let i = 0; i < nv.n; i++) {
        const vh = dv.getUint32(p, true);
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

  const u64 = (b) => (b && b.length === 8 ? view(b).getBigUint64(0, true).toString() : null);
  const u32 = (b) => (b && b.length >= 4 ? view(b).getUint32(0, true) : null);
  const f32 = (b) => (b && b.length === 4 ? view(b).getFloat32(0, true) : null);
  const str = (b) => (b && b.length > 1 ? String.fromCharCode(...b.subarray(0, b.length - 1)) : ""); // latin1

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

  /** État de chaque lieu de la carte, d'après l'index data/oros.json (tools/game/build_data.py). */
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

  /** Décompression LZO1X (d'après lzo1x_d.ch de la bibliothèque LZO). */
  function lzo1xDecompress(src, maxOut = 1 << 22) {
    const out = new Uint8Array(maxOut);
    let op = 0;
    let ip = 0;
    const fail = (why) => {
      throw new Error(`LZO1X invalide : ${why}`);
    };
    const literals = (n) => {
      if (ip + n > src.length || op + n > maxOut) fail("littéraux");
      out.set(src.subarray(ip, ip + n), op);
      ip += n;
      op += n;
    };
    const match = (dist, n) => {
      if (dist <= 0 || dist > op || op + n > maxOut) fail("distance");
      for (let i = 0; i < n; i++, op++) out[op] = out[op - dist];
    };
    const extend = (base) => {
      let t = 0;
      while (src[ip] === 0) {
        t += 255;
        ip++;
      }
      return t + base + src[ip++];
    };

    let t;
    let state;
    if (src[ip] > 17) {
      t = src[ip++] - 17;
      literals(t);
      if (t < 4) {
        t = src[ip++];
        state = "match";
      } else state = "first";
    } else state = "loop";

    for (;;) {
      if (ip > src.length) fail("fin de flux absente");
      if (state === "loop") {
        t = src[ip++];
        if (t >= 16) {
          state = "match";
          continue;
        }
        literals((t === 0 ? extend(15) : t) + 3);
        state = "first";
        continue;
      }
      if (state === "first") {
        t = src[ip++];
        if (t >= 16) {
          state = "match";
          continue;
        }
        match(1 + 0x0800 + (t >> 2) + (src[ip++] << 2), 3);
        state = "done";
        continue;
      }
      if (state === "match") {
        if (t >= 64) {
          const dist = 1 + ((t >> 2) & 7) + (src[ip++] << 3);
          match(dist, (t >> 5) + 1);
        } else if (t >= 32) {
          const n = (t & 31) === 0 ? extend(31) : t & 31;
          const dist = 1 + (src[ip] >> 2) + (src[ip + 1] << 6);
          ip += 2;
          match(dist, n + 2);
        } else if (t >= 16) {
          let dist = (t & 8) << 11;
          const n = (t & 7) === 0 ? extend(7) : t & 7;
          dist += (src[ip] >> 2) + (src[ip + 1] << 6);
          ip += 2;
          if (dist === 0) return out.subarray(0, op); // fin du flux
          match(dist + 0x4000, n + 2);
        } else {
          match(1 + (t >> 2) + (src[ip++] << 2), 2);
        }
        state = "done";
        continue;
      }
      // state === "done" : les 2 bits bas du dernier octet de distance donnent des littéraux en plus
      t = src[ip - 2] & 3;
      if (t === 0) {
        state = "loop";
        continue;
      }
      literals(t);
      t = src[ip++];
      state = "match";
    }
  }

  /** Grille du brouillard décompressée (131 072 octets), ou null si la sauvegarde n'en a pas. */
  function fogBitmap(save) {
    if (!save.fog) return null;
    const bits = lzo1xDecompress(save.fog);
    if (bits.length !== (FOG_SIZE * FOG_SIZE) / 8) throw new Error(`brouillard de taille inattendue (${bits.length} octets)`);
    return bits;
  }

  /** Lit une sauvegarde entière (octets du fichier .save). */
  const read = (bytes) => extract(parseTree(bytes));

  const SaveFile = { read, parseTree, extract, progress, fogBitmap };
  if (typeof module === "object" && module.exports) module.exports = SaveFile;
  else globalThis.SaveFile = SaveFile;
})();
