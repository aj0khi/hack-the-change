// Explore Projects map: one Leaflet map, one marker per project, kept in sync with the project
// cards and the skill filter chips. Cards stay fully usable when Leaflet or the tiles fail to load.
const CALGARY = [51.0447, -114.0719];
const START_ZOOM = 11;
const FOCUS_ZOOM = 15;
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export const hasCoordinates = (project) =>
  Number.isFinite(project?.lat) &&
  Number.isFinite(project?.lng) &&
  Math.abs(project.lat) <= 90 &&
  Math.abs(project.lng) <= 180;

// Great-circle ("as the crow flies") distance in kilometres.
export function distanceKm(a, b) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const formatDistance = (km) =>
  km < 1 ? `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;

// Beyond this the person is probably not in Calgary, so the map shouldn't zoom out to include them.
const NEARBY_LIMIT_KM = 60;

// Inline SVG from the Lucide UMD bundle; markers are re-created by Leaflet, so data-lucide
// placeholders would need re-scanning every time a marker is shown.
function iconSvg(name) {
  const lucide = window.lucide;
  const key = String(name || "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const node = lucide?.icons?.[key];
  if (!node || !lucide.createElement) return "";
  const svg = lucide.createElement(node);
  svg.setAttribute("aria-hidden", "true");
  return svg.outerHTML;
}

/**
 * getProjects: () => every project currently in the catalog (built-in and posted).
 * escapeHTML / announce: shared helpers from app.js.
 * skills: the skill names offered as filter chips.
 */
export function createExplore({ getProjects, escapeHTML, announce, skills, places = [] }) {
  const elements = {
    map: document.querySelector("#explore-map"),
    status: document.querySelector("#map-status"),
    chips: document.querySelector("#skill-filters"),
    cards: document.querySelector("#all-projects"),
    empty: document.querySelector("#projects-empty"),
    bar: document.querySelector("#map-selection"),
    barText: document.querySelector("#map-selection-text"),
    barButton: document.querySelector("#map-show-all"),
    barLabel: document.querySelector("#map-show-all-label"),
    locate: document.querySelector("#locate-me"),
    locateLabel: document.querySelector("#locate-label"),
    nearbyNote: document.querySelector("#nearby-note"),
    nearbyPanel: document.querySelector("#nearby-panel"),
    nearbyList: document.querySelector("#nearby-list"),
    area: document.querySelector("#near-area"),
  };
  elements.area.insertAdjacentHTML(
    "beforeend",
    places
      .map((place) => `<option value="${escapeHTML(place.label)}" data-lat="${place.lat}" data-lng="${place.lng}">${escapeHTML(place.label)}</option>`)
      .join(""),
  );
  const PRIVACY_NOTE = elements.nearbyNote.textContent.replace(/\s+/g, " ").trim();
  // user: { lat, lng, accuracy } held in memory only; it is never stored or sent anywhere.
  const state = { skill: null, selectedId: null, user: null };
  let userLayer; // Leaflet layer group: "you are here" pin + accuracy circle
  const markers = new Map(); // project id → Leaflet marker
  let map;
  let mapFailed = false;
  let tileErrors = 0;
  let pendingPopup = 0;

  const projectById = (id) => getProjects().find((project) => project.id === id);
  const matchesSkill = (project) => !state.skill || project.skills.includes(state.skill);
  const distanceTo = (project) => (state.user && hasCoordinates(project) ? distanceKm(state.user, project) : null);
  const nearestTo = (list, count) =>
    state.user
      ? list
          .filter(hasCoordinates)
          .map((project) => ({ project, km: distanceKm(state.user, project) }))
          .sort((a, b) => a.km - b.km)
          .slice(0, count)
      : [];
  // Only pull the map out to the person when they're actually near the projects.
  const userIsNearby = () => {
    const [closest] = nearestTo(getProjects(), 1);
    return Boolean(closest && closest.km <= NEARBY_LIMIT_KM);
  };

  function setStatus(message) {
    elements.status.textContent = message;
    elements.status.hidden = !message;
  }

  function ensureMap() {
    if (map) return true;
    if (mapFailed) return false;
    const L = window.L;
    if (!L) {
      mapFailed = true;
      elements.map.classList.add("map-unavailable");
      setStatus("The map couldn't load. Every project is still listed below.");
      return false;
    }
    map = L.map(elements.map, {
      center: CALGARY,
      zoom: START_ZOOM,
      zoomSnap: 0.5,
      scrollWheelZoom: false, // page scrolling keeps working over the map
      dragging: !L.Browser.mobile, // one-finger swipes scroll the page; pinch still zooms and pans
      touchZoom: true,
    });
    const tiles = L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION });
    tiles.on("loading", () => {
      if (!tileErrors) setStatus("Loading map…");
    });
    tiles.on("load", () => {
      if (!tileErrors) setStatus("");
    });
    tiles.on("tileerror", () => {
      tileErrors++;
      setStatus("Some map tiles didn't load. Check your connection; every project is still listed below.");
    });
    tiles.addTo(map);
    // An empty-map click clears a selected project (markers and popups don't bubble here).
    map.on("click", () => {
      if (state.selectedId) clearSelection();
    });
    syncMarkers();
    return true;
  }

  function popupMarkup(project) {
    const km = distanceTo(project);
    return `<div class="map-popup"><p class="map-popup-type">${escapeHTML(project.orgType || "Community organization")} · Example</p><h3>${escapeHTML(project.title)}</h3><p class="map-popup-place">${escapeHTML(project.orgName || "")}${project.area ? ` · ${escapeHTML(project.area)}` : ""}</p><p class="map-popup-time">Time: ${escapeHTML(project.time.toLowerCase())}${km === null ? "" : ` · ${formatDistance(km)} from you`}</p><div class="skills-row">${project.skills.map((skill) => `<span class="skill-chip">${escapeHTML(skill)}</span>`).join("")}</div><button class="button primary map-popup-start" type="button" data-project="${escapeHTML(project.title)}">Start this project</button><p class="map-popup-note">Example opportunity, not offered by this venue.</p></div>`;
  }

  function markerIcon(project) {
    return window.L.divIcon({
      className: "map-pin-wrap",
      html: `<span class="map-pin">${iconSvg(project.icon) || '<span class="map-pin-dot"></span>'}</span>`,
      iconSize: [36, 44],
      iconAnchor: [18, 42],
      popupAnchor: [0, -38],
    });
  }

  // Create markers for new projects, drop markers for removed ones. Never duplicates.
  function syncMarkers() {
    if (!map) return;
    const L = window.L;
    const current = new Map(getProjects().filter(hasCoordinates).map((project) => [project.id, project]));
    for (const [id, marker] of markers) {
      if (!current.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
    for (const project of current.values()) {
      if (markers.has(project.id)) continue;
      const marker = L.marker([project.lat, project.lng], {
        icon: markerIcon(project),
        title: `${project.title} (${project.orgName || "example location"})`,
        alt: project.title,
        riseOnHover: true,
      });
      // Built when opened, so it shows the distance once the person shares their location.
      marker.bindPopup(() => popupMarkup(projectById(project.id) ?? project), { maxWidth: 260, minWidth: 200, autoPanPadding: [24, 24] });
      marker.on("click", () => select(project.id, "marker"));
      markers.set(project.id, marker);
    }
  }

  function fitTo(latLngs) {
    const animate = !reducedMotion();
    if (!latLngs.length) map.setView(CALGARY, START_ZOOM, { animate });
    else if (latLngs.length === 1) map.setView(latLngs[0], 14, { animate });
    else map.fitBounds(window.L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 14, animate });
  }

  function focusMarker(marker) {
    const ticket = ++pendingPopup;
    const open = () => {
      if (ticket === pendingPopup && map.hasLayer(marker)) marker.openPopup();
    };
    const target = marker.getLatLng();
    // Put the pin near the bottom of the map so its popup fits above it without an extra pan.
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM);
    const offset = Math.max(0, map.getSize().y / 2 - 40);
    const center = map.unproject(map.project(target, zoom).subtract([0, offset]), zoom);
    map.closePopup();
    if (reducedMotion()) {
      map.setView(center, zoom, { animate: false });
      open();
      return;
    }
    map.once("moveend", open);
    map.flyTo(center, zoom, { duration: 0.8 });
    setTimeout(open, 1100); // flyTo to the current view may not fire moveend
  }

  function updateMap({ fit }) {
    if (!map) return;
    const filtered = getProjects().filter(matchesSkill);
    const filteredIds = new Set(filtered.map((project) => project.id));
    for (const [id, marker] of markers) {
      const show = filteredIds.has(id);
      if (show && !map.hasLayer(marker)) marker.addTo(map);
      if (!show && map.hasLayer(marker)) marker.remove();
      if (!show) continue;
      const selected = id === state.selectedId;
      const faded = Boolean(state.selectedId) && !selected;
      marker.setOpacity(faded ? 0.35 : 1);
      marker.setZIndexOffset(selected ? 1000 : 0);
      const element = marker.getElement();
      element?.classList.toggle("is-selected", selected);
      element?.classList.toggle("is-faded", faded);
    }
    const selectedMarker = state.selectedId && markers.get(state.selectedId);
    if (selectedMarker) {
      if (fit) focusMarker(selectedMarker);
      return;
    }
    pendingPopup++;
    map.closePopup();
    if (!fit) return;
    const points = filtered.filter((project) => markers.has(project.id)).map((project) => markers.get(project.id).getLatLng());
    if (state.user && userIsNearby()) {
      // With a location, frame the person and their closest few matches rather than the whole city.
      fitTo([[state.user.lat, state.user.lng], ...nearestTo(filtered, 3).map(({ project }) => [project.lat, project.lng])]);
    } else fitTo(points);
  }

  function showUserPin() {
    if (!map) return;
    const L = window.L;
    userLayer?.remove();
    userLayer = L.layerGroup();
    if (state.user.source === "device" && state.user.accuracy < 3000)
      L.circle([state.user.lat, state.user.lng], {
        radius: state.user.accuracy,
        color: "#2f6f8f",
        weight: 1,
        fillColor: "#2f6f8f",
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(userLayer);
    // Draggable so a wrong guess (common on laptops) can be fixed by hand; "choose your area" is the keyboard route.
    const pin = L.marker([state.user.lat, state.user.lng], {
      icon: L.divIcon({
        className: "map-user-wrap",
        html: '<span class="map-user-pin"><span class="map-user-label">You</span></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      title: "Your location. Drag to correct it.",
      alt: "Your location",
      keyboard: false,
      draggable: true,
      autoPan: true,
      zIndexOffset: 2000,
    }).addTo(userLayer);
    pin.on("dragstart", stopWatching); // a hand-placed pin wins over later device fixes
    pin.on("dragend", () => {
      const { lat, lng } = pin.getLatLng();
      state.refining = false;
      elements.area.value = "";
      useLocation({ lat, lng, accuracy: null, source: "pin" });
      const [closest] = nearestTo(getProjects().filter(matchesSkill), 1);
      if (closest) announce(`Pin moved. Closest project: ${closest.project.title}, ${formatDistance(closest.km)} away.`);
    });
    userLayer.addTo(map);
  }

  // "Closest to you" list (respects the skill filter) and "1.2 km away" on each card.
  function renderNearby(filtered) {
    elements.nearbyPanel.hidden = !state.user;
    elements.cards.querySelectorAll("[data-project-card]").forEach((card) => {
      const project = projectById(card.dataset.projectCard);
      const km = project && distanceTo(project);
      let tag = card.querySelector(".project-distance");
      if (km === null || km === undefined) return tag?.remove();
      if (!tag) {
        tag = document.createElement("span");
        tag.className = "project-distance";
        card.querySelector(".project-meta")?.append(tag);
      }
      tag.textContent = `· ${formatDistance(km)} away`;
    });
    if (!state.user) return;
    const closest = nearestTo(filtered, 3);
    elements.nearbyList.innerHTML = closest.length
      ? closest
          .map(
            ({ project, km }) =>
              `<li><button type="button" data-near-project="${escapeHTML(project.id)}"${project.id === state.selectedId ? ' aria-current="true"' : ""}><span class="nearby-distance">${formatDistance(km)}</span><span class="nearby-text"><strong>${escapeHTML(project.title)}</strong><span>${escapeHTML(project.orgName || "")}</span></span></button></li>`,
          )
          .join("")
      : `<li class="nearby-empty">No ${state.skill ? `${escapeHTML(state.skill)} ` : ""}projects have a map location yet.</li>`;
  }

  function renderChips() {
    const all = getProjects();
    const chip = (skill, label, count) => {
      const active = state.skill === skill;
      return `<button type="button" class="skill-filter${active ? " active" : ""}" data-filter-skill="${escapeHTML(skill ?? "")}" aria-pressed="${active}">${active ? '<span class="skill-filter-check" aria-hidden="true">✓</span>' : ""}${escapeHTML(label)} <span class="skill-filter-count">${count}</span></button>`;
    };
    elements.chips.innerHTML =
      chip(null, "All skills", all.length) +
      skills.map((skill) => chip(skill, skill, all.filter((project) => project.skills.includes(skill)).length)).join("");
  }

  function updateCards() {
    const filtered = getProjects().filter(matchesSkill);
    const visibleIds = new Set(state.selectedId ? [state.selectedId] : filtered.map((project) => project.id));
    elements.cards.querySelectorAll("[data-project-card]").forEach((card) => {
      const id = card.dataset.projectCard;
      card.hidden = !visibleIds.has(id);
      const selected = id === state.selectedId;
      card.classList.toggle("is-selected", selected);
      if (selected) card.setAttribute("aria-current", "true");
      else card.removeAttribute("aria-current");
    });
    elements.empty.hidden = filtered.length > 0;
    elements.empty.textContent = filtered.length
      ? ""
      : `No example projects build ${state.skill} yet. Choose "All skills" to see every project.`;
    const selected = state.selectedId && projectById(state.selectedId);
    elements.bar.hidden = !selected;
    if (selected) {
      elements.barText.innerHTML = `<span class="map-selection-label">Showing:</span> ${escapeHTML(selected.title)}`;
      elements.barLabel.textContent = state.skill ? `Show all ${state.skill} projects` : "Show all projects";
    }
    return filtered;
  }

  function describe(filtered) {
    const selected = state.selectedId && projectById(state.selectedId);
    if (selected) return `Showing 1 project: ${selected.title}.`;
    if (state.skill)
      return filtered.length
        ? `Showing ${filtered.length} ${filtered.length === 1 ? "project" : "projects"} that build ${state.skill}.`
        : `No example projects build ${state.skill} yet.`;
    return `Showing all ${filtered.length} projects.`;
  }

  // Re-apply filter + selection to chips, cards, selection bar and markers.
  function apply({ fit = true, speak = true } = {}) {
    if (state.selectedId) {
      const selected = projectById(state.selectedId);
      if (!selected || !matchesSkill(selected)) state.selectedId = null;
    }
    renderChips();
    const filtered = updateCards();
    renderNearby(filtered);
    updateMap({ fit });
    if (speak) announce(describe(filtered));
  }

  function scrollIntoViewSmooth(element, block) {
    element?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block });
  }

  function select(id, source = "card") {
    const project = projectById(id);
    if (!project) return;
    if (!matchesSkill(project)) state.skill = null; // e.g. a lens link to a project outside the filter
    state.selectedId = id;
    apply();
    if (!hasCoordinates(project)) setStatus("This project has no map location yet; it is still listed below.");
    elements.bar.focus({ preventScroll: true });
    if (source === "marker") scrollIntoViewSmooth(elements.cards.querySelector(`[data-project-card="${CSS.escape(id)}"]`), "nearest");
    else scrollIntoViewSmooth(elements.bar, "start");
  }

  function clearSelection() {
    const previous = state.selectedId;
    if (!previous) return;
    state.selectedId = null;
    apply();
    const card = elements.cards.querySelector(`[data-project-card="${CSS.escape(previous)}"]`);
    card?.focus({ preventScroll: true });
    scrollIntoViewSmooth(card, "nearest");
  }

  function setSkill(skill) {
    state.skill = skill && skills.includes(skill) ? skill : null;
    state.selectedId = null;
    apply();
  }

  // Escape: first leave the selected project, then clear the skill filter.
  function back() {
    if (state.selectedId) clearSelection();
    else if (state.skill) setSkill(null);
    else return false;
    return true;
  }

  // Called after the Explore view is un-hidden: Leaflet must re-measure a container that was display:none.
  function onShow() {
    const first = !map && !mapFailed;
    if (!ensureMap()) return;
    requestAnimationFrame(() => {
      map.invalidateSize();
      if (first) apply({ speak: false });
    });
  }

  // After cards are re-rendered or projects are added.
  function refresh({ fit = false } = {}) {
    syncMarkers();
    apply({ fit, speak: false });
  }

  let watchId; // active geolocation watch, if any
  let watchdog; // gives up when the browser never answers (e.g. the permission prompt is left open)

  function setLocating(on) {
    elements.locate.setAttribute("aria-pressed", String(Boolean(state.user)));
    elements.locate.disabled = on;
    elements.locateLabel.textContent = on ? "Finding you…" : state.user ? "Stop using my location" : "Show projects near me";
  }

  function stopWatching() {
    if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId);
    watchId = undefined;
    clearTimeout(watchdog);
  }

  function setNote(message, speak = false) {
    elements.nearbyNote.textContent = message;
    if (speak) announce(message);
  }

  const FIX_IT = "Drag the You pin or choose your area to correct it.";

  function describeLocation() {
    const user = state.user;
    const [closest] = nearestTo(getProjects().filter(matchesSkill), 1);
    if (!closest) return "Location set, but no projects here have a map location yet.";
    if (closest.km > NEARBY_LIMIT_KM)
      return `You seem to be outside Calgary: the closest example project is ${formatDistance(closest.km)} away. If that's wrong, choose your area.`;
    if (user.source === "area") return `Showing distances from ${user.label}. Only you can see this; it isn't saved.`;
    if (user.source === "pin") return "Showing distances from where you placed the pin. Only you can see this; it isn't saved.";
    if (user.accuracy > 1000)
      return `Your device only gave a rough location (within about ${formatDistance(user.accuracy / 1000)}). ${FIX_IT}`;
    const within = user.accuracy < 100 ? `${Math.max(10, Math.round(user.accuracy / 10) * 10)} m` : formatDistance(user.accuracy / 1000);
    return `Location accurate to about ${within}. ${state.refining ? "Still improving… " : ""}It stays on this device and is never saved or sent to Proofly.`;
  }

  // Apply a new location from the device, a dragged pin or the area list.
  function useLocation(user, { first = false } = {}) {
    const previous = state.user;
    state.user = user;
    if (first) state.selectedId = null;
    setLocating(false);
    ensureMap();
    showUserPin();
    // Only re-frame the map for a new location or a big jump, so refining fixes don't make it jump around.
    const moved = previous ? distanceKm(previous, user) : Infinity;
    apply({ fit: first || moved > 0.4, speak: false });
    setNote(describeLocation());
    const [closest] = nearestTo(getProjects().filter(matchesSkill), 1);
    if (first && closest)
      announce(`Location set. Closest project: ${closest.project.title}, ${formatDistance(closest.km)} away at ${closest.project.orgName}.`);
  }

  function stopUsingLocation() {
    stopWatching();
    state.user = null;
    state.refining = false;
    userLayer?.remove();
    userLayer = undefined;
    elements.area.value = "";
    setLocating(false);
    setNote(PRIVACY_NOTE);
    apply({ speak: false });
    announce("Your location is no longer used. Showing projects without distances.");
  }

  function locate() {
    if (state.user) return stopUsingLocation();
    // Browsers only share location on https:// pages and localhost (not http://192.168…).
    if (!window.isSecureContext)
      return setNote("Your browser only shares location on a secure (https://) page. Choose your area instead.", true);
    if (!navigator.geolocation) return setNote("This browser can't share a location. Choose your area instead.", true);
    stopWatching();
    setLocating(true);
    let best = null;
    let triedRoughFix = false;

    const finish = () => {
      stopWatching();
      state.refining = false;
      if (best) setNote(describeLocation());
    };
    const fail = (message) => {
      stopWatching();
      state.refining = false;
      setLocating(false);
      setNote(message, true);
    };
    const onFix = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      // The first reading is often a rough Wi-Fi/IP guess; keep watching and keep the most accurate one.
      if (best && accuracy >= best.accuracy) return;
      const first = !best;
      best = { lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) ? accuracy : 5000, source: "device" };
      state.refining = best.accuracy > 30;
      useLocation(best, { first });
      if (first) elements.nearbyPanel.querySelector("button")?.focus({ preventScroll: true });
      if (!state.refining) finish();
    };
    const onError = (error) => {
      if (best) return finish(); // keep the best reading we already have
      if (error.code === error.TIMEOUT && !triedRoughFix) {
        // No precise fix in time (common indoors / on desktops): accept a quicker, rougher one.
        triedRoughFix = true;
        stopWatching();
        start(false);
        return;
      }
      if (error.code === error.PERMISSION_DENIED)
        fail("Location is blocked for this site. Allow it in your browser's site settings, or choose your area instead.");
      else if (error.code === error.TIMEOUT) fail("Finding your location took too long. Try again, or choose your area instead.");
      else fail("Your device couldn't find a location. Check that location services are on, or choose your area instead.");
    };
    const start = (precise) => {
      watchId = navigator.geolocation.watchPosition(onFix, onError, {
        enableHighAccuracy: precise,
        maximumAge: precise ? 0 : 10 * 60 * 1000,
        timeout: precise ? 12000 : 10000,
      });
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (best) finish();
        else fail("We didn't get a location. If your browser asked for permission, allow it and try again, or choose your area instead.");
      }, 25000);
    };
    start(true);
  }

  function useArea() {
    const option = elements.area.selectedOptions[0];
    if (!option?.value) return;
    stopWatching();
    state.refining = false;
    useLocation(
      { lat: Number(option.dataset.lat), lng: Number(option.dataset.lng), accuracy: null, source: "area", label: option.textContent },
      { first: true },
    );
  }

  function highlight(id) {
    const element = markers.get(id)?.getElement();
    if (!element) return;
    element.classList.add("is-new");
    setTimeout(() => markers.get(id)?.getElement()?.classList.remove("is-new"), 6000);
  }

  elements.chips.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-filter-skill]");
    if (!chip) return;
    const skill = chip.dataset.filterSkill || null;
    setSkill(skill === state.skill ? null : skill);
    elements.chips.querySelector(`[data-filter-skill="${CSS.escape(state.skill ?? "")}"]`)?.focus();
  });
  elements.barButton.addEventListener("click", clearSelection);
  elements.locate.addEventListener("click", () => {
    onShow(); // the map may not exist yet if Explore was opened before Leaflet finished loading
    locate();
  });
  elements.area.addEventListener("change", () => {
    onShow();
    if (elements.area.value) useArea();
  });
  elements.nearbyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-near-project]");
    if (button) select(button.dataset.nearProject, "card");
  });
  // The card body selects the project; its buttons (the ↗ vouch arrow) keep their own behaviour.
  elements.cards.addEventListener("click", (event) => {
    const card = event.target.closest("[data-project-card]");
    if (!card || event.target.closest("button, a, input, select, textarea")) return;
    select(card.dataset.projectCard, "card");
  });
  elements.cards.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-project-card]");
    if (!card || event.target !== card) return; // keys on the arrow button act on the button
    event.preventDefault();
    select(card.dataset.projectCard, "card");
  });

  return { onShow, select, setSkill, back, refresh, highlight, get state() { return { ...state }; } };
}
