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

  document.getElementById('refresh-btn').addEventListener('click', loadAllRoutes);
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

function loadAllRoutes() {
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

  // Reset card states
  document.querySelectorAll('.card').forEach(c => {
    c.classList.remove('active', 'dimmed', 'error');
    c.classList.add('loading');
    c.querySelector('.card-time').textContent = '';
    c.querySelector('.card-eta').textContent  = '';
    c.querySelector('.card-dist').textContent = '';
  });

  const apiKey = MAPS_API_KEY;

  const combinedBounds = new google.maps.LatLngBounds();
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

          const duration = parseDuration(route.duration);
          const distance = parseDistance(route.distanceMeters);
          const eta      = new Date(Date.now() + duration.value * 1000);
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

function updateTimestamp() {
  const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  document.getElementById('last-updated').textContent = `Updated ${t}`;
}
