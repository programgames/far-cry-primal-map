#!/usr/bin/env node
/**
 * Petit serveur local (sans dépendance) qui sert la carte Oros et la
 * progression lue dans la sauvegarde de Far Cry Primal.
 *
 * Lancement :  node server.js --open   (ou double-clic sur OrosMap.exe, voir tools/package.js)
 * Adresse   :  http://localhost:4173
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const save = require("./lib/save");
const locate = require("./lib/locate");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const TILES_DIR = path.join(ROOT, "tiles");
const DATA_DIR = path.join(ROOT, "data");

const BASE_PORT = Number(process.env.PORT) || 4173;
const OPEN = process.argv.includes("--open") || process.env.OROS_OPEN === "1";
// Messages de la fenêtre noire : en français si Windows est en français, sinon en anglais.
const FR = Intl.DateTimeFormat().resolvedOptions().locale.startsWith("fr");
const say = (fr, en) => (FR ? fr : en);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const gameIndex = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "oros.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

/** Progression lue dans la sauvegarde la plus récente ; relue seulement quand le fichier change. */
let cached = null;
function currentProgress() {
  const latest = save.latestSave();
  if (!latest) {
    throw Object.assign(new Error("Aucune sauvegarde de Far Cry Primal trouvée. Lancez une partie une fois, ou choisissez le dossier des sauvegardes."), {
      status: 404,
      code: "no-save",
    });
  }
  if (cached && cached.file === latest.file && cached.mtimeMs === latest.mtimeMs) return cached.payload;
  try {
    const data = save.read(latest.file);
    const payload = {
      file: latest.file,
      saveMode: locate.readConfig().saveDir ? "manual" : "auto",
      savedAt: new Date(latest.mtimeMs).toISOString(),
      ...save.progress(data, gameIndex),
    };
    cached = { ...latest, payload, fog: save.fogBitmap(data) };
    return payload;
  } catch (err) {
    // Le jeu peut être en train d'écrire le fichier : on garde la dernière lecture valide (la page affiche readError).
    if (cached) return { ...cached.payload, readError: err.message };
    throw err;
  }
}

/**
 * Mise à jour : compare la version de package.json à la dernière version publiée sur GitHub
 * (pkg.repository = « propriétaire/dépôt »). Résultat gardé 6 h ; sans réseau, on ne signale rien.
 */
let updateCache = null;
async function checkUpdate() {
  const repo = String(pkg.repository || "").replace(/^github:/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { current: pkg.version, available: false };
  if (updateCache && Date.now() - updateCache.at < 6 * 3600e3) return updateCache.result;
  let result = { current: pkg.version, available: false };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "oros-map" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const release = await res.json();
      const latest = String(release.tag_name || "").replace(/^v/, "");
      result = { current: pkg.version, latest, url: release.html_url, available: newer(latest, pkg.version) };
    }
  } catch {
    /* hors ligne : pas d'avis de mise à jour */
  }
  updateCache = { at: Date.now(), result };
  return result;
}

/** Vrai si la version a (« 2.1.0 ») est plus récente que b. */
function newer(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function serveFile(res, file, { cacheSeconds = 0 } = {}) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    sendJson(res, 404, { error: "Fichier introuvable" });
    return;
  }
  if (!stat.isFile()) {
    sendJson(res, 404, { error: "Fichier introuvable" });
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-cache",
  };
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

/** Empêche toute sortie du dossier autorisé. */
function safeJoin(baseDir, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const clean = path.normalize(decoded).replace(/^([/\\])+/, "");
  const target = path.join(baseDir, clean);
  const rel = path.relative(baseDir, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return target;
}

async function handleApi(req, res, url) {
  const route = url.pathname;

  if (route === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, version: pkg.version });
  }

  // Choix du dossier des sauvegardes : boîte de dialogue Windows, puis recherche des sauvegardes dessous.
  if (route === "/api/save-location/pick" && req.method === "POST") {
    const picked = await locate.pickFolder(
      url.searchParams.get("lang") === "fr"
        ? "Choisissez le dossier des sauvegardes de Far Cry Primal (ou un dossier qui le contient)."
        : "Choose the Far Cry Primal save folder (or a folder that contains it)."
    );
    if (!picked) return sendJson(res, 200, { ok: false, cancelled: true });
    const dir = locate.chooseDir(picked);
    cached = null;
    return sendJson(res, 200, dir ? { ok: true, dir } : { ok: false, picked }); // message : public/app.js
  }

  if (route === "/api/save-location/auto" && req.method === "POST") {
    locate.useAuto();
    cached = null;
    return sendJson(res, 200, { ok: true, dirs: locate.saveDirs() });
  }

  if (route === "/api/update" && req.method === "GET") {
    return sendJson(res, 200, await checkUpdate());
  }

  if (route === "/api/progress" && req.method === "GET") {
    return sendJson(res, 200, currentProgress());
  }

  // Brouillard de guerre : grille brute de 1024 x 1024 bits (voir lib/save.js).
  if (route === "/api/fog" && req.method === "GET") {
    currentProgress();
    if (!cached.fog) throw Object.assign(new Error("Pas de brouillard dans cette sauvegarde"), { status: 404 });
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": cached.fog.length, "Cache-Control": "no-store" });
    return res.end(cached.fog);
  }

  throw Object.assign(new Error("Route API inconnue"), { status: 404 });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/tiles/")) {
      const file = safeJoin(TILES_DIR, url.pathname.slice("/tiles/".length));
      if (!file) return sendJson(res, 403, { error: "Accès refusé" });
      return serveFile(res, file, { cacheSeconds: 60 * 60 * 24 * 30 });
    }

    if (url.pathname.startsWith("/data/")) {
      const file = safeJoin(DATA_DIR, url.pathname.slice("/data/".length));
      if (!file) return sendJson(res, 403, { error: "Accès refusé" });
      return serveFile(res, file, { cacheSeconds: 60 });
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = safeJoin(PUBLIC_DIR, pathname);
    if (!file) return sendJson(res, 403, { error: "Accès refusé" });
    return serveFile(res, file);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    sendJson(res, status, { error: err.message || "Erreur interne", code: err.code });
  }
});

function openBrowser(port) {
  const url = `http://localhost:${port}`;
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

/** Vrai si une carte Oros répond déjà sur ce port (application lancée deux fois). */
async function alreadyRunning(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

function listen(port, attemptsLeft = 10) {
  server.once("error", async (err) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      if (await alreadyRunning(port)) {
        console.log(say(`  La carte est déjà ouverte : http://localhost:${port}`, `  The map is already open: http://localhost:${port}`));
        openBrowser(port);
        setTimeout(() => process.exit(0), 1500);
        return;
      }
      console.log(say(`Port ${port} occupé, essai sur ${port + 1}…`, `Port ${port} in use, trying ${port + 1}…`));
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error(say("✗ Impossible de démarrer :", "✗ Cannot start:"), err.message);
      process.exit(1);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    const file = (save.latestSave() || {}).file || say("introuvable (choisissez le dossier dans la page)", "not found (choose the folder in the page)");
    console.log(say(`\n  Carte Far Cry Primal — Oros  (version ${pkg.version})`, `\n  Far Cry Primal map — Oros  (version ${pkg.version})`));
    console.log(`  ➜  http://localhost:${port}`);
    console.log(say(`  Sauvegarde du jeu : ${file}`, `  Game save: ${file}`));
    console.log(say(`\n  Laissez cette fenêtre ouverte pendant que vous utilisez la carte.`, `\n  Leave this window open while you use the map.`));
    console.log(say(`  Fermez-la pour arrêter la carte.\n`, `  Close it to stop the map.\n`));
    if (OPEN) openBrowser(port);
  });
}

listen(BASE_PORT);
