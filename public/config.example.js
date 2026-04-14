// =============================================================================
// PERSONAL CONFIG TEMPLATE — copy this file to config.js and fill in values.
// config.js is git-ignored; this example file is safe to commit.
// =============================================================================

const MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

// Optional: Firebase project ID for shared route caching via Firestore.
// When set, fresh route results are written to Firestore and reused on
// subsequent loads until they expire (see cacheMaxAgeMs below).
//
// Setup:
//   1. Enable Firestore in the Firebase Console (Build → Firestore Database)
//   2. Set rules to allow public read/write on the history collection:
//        rules_version = '2';
//        service cloud.firestore {
//          match /databases/{database}/documents {
//            match /routeHistory/{doc} {
//              allow read, write: if true;
//            }
//          }
//        }
//   3. Paste your Firebase project ID below (e.g. 'my-project-id')
//
// Leave as empty string '' to disable caching (app works exactly as before).
const FIREBASE_PROJECT_ID = '';

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
    // Letting Claude do it's thing, we're matching based off index.  So if I add something out of order, then the history will be a mess
    // So either add in order, or address when it happens
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
  // Setting to 500 because I want the whole thing controlled pretty manually for now
  autoRefreshMs: 500 * 60 * 1000,  // 500 minutes

  // How long a cached result is considered fresh (milliseconds).
  // Defaults to autoRefreshMs if omitted.
  // Setting to 500 because I want the whole thing controlled pretty manually for now
  cacheMaxAgeMs: 500 * 60 * 1000,  // 500 minutes
};

// Dynamically inject the Google Maps SDK so the key lives only in this file
(function () {
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=geometry&callback=initMap`;
  document.head.appendChild(script);
})();
