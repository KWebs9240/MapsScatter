// =============================================================================
// PERSONAL CONFIG TEMPLATE — copy this file to config.js and fill in values.
// config.js is git-ignored; this example file is safe to commit.
// =============================================================================

const MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

const CONFIG = {
  // Your work location — find Place IDs at:
  // https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder
  originPlaceId:   'YOUR_ORIGIN_PLACE_ID',
  originLocation:  {"lat": 0, "lng": 0 },  // Optional: speeds up initial map render

  destinations: [
    {
      name:     'Home',
      placeId:  'YOUR_HOME_PLACE_ID',
      location: {"lat": 0, "lng": 0 },     // Optional: speeds up initial map render
      color:    '#4285F4',   // Blue
      emoji:    '🏠',
    },
    // Add more destinations here — the UI is fully data-driven from this array.
    // {
    //   name:     'Gym',
    //   placeId:  'YOUR_GYM_PLACE_ID',
    //   location: {"lat": 0, "lng": 0 },
    //   color:    '#EA4335',   // Red
    //   emoji:    '💪',
    // },
  ],

  // How often to automatically refresh travel times (milliseconds)
  autoRefreshMs: 5 * 60 * 1000,  // 5 minutes
};

// Dynamically inject the Google Maps SDK so the key lives only in this file
(function () {
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=geometry&callback=initMap`;
  document.head.appendChild(script);
})();
