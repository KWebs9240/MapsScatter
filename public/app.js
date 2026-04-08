// =============================================================================
// CONFIGURATION — update these with your real addresses before deploying
// =============================================================================

const CONFIG = {
  // Your work address
  origin: 'YOUR WORK ADDRESS',  // e.g. '123 Main St, Seattle, WA 98101'

  destinations: [
    {
      name:    'Home',
      address: 'YOUR HOME ADDRESS',
      color:   '#4285F4',   // Blue
      emoji:   '🏠',
    },
    {
      name:    'Gym',
      address: 'YOUR GYM ADDRESS',
      color:   '#34A853',   // Green
      emoji:   '💪',
    },
    {
      name:    'Friends',
      address: 'YOUR FRIENDS ADDRESS',
      color:   '#EA4335',   // Red
      emoji:   '👥',
    },
  ],

  // How often to automatically refresh travel times (milliseconds)
  autoRefreshMs: 5 * 60 * 1000,  // 5 minutes
};

// =============================================================================
// State
// =============================================================================

let map;
let directionsService;
let renderers   = [];   // One DirectionsRenderer per destination
let routeResults = [];  // Cached API results; null = error, undefined = pending
let originMarker  = null;
let destMarkers   = [];
let activeIndex   = -1; // -1 = all routes shown

// =============================================================================
// Entry point — called by the Google Maps script once it has loaded
// =============================================================================

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    zoom: 12,
    center: { lat: 39.5, lng: -98.35 }, // Generic US center until routes load
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

  directionsService = new google.maps.DirectionsService();

  buildCards();
  loadAllRoutes();

  document.getElementById('refresh-btn').addEventListener('click', loadAllRoutes);
  setInterval(loadAllRoutes, CONFIG.autoRefreshMs);
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
// Fetch routes for all destinations
// =============================================================================

function loadAllRoutes() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.classList.add('spinning');

  // Remove old renderers and markers
  renderers.forEach(r => r && r.setMap(null));
  renderers    = new Array(CONFIG.destinations.length).fill(null);
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

  const combinedBounds = new google.maps.LatLngBounds();
  let doneCount = 0;

  CONFIG.destinations.forEach((dest, i) => {
    const renderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,   // We draw our own markers below
      preserveViewport: true,
      polylineOptions: {
        strokeColor:   dest.color,
        strokeWeight:  5,
        strokeOpacity: 0.88,
      },
    });
    renderers[i] = renderer;

    directionsService.route(
      {
        origin:      CONFIG.origin,
        destination: dest.address,
        travelMode:  google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),       // "right now" → returns traffic-aware duration
          trafficModel:  'bestguess',
        },
      },
      (result, status) => {
        doneCount++;
        const card = document.getElementById(`card-${i}`);
        card.classList.remove('loading');

        if (status === google.maps.DirectionsStatus.OK) {
          routeResults[i] = result;
          renderer.setDirections(result);

          const leg      = result.routes[0].legs[0];
          const duration = leg.duration_in_traffic || leg.duration; // traffic-aware if available
          const eta      = new Date(Date.now() + duration.value * 1000);
          const etaStr   = eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

          document.getElementById(`time-${i}`).textContent = duration.text;
          document.getElementById(`eta-${i}`).textContent  = `→ ${etaStr}`;
          document.getElementById(`dist-${i}`).textContent = leg.distance.text;

          result.routes[0].overview_path.forEach(p => combinedBounds.extend(p));
        } else {
          routeResults[i] = null;
          card.classList.add('error');
          document.getElementById(`time-${i}`).textContent = 'Unavailable';
          document.getElementById(`eta-${i}`).textContent  = 'Check address';
          console.error(`Directions failed for "${dest.name}": ${status}`);
        }

        // Once all requests are settled, finalize the map view
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
    );
  });
}

// =============================================================================
// Place custom markers for origin and each destination
// =============================================================================

function placeMarkers() {
  // Origin marker — pulled from the first successful result's start_location
  for (const r of routeResults) {
    if (r) {
      const pos = r.routes[0].legs[0].start_location;
      originMarker = new google.maps.Marker({
        position: pos,
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
    const endPos = r.routes[0].legs[0].end_location;
    const marker = new google.maps.Marker({
      position: endPos,
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
      if (r) r.routes[0].overview_path.forEach(p => allBounds.extend(p));
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
    routeResults[index].routes[0].overview_path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, 52);
  }
}

function setPolylineStyles(activeIdx) {
  renderers.forEach((r, i) => {
    if (!r) return;
    const highlighted = activeIdx === -1 || i === activeIdx;
    r.setOptions({
      polylineOptions: {
        strokeColor:   CONFIG.destinations[i].color,
        strokeOpacity: highlighted ? 0.9  : 0.15,
        strokeWeight:  highlighted ? 6    : 3,
      },
    });
  });
}

// =============================================================================
// Helpers
// =============================================================================

function updateTimestamp() {
  const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  document.getElementById('last-updated').textContent = `Updated ${t}`;
}
