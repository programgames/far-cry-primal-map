#!/usr/bin/env node
/**
 * Construit la version à distribuer : dist/OrosMap/ et dist/OrosMap-<version>-windows.zip
 *
 *   OrosMap/
 *     OrosMap.exe        lanceur (tools/launcher/OrosMap.cs, compilé avec le csc.exe fourni avec Windows)
 *     runtime/node.exe   copie du Node.js qui exécute ce script (licence MIT, LICENSE à côté)
 *     app/               serveur, page, données et tuiles
 *     LISEZ-MOI.txt
 *
 * Usage : node tools/package.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "OrosMap");
const APP_FILES = ["server.js", "package.json", "LICENSE", "lib", "public", "data", "tiles"];

const csc = ["Framework64", "Framework"]
  .map((f) => path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", f, "v4.0.30319", "csc.exe"))
  .find((p) => fs.existsSync(p));
if (!csc) throw new Error("csc.exe (.NET Framework 4) introuvable : impossible de compiler le lanceur.");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "app"), { recursive: true });
fs.mkdirSync(path.join(OUT, "runtime"), { recursive: true });

for (const name of APP_FILES) {
  fs.cpSync(path.join(ROOT, name), path.join(OUT, "app", name), { recursive: true });
}
fs.copyFileSync(process.execPath, path.join(OUT, "runtime", "node.exe"));
const nodeLicense = path.join(path.dirname(process.execPath), "LICENSE");
if (fs.existsSync(nodeLicense)) fs.copyFileSync(nodeLicense, path.join(OUT, "runtime", "LICENSE-node.txt"));

execFileSync(csc, [
  "/nologo",
  "/target:exe",
  "/optimize+",
  `/win32icon:${path.join(ROOT, "tools", "launcher", "oros.ico")}`,
  `/out:${path.join(OUT, "OrosMap.exe")}`,
  path.join(ROOT, "tools", "launcher", "OrosMap.cs"),
], { stdio: "inherit" });

fs.writeFileSync(
  path.join(OUT, "LISEZ-MOI.txt"),
  [
    `Carte d'Oros - Far Cry Primal (version ${pkg.version})`,
    "",
    "1. Double-cliquez sur OrosMap.exe.",
    "2. La carte s'ouvre dans votre navigateur. Laissez la fenêtre noire ouverte pendant que vous l'utilisez.",
    "3. Fermez la fenêtre noire pour arrêter la carte.",
    "",
    "Si Windows affiche « Windows a protégé votre ordinateur » : cliquez sur « Informations complémentaires »,",
    "puis sur « Exécuter quand même ». L'application n'est pas signée, c'est un projet de fans gratuit.",
    "",
    "Aide (en anglais) : https://github.com/" + pkg.repository + "/wiki",
    "",
  ].join("\r\n"),
);

// Archive .zip avec l'outil intégré à Windows.
const zip = path.join(DIST, `OrosMap-${pkg.version}-windows.zip`);
fs.rmSync(zip, { force: true });
execFileSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path '${OUT}' -DestinationPath '${zip}' -CompressionLevel Optimal`], { stdio: "inherit" });
const mb = (fs.statSync(zip).size / 1024 / 1024).toFixed(1);
console.log(`\n${zip} (${mb} Mo)`);
