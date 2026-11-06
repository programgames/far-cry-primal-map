/* Far Cry Primal — carte locale d'Oros
 * Affiche la progression lue dans la sauvegarde du jeu (aucune saisie manuelle).
 */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const UI_KEY = "oros.ui.v4"; // v4 : catégories tirées du jeu (identifiants texte)
  const POLL_MS = 5000; // le serveur ne relit la sauvegarde que si le fichier a changé
  const DETAIL_ZOOM = 5; // zoom où 1 pixel = 1 m : icônes à leur taille réelle, cible des « Voir sur la carte »
  const BLANK_TILE =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const POPUP_OPTIONS = {
    maxWidth: 340,
    minWidth: 300,
    className: "mg-popup",
    autoPanPadding: [26, 64],
  };
  // Libellé d'un élément suivi qui n'a pas encore atteint l'état visé.
  const PENDING = {
    ramassé: "Pas encore ramassé",
    terminée: "Pas encore terminée",
    débloqué: "Pas encore débloqué",
    découvert: "Pas encore découvert",
  };

  // ---------------------------------------------------------------- données
  let categories = [];
  let sprite = null;
  let iconRects = {};
  let locations = [];
  let groups = [];
  let catById = new Map();
  let index = null; // data/oros.json (construit par tools/game/build_data.py)
  const HUNTING_GROUP = "hunting";

  // ---------------------------------------------------------------- état
  let progress = { status: {}, missions: [] }; // /api/progress
  const counts = { done: 0, tracked: 0 };
  const ui = { hidden: new Set(), hideDone: false, showFog: false, query: "", tab: "filters", collapsed: false };

  let map = null;
  let clusters = null;
  const markers = new Map();
  let mapFocusBounds = null;
  let searchTimer = null;
  let toastTimer = null;

  // ---------------------------------------------------------------- helpers
  const norm = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const timeLabel = (iso) =>
    new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  function durationLabel(seconds) {
    const m = Math.round((seconds || 0) / 60);
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  }

  async function fetchJson(url, optional = false) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) {
      if (optional) return null;
      throw new Error(`${res.status} ${url}`);
    }
    return res.json();
  }

  function toast(message, type = "") {
    const node = $("#toast");
    node.textContent = message;
    node.className = `toast show ${type}`.trim();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (node.className = "toast"), 3200);
  }

  const isMobile = () => window.matchMedia("(max-width: 860px)").matches;

  // Un élément est suivi quand la sauvegarde peut dire s'il est fait.
  const isTracked = (loc) => Boolean(loc.track);
  const goalOf = (loc) => catById.get(loc.category_id).goal;
  const stateOf = (loc) => progress.status[loc.id] || null;
  // Un lieu débloqué (voyage rapide) est forcément découvert.
  const reaches = (state, goal) => state === goal || (goal === "découvert" && state === "débloqué");
  const isDone = (loc) => isTracked(loc) && reaches(stateOf(loc), goalOf(loc));
  const isShown = (loc) => !ui.hidden.has(loc.category_id) && !(ui.hideDone && isDone(loc));

  // ---------------------------------------------------------------- démarrage
  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    bindChrome();

    try {
      const [data, icons] = await Promise.all([fetchJson("data/oros.json"), fetchJson("data/icons.json")]);
      index = data;
      mergeData(data, icons);
    } catch (err) {
      document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;color:#eee;background:#141010;height:100vh">
        <h1>Données de la carte introuvables</h1>
        <p>Le dossier <code>data</code> de l'application est incomplet. Téléchargez de nouveau l'application.</p>
        <p style="color:#c99">${escapeHtml(err.message)}</p></div>`;
      return;
    }

    loadUi();
    initMap();
    renderFilters();
    renderTabs();
    renderList();

    await refreshProgress();
    setInterval(refreshProgress, POLL_MS);

    $("#btn-fit").addEventListener("click", fitMap);
    $("#btn-refresh").addEventListener("click", () => refreshProgress(true));
    $("#btn-pick").addEventListener("click", pickSaveFolder);
    $("#btn-pick-big").addEventListener("click", pickSaveFolder);
    $("#btn-auto").addEventListener("click", useAutoSearch);
    checkUpdate();
  }

  /** Données du jeu (oros.json) et icônes du jeu (icons.json). Coordonnées : mètres du jeu (lat = y, lng = x). */
  function mergeData(data, icons) {
    groups = data.groups;
    const groupById = new Map(groups.map((g) => [g.id, g]));
    sprite = icons.sprite;
    iconRects = icons.icons;
    categories = data.categories.map((c) => ({ ...c, group_id: c.group, sprite: iconRects[c.icon] || null }));
    catById = new Map(categories.map((c) => [c.id, c]));
    locations = data.locations.map((l) => {
      const cat = catById.get(l.cat);
      return {
        ...l,
        latitude: l.y,
        longitude: l.x,
        description: l.desc || "",
        category_id: l.cat,
        category_title: cat.title,
        group_id: cat.group,
        group_title: (groupById.get(cat.group) || {}).title || "",
      };
    });
  }

  // ---------------------------------------------------------------- interface
  function bindChrome() {
    $("#btn-collapse").addEventListener("click", () => {
      if (isMobile()) {
        $(".app").classList.remove("sidebar-open");
      } else {
        ui.collapsed = true;
        $(".app").classList.add("collapsed");
        saveUi();
        setTimeout(() => map && map.invalidateSize(), 260);
      }
    });

    $("#btn-open").addEventListener("click", () => {
      if (isMobile()) {
        $(".app").classList.add("sidebar-open");
      } else {
        ui.collapsed = false;
        $(".app").classList.remove("collapsed");
        saveUi();
        setTimeout(() => map && map.invalidateSize(), 260);
      }
    });

    $("#search").addEventListener("input", (event) => {
      clearTimeout(searchTimer);
      const value = event.target.value;
      searchTimer = setTimeout(() => {
        ui.query = value.trim();
        ui.tab = "list";
        renderTabs();
        renderList();
      }, 110);
    });

    $("#search").addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.target.value = "";
        event.target.blur();
        ui.query = "";
        renderList();
      }
      if (event.key === "Enter") {
        const first = $$(".row", $("#panel-list"))[0];
        if (first) first.click();
      }
    });

    $$(".tab").forEach((tab) =>
      tab.addEventListener("click", () => {
        ui.tab = tab.dataset.tab;
        saveUi();
        renderTabs();
      })
    );

    $("#panel-missions").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mission]");
      if (button) showMission(progress.missions[Number(button.dataset.mission)]);
    });

    document.addEventListener("keydown", (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        $("#search").focus();
      }
    });

    window.addEventListener("resize", () => {
      if (map) setTimeout(() => map.invalidateSize(), 120);
    });
  }

  function loadUi() {
    // Premier chargement : zones de chasse masquées (elles n'ont pas d'état et couvrent la carte).
    ui.hidden = new Set(categories.filter((c) => c.group_id === HUNTING_GROUP).map((c) => c.id));
    try {
      const raw = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
      if (Array.isArray(raw.hidden)) {
        ui.hidden = new Set(raw.hidden.filter((id) => catById.has(id)));
      }
      ui.hideDone = Boolean(raw.hideDone);
      ui.showFog = Boolean(raw.showFog);
      ui.collapsed = Boolean(raw.collapsed);
      if (["filters", "list", "missions", "crafting"].includes(raw.tab)) ui.tab = raw.tab;
    } catch {
      /* stockage local indisponible */
    }
    $(".app").classList.toggle("collapsed", ui.collapsed && !isMobile());
  }

  function saveUi() {
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({ hidden: [...ui.hidden], hideDone: ui.hideDone, showFog: ui.showFog, collapsed: ui.collapsed, tab: ui.tab })
      );
    } catch {
      /* stockage local indisponible */
    }
  }

  function renderTabs() {
    $$(".tab").forEach((tab) => {
      const active = tab.dataset.tab === ui.tab;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    for (const name of ["filters", "list", "missions", "crafting"]) {
      $(`#panel-${name}`).classList.toggle("hidden", name !== ui.tab);
    }
  }

  // ---------------------------------------------------------------- carte
  /**
   * Projection : coordonnées du jeu en mètres (lat = y vers le nord, lng = x vers l'est), monde de -5120 à +5120.
   * Au zoom 0, le monde tient dans une tuile de 320 px (32 m par pixel) ; au zoom 5, 1 pixel = 1 m
   * (tuiles produites par tools/game/build_tiles.py).
   */
  function initMap() {
    const W = index.world.max;
    const crs = L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(1 / 32, W / 32, -1 / 32, W / 32) });
    const bounds = L.latLngBounds([index.world.min, index.world.min], [W, W]);

    map = L.map("map", {
      crs,
      zoomControl: false,
      minZoom: 1,
      maxZoom: 7,
      maxBoundsViscosity: 0.65,
      // Zoom par niveaux entiers : un zoom fractionnaire laisse des lignes entre les tuiles (le niveau précédent transparaît).
      zoomSnap: 1,
      wheelPxPerZoomLevel: 90,
      attributionControl: true,
    });

    L.control.zoom({ position: "bottomright", zoomInTitle: "Zoom avant", zoomOutTitle: "Zoom arrière" }).addTo(map);

    L.tileLayer("tiles/{z}/{x}/{y}.jpg", {
      tileSize: 320,
      minZoom: 0,
      maxNativeZoom: 5,
      maxZoom: 7,
      noWrap: true,
      bounds,
      errorTileUrl: BLANK_TILE,
      keepBuffer: 4,
      updateWhenIdle: false,
      attribution: "Carte et données : <i>Far Cry Primal</i> © Ubisoft · projet de fans non officiel",
    }).addTo(map);

    map.setMaxBounds(bounds);

    // Vue initiale : cadrée sur les lieux du jeu (le fond de carte déborde largement).
    mapFocusBounds = L.latLngBounds(locations.map((loc) => [loc.latitude, loc.longitude])).pad(0.02);
    fitMap();

    // Pas de regroupement : chaque élément reste visible ; les icônes rétrécissent quand on dézoome.
    clusters = L.layerGroup().addTo(map);

    for (const loc of locations) {
      const marker = L.marker([loc.latitude, loc.longitude], {
        icon: makeMarkerIcon(spriteOf(loc)),
        title: loc.title,
        riseOnHover: true,
        keyboard: false,
      });
      marker.location = loc;
      marker.on("click", () => {
        marker.unbindPopup();
        marker.bindPopup(() => buildPopup(loc), POPUP_OPTIONS).openPopup();
      });
      marker.on("add", () => paintMarker(marker));
      markers.set(loc.id, marker);
    }

    applyFilters();

    // Icônes plus petites quand la carte est dézoomée, pour voir les éléments sans tout agrandir.
    const scalePins = () => {
      const z = map.getZoom();
      map.getContainer().style.setProperty("--pin-scale", z >= DETAIL_ZOOM ? 1 : z >= 4 ? 0.85 : z >= 3 ? 0.7 : 0.6);
    };
    map.on("zoomend", scalePins);
    scalePins();

    map.on("click", () => {
      if (isMobile()) $(".app").classList.remove("sidebar-open");
    });
  }

  function fitMap() {
    if (mapFocusBounds) map.fitBounds(mapFocusBounds, { padding: [16, 16], animate: false });
  }

  const spriteOf = (loc) => iconRects[loc.icon] || (catById.get(loc.category_id) || {}).sprite;

  /** Style CSS d'une icône du sprite, réduite pour tenir dans un carré de `box` px (taille d'origine si absent). */
  function iconStyle(sp, box) {
    if (!sp) return `width:${box || 24}px;height:${box || 24}px;border-radius:50%;background:#8a7a67;`;
    const w = sp.width / sp.pixelRatio;
    const h = sp.height / sp.pixelRatio;
    const scale = box ? Math.min(box / w, box / h) : 1;
    return `background-image:url(${sprite.url});background-size:${(sprite.width / sp.pixelRatio) * scale}px ${(sprite.height / sp.pixelRatio) * scale}px;background-position:${(-sp.x / sp.pixelRatio) * scale}px ${(-sp.y / sp.pixelRatio) * scale}px;width:${w * scale}px;height:${h * scale}px;`;
  }

  function makeMarkerIcon(sp) {
    const w = sp ? sp.width / sp.pixelRatio : 24;
    const h = sp ? sp.height / sp.pixelRatio : 24;
    return L.divIcon({
      className: "mg-marker",
      html: `<div class="mg-pin" style="${iconStyle(sp)}"></div>`,
      iconSize: [w, h],
      iconAnchor: [w / 2, h / 2],
      popupAnchor: [0, -h / 2],
    });
  }

  function paintMarker(marker) {
    const node = marker && marker.getElement();
    if (!node) return;
    node.classList.toggle("is-found", isDone(marker.location));
  }

  // ---------------------------------------------------------------- filtres
  function renderFilters() {
    const panel = $("#panel-filters");
    panel.innerHTML = `
      <label class="group-row hide-done">
        <input type="checkbox" data-hide-done ${ui.hideDone ? "checked" : ""} />
        <span class="group-title">Masquer les éléments faits</span>
      </label>
      <label class="group-row hide-done">
        <input type="checkbox" data-show-fog ${ui.showFog ? "checked" : ""} />
        <span class="group-title">Assombrir les zones inexplorées</span>
      </label>`;

    for (const group of groups) {
      const cats = categories.filter((c) => c.group_id === group.id);
      if (!cats.length) continue;

      const wrap = document.createElement("div");
      wrap.className = "group";

      const groupRow = document.createElement("label");
      groupRow.className = "group-row";
      groupRow.innerHTML = `
        <input type="checkbox" data-group="${group.id}" checked />
        <span class="swatch" style="background:${group.color}"></span>
        <span class="group-title">${escapeHtml(group.title)}</span>
        <span class="group-count" data-count="group-${group.id}"></span>`;
      wrap.appendChild(groupRow);

      const list = document.createElement("div");
      list.className = "cats";
      for (const cat of cats) {
        const row = document.createElement("label");
        row.className = "cat-row";
        row.dataset.cat = String(cat.id);
        row.innerHTML = `
          <input type="checkbox" data-cat="${cat.id}" checked />
          <span class="cat-icon" style="${iconStyle(cat.sprite, 21)}"></span>
          <span class="cat-title">${escapeHtml(cat.title)}</span>
          <span class="cat-count" data-count="cat-${cat.id}"></span>`;
        list.appendChild(row);
      }
      wrap.appendChild(list);
      panel.appendChild(wrap);
    }

    panel.addEventListener("change", (event) => {
      const input = event.target;
      if ("showFog" in input.dataset) {
        ui.showFog = input.checked;
        saveUi();
        updateFog();
        return;
      }
      if ("hideDone" in input.dataset) {
        ui.hideDone = input.checked;
      } else if (input.dataset.cat) {
        const id = input.dataset.cat;
        if (input.checked) ui.hidden.delete(id);
        else ui.hidden.add(id);
      } else if (input.dataset.group) {
        const id = input.dataset.group;
        for (const c of categories.filter((c) => c.group_id === id)) {
          if (input.checked) ui.hidden.delete(c.id);
          else ui.hidden.add(c.id);
        }
      } else {
        return;
      }
      saveUi();
      applyFilters();
      updateFilterStates();
      renderList();
    });

    updateFilterStates();
  }

  function updateFilterStates() {
    for (const cat of categories) {
      const input = $(`#panel-filters input[data-cat="${cat.id}"]`);
      if (input) input.checked = !ui.hidden.has(cat.id);
      const row = $(`#panel-filters .cat-row[data-cat="${cat.id}"]`);
      if (row) row.classList.toggle("is-hidden", ui.hidden.has(cat.id));
    }
    for (const group of groups) {
      const input = $(`#panel-filters input[data-group="${group.id}"]`);
      if (!input) continue;
      const cats = categories.filter((c) => c.group_id === group.id);
      const hiddenCount = cats.filter((c) => ui.hidden.has(c.id)).length;
      input.checked = hiddenCount === 0;
      input.indeterminate = hiddenCount > 0 && hiddenCount < cats.length;
    }
  }

  function applyFilters() {
    if (!clusters) return;
    for (const loc of locations) {
      const marker = markers.get(loc.id);
      const visible = isShown(loc);
      if (visible !== clusters.hasLayer(marker)) (visible ? clusters.addLayer : clusters.removeLayer).call(clusters, marker);
    }
  }

  // ---------------------------------------------------------------- compteurs
  function updateCounts() {
    const stats = new Map(); // clé "cat-x" / "group-x" -> { done, total, tracked }
    const bump = (key, loc) => {
      const s = stats.get(key) || { done: 0, total: 0, tracked: 0 };
      s.total++;
      if (isTracked(loc)) s.tracked++;
      if (isDone(loc)) s.done++;
      stats.set(key, s);
    };
    let done = 0;
    let tracked = 0;
    for (const loc of locations) {
      bump(`cat-${loc.category_id}`, loc);
      bump(`group-${loc.group_id}`, loc);
      if (isTracked(loc)) tracked++;
      if (isDone(loc)) done++;
    }

    counts.done = done;
    counts.tracked = tracked;
    renderSummary();

    for (const [key, s] of stats) {
      const node = $(`#panel-filters [data-count="${key}"]`);
      if (!node) continue;
      // Élément non suivi : on affiche seulement le nombre de repères.
      node.textContent = s.tracked ? `${s.done}/${s.tracked}` : String(s.total);
      node.classList.toggle("done", s.tracked > 0 && s.done === s.tracked);
      node.classList.toggle("untracked", !s.tracked);
    }
  }

  /** Un seul pourcentage : celui du jeu. Les éléments de la carte sont un compte, pas un second pourcentage. */
  function renderSummary() {
    const pct = Number(progress.progression) || 0;
    $("#progress-pct").textContent = `${pct.toFixed(1).replace(".", ",")} %`;
    $("#progress-bar").style.width = `${Math.min(pct, 100)}%`;
    $("#game-summary").textContent =
      `${counts.done} / ${counts.tracked} éléments de la carte` +
      (progress.playTime != null ? ` · ${durationLabel(progress.playTime)} de jeu` : "");
  }

  // ---------------------------------------------------------------- liste
  function visibleLocations() {
    const q = norm(ui.query);
    const matches = locations.filter((loc) => {
      if (!isShown(loc)) return false;
      if (!q) return true;
      return (
        norm(loc.title).includes(q) ||
        norm(loc.category_title).includes(q) ||
        norm(loc.group_title).includes(q) ||
        norm(loc.description).includes(q)
      );
    });
    // À faire d'abord, puis faits, puis éléments non suivis (tri stable : l'ordre d'origine reste dans chaque bloc).
    const rank = (loc) => (!isTracked(loc) ? 2 : isDone(loc) ? 1 : 0);
    return matches.sort((a, b) => rank(a) - rank(b));
  }

  function stateText(loc) {
    if (!isTracked(loc)) return "";
    const s = stateOf(loc);
    if (isDone(loc)) return s[0].toUpperCase() + s.slice(1);
    // Pas fait : l'état visé d'abord, puis l'état actuel s'il existe.
    const now = s === "révélé" ? "révélé sur la carte du jeu" : s;
    return PENDING[goalOf(loc)] + (now ? ` · ${now}` : "");
  }

  function renderList() {
    const panel = $("#panel-list");
    const results = visibleLocations();
    const shown = results.slice(0, 400);

    $("#list-count").textContent = results.length ? String(results.length) : "";

    if (!results.length) {
      panel.innerHTML = `<div class="list-empty">Aucun lieu ne correspond.<br>Essayez un autre mot-clé ou réactivez des catégories.</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const loc of shown) {
      const row = document.createElement("div");
      row.className = `row${isDone(loc) ? " found" : ""}`;
      row.dataset.id = String(loc.id);
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.innerHTML = `
        <span class="cat-icon" style="${iconStyle(spriteOf(loc), 21)}"></span>
        <span class="row-main">
          <span class="row-title">${escapeHtml(loc.title)}</span>
          <span class="row-sub">${escapeHtml(loc.category_title)}${isTracked(loc) ? ` · ${escapeHtml(stateText(loc))}` : ""}</span>
        </span>
        ${isDone(loc) ? '<span class="row-check" aria-label="Fait">✓</span>' : ""}`;
      row.addEventListener("click", () => focusLocation(loc));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          focusLocation(loc);
        }
      });
      fragment.appendChild(row);
    }
    panel.innerHTML = "";
    panel.appendChild(fragment);

    if (results.length > shown.length) {
      const more = document.createElement("div");
      more.className = "list-empty";
      more.textContent = `… ${results.length - shown.length} autres lieux. Affinez la recherche.`;
      panel.appendChild(more);
    }
  }

  function renderMissions() {
    const panel = $("#panel-missions");
    const list = progress.missions || [];
    $("#missions-count").textContent = list.length ? `${list.filter((m) => m.done).length}/${list.length}` : "";
    // Groupes dans l'ordre de l'index (lignes d'histoire du jeu), missions dans l'ordre du jeu.
    let html = "";
    for (const group of [...new Set(list.map((m) => m.group))]) {
      const items = list.filter((m) => m.group === group);
      html += `<div class="mission-family">${escapeHtml(group)} <span>${items.filter((m) => m.done).length}/${items.length}</span></div>`;
      for (const m of items) {
        const i = list.indexOf(m);
        html += `<div class="row mission${m.done ? " found" : ""}">
          <span class="row-main"><span class="row-title">${escapeHtml(m.title)}</span>
          <span class="row-sub">${m.done ? "Terminée" : "Pas encore terminée"}</span></span>
          ${m.x != null ? `<button type="button" class="mission-locate" data-mission="${i}" title="Voir le donneur de la mission sur la carte" aria-label="Voir ${escapeHtml(m.title)} sur la carte">⌖</button>` : ""}
          ${m.done ? '<span class="row-check" aria-label="Terminée">✓</span>' : ""}</div>`;
      }
    }
    panel.innerHTML = html || '<div class="list-empty">Aucune mission lue dans la sauvegarde.</div>';
  }

  /** Onglet Compétences : arbres de compétences (un par personnage), puis améliorations de l'atelier. */
  function renderCrafting() {
    const skills = progress.skills || [];
    const list = progress.crafting || [];
    let html = "";
    const section = (title, items) =>
      `<div class="tab-section">${title} <span>${items.filter((i) => i.done).length}/${items.length}</span></div>`;
    if (skills.length) html += section("Compétences", skills);
    for (const tree of [...new Set(skills.map((s) => s.tree))]) {
      const items = skills.filter((s) => s.tree === tree);
      html += `<div class="mission-family">${escapeHtml(tree)} <span>${items.filter((s) => s.done).length}/${items.length}</span></div>`;
      for (const s of items) {
        html += `<div class="row mission${s.done ? " found" : ""}">
          <span class="row-main"><span class="row-title">${escapeHtml(s.title)}</span>
          <span class="row-sub">${s.done ? "Obtenue" : "Pas encore obtenue"}</span></span>
          ${s.done ? '<span class="row-check" aria-label="Obtenue">✓</span>' : ""}</div>`;
      }
    }
    if (list.length) html += section("Atelier", list);
    for (const group of [...new Set(list.map((c) => c.group))]) {
      const items = list.filter((c) => c.group === group);
      html += `<div class="mission-family">${escapeHtml(group)} <span>${items.filter((c) => c.done).length}/${items.length}</span></div>`;
      for (const c of items) {
        html += `<div class="row mission${c.done ? " found" : ""}">
          <span class="row-main"><span class="row-title">${escapeHtml(group)} — niveau ${c.level}</span>
          <span class="row-sub">${c.done ? "Fabriqué" : "Pas encore fabriqué"}</span></span>
          ${c.done ? '<span class="row-check" aria-label="Fabriqué">✓</span>' : ""}</div>`;
      }
    }
    $("#panel-crafting").innerHTML = html || '<div class="list-empty">Aucune amélioration lue dans la sauvegarde.</div>';
  }

  let missionPin = null;
  /** Centre la carte sur le donneur d'une mission, avec un repère temporaire. */
  function showMission(m) {
    if (missionPin) missionPin.remove();
    missionPin = L.marker([m.y, m.x], {
      icon: L.divIcon({ className: "mission-pin", html: "<span></span>", iconSize: [26, 26], iconAnchor: [13, 13] }),
      keyboard: false,
    })
      .addTo(map)
      .bindPopup(`<div class="popup"><h3>${escapeHtml(m.title)}</h3><span class="popup-cat">Donneur de la mission</span></div>`, POPUP_OPTIONS);
    if (isMobile()) $(".app").classList.remove("sidebar-open");
    map.setView([m.y, m.x], Math.max(map.getZoom(), DETAIL_ZOOM));
    missionPin.openPopup();
  }

  function focusLocation(loc) {
    const marker = markers.get(loc.id);
    if (!marker) return;
    if (!clusters.hasLayer(marker)) clusters.addLayer(marker);
    if (isMobile()) $(".app").classList.remove("sidebar-open");

    marker.unbindPopup();
    marker.bindPopup(() => buildPopup(loc), POPUP_OPTIONS);

    map.setView([loc.latitude, loc.longitude], Math.max(map.getZoom(), DETAIL_ZOOM));
    marker.openPopup();
  }

  // ---------------------------------------------------------------- popups
  function mdToHtml(markdown) {
    if (!markdown) return "";
    const inline = (text) =>
      text
        .replace(
          /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        )
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");

    const lines = escapeHtml(markdown).split(/\r?\n/);
    let html = "";
    let inList = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${inline(trimmed.replace(/^[-*]\s+/, ""))}</li>`;
        continue;
      }
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (!trimmed) continue;
      html += `<p>${inline(trimmed)}</p>`;
    }
    if (inList) html += "</ul>";
    return html;
  }

  function buildPopup(loc) {
    const wrap = document.createElement("div");
    wrap.className = "popup";
    wrap.dataset.id = String(loc.id);
    const state = isTracked(loc)
      ? `<div class="popup-state${isDone(loc) ? " is-done" : ""}">${isDone(loc) ? "✓ " : ""}${escapeHtml(stateText(loc))}</div>`
      : '<div class="popup-state is-info">Repère d\'information : le jeu n\'enregistre pas d\'état pour cet élément.</div>';
    wrap.innerHTML = `
      <div class="popup-head">
        <span class="cat-icon" style="${iconStyle(spriteOf(loc), 26)}"></span>
        <div>
          <h3>${escapeHtml(loc.title)}</h3>
          <span class="popup-cat">${escapeHtml(loc.category_title)}</span>
        </div>
      </div>
      ${state}
      <div class="popup-desc">${mdToHtml(loc.description) || '<p class="muted">Pas de description.</p>'}</div>`;
    return wrap;
  }

  // ---------------------------------------------------------------- brouillard de guerre
  let fogLayer = null;
  let fogSavedAt = null;

  /** Calque sombre sur les zones inexplorées, d'après la grille 1024 x 1024 bits de la sauvegarde. */
  async function updateFog() {
    if (!ui.showFog) {
      if (fogLayer) fogLayer.remove();
      return;
    }
    if (fogLayer && fogSavedAt === progress.savedAt) {
      fogLayer.addTo(map);
      return;
    }
    let bits;
    try {
      const res = await fetch("api/fog", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bits = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      toast(`Brouillard illisible : ${err.message}`, "error");
      return;
    }
    const SIZE = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(SIZE, SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
      // Bit à 1 = exploré (transparent) ; dans un octet, le bit de poids faible est la case la plus à l'ouest.
      if (!((bits[i >> 3] >> (i & 7)) & 1)) {
        img.data[i * 4 + 3] = 165;
      }
    }
    ctx.putImageData(img, 0, 0);
    const f = index.fog;
    if (fogLayer) fogLayer.remove();
    fogLayer = L.imageOverlay(canvas.toDataURL(), [[f.min, f.min], [f.max, f.max]], {
      interactive: false,
      className: "fog-layer",
    });
    fogSavedAt = progress.savedAt;
    if (ui.showFog) fogLayer.addTo(map);
  }

  // ---------------------------------------------------------------- sauvegarde du jeu
  function setSaveStatus(kind, text) {
    $("#save-line").className = `save-line ${kind}`;
    $("#save-text").textContent = text;
  }

  function showSaveHelp(message, withAuto) {
    $("#save-help-text").textContent = message;
    $("#btn-auto").classList.toggle("hidden", !withAuto);
    $("#save-help").classList.remove("hidden");
  }

  /** Boîte « Choisir un dossier » de Windows (ouverte par le serveur), puis relecture de la sauvegarde. */
  async function pickSaveFolder() {
    toast("Choisissez le dossier dans la fenêtre Windows qui vient de s'ouvrir.");
    try {
      const res = await fetch("api/save-location/pick", { method: "POST" });
      const out = await res.json();
      if (out.cancelled) return;
      if (!out.ok) {
        showSaveHelp(out.error || "Dossier refusé.", true);
        return;
      }
      progress = { status: {}, missions: [] }; // force le redessin complet
      await refreshProgress();
      toast(`Sauvegardes lues dans : ${out.dir}`);
    } catch (err) {
      toast(`Choix du dossier impossible : ${err.message}`, "error");
    }
  }

  async function useAutoSearch() {
    await fetch("api/save-location/auto", { method: "POST" });
    progress = { status: {}, missions: [] };
    await refreshProgress();
    toast("Recherche automatique des sauvegardes activée.");
  }

  /** Avis de mise à jour : une seule vérification au démarrage (le serveur garde la réponse 6 h). */
  async function checkUpdate() {
    try {
      const info = await fetchJson("api/update");
      if (!info.available) return;
      const banner = $("#update-banner");
      banner.href = info.url;
      banner.textContent = `Nouvelle version ${info.latest} disponible (vous avez la ${info.current}) — télécharger`;
      banner.classList.remove("hidden");
    } catch {
      /* pas d'avis */
    }
  }

  async function refreshProgress(manual = false) {
    let data;
    try {
      const res = await fetch("api/progress", { cache: "no-store" });
      data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code });
    } catch (err) {
      const missing = err.code === "no-save";
      setSaveStatus("error", missing ? "Sauvegarde introuvable" : "Sauvegarde illisible");
      showSaveHelp(missing ? err.message : `La carte ne peut pas lire la sauvegarde : ${err.message}`, false);
      return;
    }
    setSaveStatus(data.warning ? "offline" : "saved", data.warning || `Sauvegarde du ${timeLabel(data.savedAt)}`);
    $("#save-line").title = data.file;
    $("#save-help").classList.add("hidden");
    $("#btn-auto").classList.toggle("hidden", data.saveMode !== "manual");

    const changed = data.savedAt !== progress.savedAt;
    if (changed && progress.savedAt) toast("Nouvelle sauvegarde du jeu : carte mise à jour.");
    else if (manual) toast("La sauvegarde n'a pas changé.");
    if (!changed) return;

    progress = data;
    applyFilters(); // un élément qui vient d'être fait disparaît si « Masquer les éléments faits » est actif
    for (const marker of markers.values()) {
      paintMarker(marker);
      if (marker.isPopupOpen()) marker.setPopupContent(buildPopup(marker.location));
    }
    updateCounts();
    renderList();
    renderMissions();
    renderCrafting();
    updateFog();
  }
})();
