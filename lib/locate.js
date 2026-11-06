"use strict";
/**
 * Où sont les sauvegardes de Far Cry Primal ?
 *
 * 1. Dossier choisi par l'utilisateur (config.json), s'il contient encore des sauvegardes.
 * 2. Sinon, recherche automatique dans les dossiers « savegames » d'Ubisoft Connect : celui du registre
 *    Windows, puis les emplacements habituels sur chaque lecteur.
 *
 * Une sauvegarde est reconnue par son contenu (le nom de la carte « primal_main »), pas par le numéro
 * du dossier du jeu (2010 pour la version Ubisoft ; peut-être autre chose pour Steam ou Epic).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, execFile } = require("child_process");

const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), "OrosMap");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const MARK = Buffer.from("primal_main");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/** Vrai si le fichier est une sauvegarde de Far Cry Primal (le nom de la carte suit l'en-tête). */
function isPrimalSave(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const head = Buffer.alloc(0x300);
    fs.readSync(fd, head, 0, head.length, 0);
    return head.includes(MARK);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Sauvegardes de Far Cry Primal directement dans ce dossier. */
function primalSaves(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith(".save"))
      .map((n) => path.join(dir, n))
      .filter(isPrimalSave);
  } catch {
    return [];
  }
}

const subdirs = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(dir, d.name));
  } catch {
    return [];
  }
};

/** Dossiers qui contiennent des sauvegardes de Far Cry Primal, sous `root`, jusqu'à `depth` niveaux. */
function searchUnder(root, depth = 3) {
  const found = [];
  const walk = (dir, d) => {
    if (primalSaves(dir).length) found.push(dir);
    if (d > 0) for (const sub of subdirs(dir)) walk(sub, d - 1);
  };
  walk(root, depth);
  return found;
}

/** Dossiers « savegames » d'Ubisoft Connect probables sur ce PC. */
function ubisoftRoots() {
  const roots = [];
  for (const key of ["HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher", "HKLM\\SOFTWARE\\Ubisoft\\Launcher"]) {
    try {
      const out = execFileSync("reg", ["query", key, "/v", "InstallDir"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      const m = out.match(/InstallDir\s+REG_SZ\s+(.+)/);
      if (m) roots.push(path.join(m[1].trim(), "savegames"));
    } catch {
      /* clé absente */
    }
  }
  const usual = ["Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher", "Program Files\\Ubisoft\\Ubisoft Game Launcher", "Ubisoft\\Ubisoft Game Launcher", "Ubisoft Game Launcher", "Games\\Ubisoft Game Launcher"];
  for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (!fs.existsSync(`${letter}:\\`)) continue;
    for (const p of usual) roots.push(`${letter}:\\${p}\\savegames`);
  }
  return [...new Set(roots.map((r) => path.normalize(r)))].filter((r) => fs.existsSync(r));
}

let autoCache = null;
/** Recherche automatique (savegames\<compte>\<jeu>), gardée en mémoire : elle parcourt les lecteurs. */
function autoDirs(refresh = false) {
  if (!autoCache || refresh) autoCache = ubisoftRoots().flatMap((root) => searchUnder(root, 2));
  return autoCache;
}

/** Dossiers à lire : celui choisi par l'utilisateur, sinon ceux de la recherche automatique. */
function saveDirs() {
  if (process.env.FCP_SAVE_DIR) return [process.env.FCP_SAVE_DIR];
  const { saveDir } = readConfig();
  if (saveDir && primalSaves(saveDir).length) return [saveDir];
  return autoDirs();
}

/** Boîte de dialogue Windows « Choisir un dossier » ; renvoie le chemin choisi ou null. */
function pickFolder(description) {
  const script = [
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
    "Add-Type -AssemblyName System.Windows.Forms",
    "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dialog.Description = '${description.replace(/'/g, "''")}'`,
    "if ($dialog.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($dialog.SelectedPath) }",
  ].join("; ");
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-STA", "-Command", script], { encoding: "utf8", windowsHide: true }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim() || null);
    });
  });
}

/** Retient le dossier choisi : le dossier lui-même ou, s'il n'a pas de sauvegarde, celui trouvé dessous. */
function chooseDir(dir) {
  const found = searchUnder(dir, 3);
  if (!found.length) return null;
  writeConfig({ ...readConfig(), saveDir: found[0] });
  return found[0];
}

function useAuto() {
  const config = readConfig();
  delete config.saveDir;
  writeConfig(config);
  autoDirs(true);
}

module.exports = { saveDirs, autoDirs, primalSaves, isPrimalSave, searchUnder, pickFolder, chooseDir, useAuto, readConfig, CONFIG_FILE };
