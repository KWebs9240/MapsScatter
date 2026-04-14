// =============================================================================
// State
// =============================================================================

let map;
let polylines    = [];   // One Polyline per destination
let routeResults = [];   // Cached route data; null = error, undefined = pending
let originMarker  = null;
let destMarkers   = [];
let activeIndex   = -1;  // -1 = all routes shown

// =============================================================================
// Entry point — called by the Google Maps script once it has loaded
// =============================================================================

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 12,
    center: { lat: 39.5, lng: -98.35 }, // Overridden immediately by previewBounds()
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_BOTTOM,
    },
    gestureHandling: 'greedy',   // Single-finger pan on mobile; no Ctrl+scroll on desktop
    clickableIcons: false,
    styles: [
      { featureType: 'poi',     elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ],
  });

  previewBounds();
  buildCards();
  loadAllRoutes();

  document.getElementById('refresh-btn').addEventListener('click', () => loadAllRoutes(true));
  setInterval(loadAllRoutes, CONFIG.autoRefreshMs);
}

// =============================================================================
// Geocode all place IDs and fit the map immediately so the right area is
// visible before the slower Routes API calls finish.
// =============================================================================

function previewBounds() {
  const bounds = new google.maps.LatLngBounds();

  if (CONFIG.originLocation) {
    bounds.extend(CONFIG.originLocation);
  } 
  CONFIG.destinations.forEach(dest => {
    if (dest.location) {
      bounds.extend(dest.location)
    };
  });

  if (!bounds.isEmpty()) map.fitBounds(bounds, 52);
}

// =============================================================================
// Build the card UI from CONFIG
// =============================================================================

function buildCards() {
  const container = document.getElementById('cards-scroll');
  container.innerHTML = CONFIG.destinations
    .map(
      (dest, i) => `
        <div class="card loading" id="card-${i}" onclick="selectCard(${i})"
             style="--accent: ${dest.color}">
          <div class="card-header">
            <span class="card-emoji">${dest.emoji}</span>
            <span class="card-name">${dest.name}</span>
          </div>
          <div class="card-time" id="time-${i}"></div>
          <div class="card-footer">
            <span class="card-eta"  id="eta-${i}"></span>
            <span class="card-dist" id="dist-${i}"></span>
          </div>
        </div>`
    )
    .join('');
}

// =============================================================================
// Fetch routes for all destinations via the Routes API
// =============================================================================

async function loadAllRoutes(forceRefresh = false) {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.classList.add('spinning');

  // Remove old polylines and markers
  polylines.forEach(p => p && p.setMap(null));
  polylines    = new Array(CONFIG.destinations.length).fill(null);
  routeResults = new Array(CONFIG.destinations.length).fill(undefined);
  activeIndex  = -1;

  destMarkers.forEach(m => m.setMap(null));
  destMarkers = [];
  if (originMarker) { originMarker.setMap(null); originMarker = null; }
  hideHistoryPanel();

  // Reset card states
  document.querySelectorAll('.card').forEach(c => {
    c.classList.remove('active', 'dimmed', 'error');
    c.classList.add('loading');
    c.querySelector('.card-time').textContent = '';
    c.querySelector('.card-eta').textContent  = '';
    c.querySelector('.card-dist').textContent = '';
  });

  // Use cached data if it's fresh and covers the same destinations.
  // forceRefresh=true (manual button tap) always bypasses the cache.
  const maxAge = CONFIG.cacheMaxAgeMs ?? CONFIG.autoRefreshMs;
  const cached = forceRefresh ? null : await fetchCachedRoutes();
  if (
    cached &&
    Array.isArray(cached.routes) &&
    cached.routes.length === CONFIG.destinations.length &&
    (Date.now() - cached.timestamp) < maxAge
  ) {
    renderFromCache(cached);
    btn.disabled = false;
    btn.classList.remove('spinning');
    return;
  }

  // Fresh fetch from Routes API
  const apiKey = MAPS_API_KEY;

  const combinedBounds = new google.maps.LatLngBounds();
  const cacheData      = new Array(CONFIG.destinations.length).fill(null);
  let doneCount = 0;

  function onSettled() {
    doneCount++;
    if (doneCount === CONFIG.destinations.length) {
      if (!combinedBounds.isEmpty()) {
        map.fitBounds(combinedBounds, 52);
      }
      placeMarkers();
      btn.disabled = false;
      btn.classList.remove('spinning');
      updateTimestamp();
      saveCachedRoutes(cacheData);
    }
  }

  CONFIG.destinations.forEach((dest, i) => {
    fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Goog-Api-Key':  apiKey,
        'X-Goog-FieldMask': [
          'routes.duration',
          'routes.distanceMeters',
          'routes.polyline.encodedPolyline',
          'routes.legs.startLocation',
          'routes.legs.endLocation',
        ].join(','),
      },
      body: JSON.stringify({
        origin:             { placeId: CONFIG.originPlaceId },
        destination:        { placeId: dest.placeId },
        travelMode:         'DRIVE',
        routingPreference:  'TRAFFIC_AWARE_OPTIMAL',
        routeModifiers:     { avoidTolls: true },
      }),
    })
      .then(res => res.json())
      .then(data => {
        const card = document.getElementById(`card-${i}`);
        card.classList.remove('loading');

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const leg   = route.legs[0];

          const decodedPath = google.maps.geometry.encoding.decodePath(
            route.polyline.encodedPolyline
          );

          routeResults[i] = {
            startLocation: new google.maps.LatLng(
              leg.startLocation.latLng.latitude,
              leg.startLocation.latLng.longitude
            ),
            endLocation: new google.maps.LatLng(
              leg.endLocation.latLng.latitude,
              leg.endLocation.latLng.longitude
            ),
            path: decodedPath,
          };

          polylines[i] = new google.maps.Polyline({
            path:          decodedPath,
            map,
            strokeColor:   dest.color,
            strokeWeight:  5,
            strokeOpacity: 0.88,
          });

          const durationSecs = parseInt(route.duration, 10);
          const duration     = parseDuration(durationSecs);
          const distance     = parseDistance(route.distanceMeters);
          const eta          = new Date(Date.now() + durationSecs * 1000);
          const etaStr       = eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

          document.getElementById(`time-${i}`).textContent = duration.text;
          document.getElementById(`eta-${i}`).textContent  = `→ ${etaStr}`;
          document.getElementById(`dist-${i}`).textContent = distance.text;

          decodedPath.forEach(p => combinedBounds.extend(p));

          cacheData[i] = {
            duration:        durationSecs,
            distanceMeters:  route.distanceMeters,
            encodedPolyline: route.polyline.encodedPolyline,
            startLat:        leg.startLocation.latLng.latitude,
            startLng:        leg.startLocation.latLng.longitude,
            endLat:          leg.endLocation.latLng.latitude,
            endLng:          leg.endLocation.latLng.longitude,
          };
        } else {
          routeResults[i] = null;
          card.classList.add('error');
          document.getElementById(`time-${i}`).textContent = 'Unavailable';
          document.getElementById(`eta-${i}`).textContent  = 'Check address';
          console.error(`Routes API failed for "${dest.name}":`, data.error || data);
        }

        onSettled();
      })
      .catch(err => {
        const card = document.getElementById(`card-${i}`);
        card.classList.remove('loading');
        card.classList.add('error');
        routeResults[i] = null;
        document.getElementById(`time-${i}`).textContent = 'Unavailable';
        document.getElementById(`eta-${i}`).textContent  = 'Network error';
        console.error(`Fetch failed for "${dest.name}":`, err);
        onSettled();
      });
  });
}

// =============================================================================
// Place custom markers for origin and each destination
// =============================================================================

function placeMarkers() {
  // Origin marker — pulled from the first successful result's startLocation
  for (const r of routeResults) {
    if (r) {
      originMarker = new google.maps.Marker({
        position: r.startLocation,
        map,
        title:  'Work',
        zIndex: 100,
        icon: {
          path:        google.maps.SymbolPath.CIRCLE,
          scale:       9,
          fillColor:   '#1a1a2e',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
      });
      break;
    }
  }

  // Destination markers — one colored dot per successful route
  routeResults.forEach((r, i) => {
    if (!r) return;
    const dest   = CONFIG.destinations[i];
    const marker = new google.maps.Marker({
      position: r.endLocation,
      map,
      title:  dest.name,
      zIndex: 90,
      icon: {
        path:        google.maps.SymbolPath.CIRCLE,
        scale:       8,
        fillColor:   dest.color,
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
    });
    destMarkers.push(marker);
  });
}

// =============================================================================
// Card tap: highlight one route / tap again to restore all
// =============================================================================

function selectCard(index) {
  // Tapping the already-active card → show all routes again
  if (activeIndex === index) {
    activeIndex = -1;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active', 'dimmed'));
    setPolylineStyles(-1);
    hideHistoryPanel();

    const allBounds = new google.maps.LatLngBounds();
    routeResults.forEach(r => {
      if (r) r.path.forEach(p => allBounds.extend(p));
    });
    if (!allBounds.isEmpty()) map.fitBounds(allBounds, 52);
    return;
  }

  activeIndex = index;
  document.querySelectorAll('.card').forEach((c, i) => {
    c.classList.toggle('active', i === index);
    c.classList.toggle('dimmed', i !== index);
  });
  setPolylineStyles(index);

  // Zoom the map to just the selected route
  if (routeResults[index]) {
    const bounds = new google.maps.LatLngBounds();
    routeResults[index].path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, 52);
  }

  showHistoryPanel(index);
}

function setPolylineStyles(activeIdx) {
  polylines.forEach((p, i) => {
    if (!p) return;
    const highlighted = activeIdx === -1 || i === activeIdx;
    p.setOptions({
      strokeColor:   CONFIG.destinations[i].color,
      strokeOpacity: highlighted ? 0.9  : 0.15,
      strokeWeight:  highlighted ? 6    : 3,
    });
  });
}

// =============================================================================
// Route history — Firestore REST API
// =============================================================================

// Each route fetch is appended as a new document in the `routeHistory`
// collection (auto-generated ID). Two top-level Firestore fields:
//   timestamp : integerValue  — ms since epoch, used for ordering queries
//   payload   : stringValue   — full JSON snapshot ({ timestamp, routes[] })
//
// routes[] element shape:
//   { duration, distanceMeters, encodedPolyline, startLat, startLng, endLat, endLng }
//   | null  (null = error for that destination on that fetch)

const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Shared helper: run a descending-timestamp query on routeHistory
function queryHistory(limit) {
  return fetch(`${FIRESTORE_BASE}:runQuery`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from:    [{ collectionId: 'routeHistory' }],
        orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
        limit,
      },
    }),
  });
}

// Returns the most-recent snapshot payload for fresh-cache checks, or null
async function fetchCachedRoutes() {
  if (!FIREBASE_PROJECT_ID) return null;
  try {
    const res = await queryHistory(1);
    if (!res.ok) return null;
    const results = await res.json();
    const doc = results[0]?.document;
    if (!doc) return null;
    return JSON.parse(doc.fields.payload.stringValue);
  } catch (e) {
    return null;
  }
}

// Appends a new history document (does NOT overwrite previous ones)
function saveCachedRoutes(routes) {
  if (!FIREBASE_PROJECT_ID) return;
  const ts = Date.now();
  fetch(`${FIRESTORE_BASE}/routeHistory`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        timestamp: { integerValue: String(ts) },
        payload:   { stringValue: JSON.stringify({ timestamp: ts, routes }) },
      },
    }),
  }).catch(e => console.warn('Failed to save route history:', e));
}

// Returns last 50 { timestamp, duration } records for one destination index
async function fetchRouteHistory(destIndex) {
  if (!FIREBASE_PROJECT_ID) return [];
  try {
    const res = await queryHistory(50);
    if (!res.ok) return [];
    const results = await res.json();
    return results
      .filter(r => r.document)
      .map(r => {
        const ts      = parseInt(r.document.fields.timestamp.integerValue, 10);
        const payload = JSON.parse(r.document.fields.payload.stringValue);
        const route   = Array.isArray(payload.routes) ? payload.routes[destIndex] : null;
        return route ? { timestamp: ts, duration: route.duration } : null;
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

// =============================================================================
// History panel
// =============================================================================

async function showHistoryPanel(destIndex) {
  const panel = document.getElementById('history-panel');
  const title = document.getElementById('history-title');
  const list  = document.getElementById('history-list');
  const dest  = CONFIG.destinations[destIndex];

  title.textContent = `${dest.emoji} ${dest.name}`;
  title.style.color = dest.color;
  list.innerHTML = '<li class="history-loading">Loading history\u2026</li>';
  panel.classList.add('visible');

  const history = await fetchRouteHistory(destIndex);

  // Guard: user may have dismissed the panel while the fetch was in flight
  if (!panel.classList.contains('visible')) return;

  if (history.length === 0) {
    list.innerHTML = '<li class="history-empty">No history yet.</li>';
    return;
  }

  list.innerHTML = history.map(h => {
    const d       = new Date(h.timestamp);
    const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dur     = parseDuration(h.duration);
    return `<li class="history-item">
      <span class="history-when">${dateStr}, ${timeStr}</span>
      <span class="history-duration">${dur.text}</span>
    </li>`;
  }).join('');
}

function hideHistoryPanel() {
  document.getElementById('history-panel').classList.remove('visible');
}

// =============================================================================
// Render from Firestore cache
// =============================================================================

function renderFromCache(cached) {
  const combinedBounds = new google.maps.LatLngBounds();

  cached.routes.forEach((r, i) => {
    const card = document.getElementById(`card-${i}`);
    card.classList.remove('loading');
    const dest = CONFIG.destinations[i];

    if (r) {
      const decodedPath = google.maps.geometry.encoding.decodePath(r.encodedPolyline);

      routeResults[i] = {
        startLocation: new google.maps.LatLng(r.startLat, r.startLng),
        endLocation:   new google.maps.LatLng(r.endLat, r.endLng),
        path:          decodedPath,
      };

      polylines[i] = new google.maps.Polyline({
        path:          decodedPath,
        map,
        strokeColor:   dest.color,
        strokeWeight:  5,
        strokeOpacity: 0.88,
      });

      const duration = parseDuration(r.duration);
      const distance = parseDistance(r.distanceMeters);
      const eta      = new Date(Date.now() + r.duration * 1000);
      const etaStr   = eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      document.getElementById(`time-${i}`).textContent = duration.text;
      document.getElementById(`eta-${i}`).textContent  = `→ ${etaStr}`;
      document.getElementById(`dist-${i}`).textContent = distance.text;

      decodedPath.forEach(p => combinedBounds.extend(p));
    } else {
      routeResults[i] = null;
      card.classList.add('error');
      document.getElementById(`time-${i}`).textContent = 'Unavailable';
      document.getElementById(`eta-${i}`).textContent  = 'Check address';
    }
  });

  if (!combinedBounds.isEmpty()) map.fitBounds(combinedBounds, 52);
  placeMarkers();
  updateTimestamp(cached.timestamp);
}

// =============================================================================
// Helpers
// =============================================================================

// Routes API returns duration as "1234s" — convert to { value, text }
function parseDuration(durationStr) {
  const seconds = parseInt(durationStr, 10);
  const mins    = Math.round(seconds / 60);
  if (mins < 60) {
    return { value: seconds, text: `${mins} min${mins !== 1 ? 's' : ''}` };
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { value: seconds, text: m > 0 ? `${h} hr ${m} min` : `${h} hr` };
}

// Routes API returns distance in meters — convert to { value, text } in miles
function parseDistance(meters) {
  const miles = meters / 1609.344;
  return {
    value: meters,
    text:  miles >= 10 ? `${Math.round(miles)} mi` : `${miles.toFixed(1)} mi`,
  };
}

function updateTimestamp(timestamp = Date.now()) {
  const t = new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  document.getElementById('last-updated').textContent = `Updated ${t}`;
}
