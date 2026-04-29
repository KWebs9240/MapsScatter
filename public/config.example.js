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
  // Each category groups related route pairs. Each route is a source→destination
  // pair with its own origin. Find Place IDs at:
  // https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder
  //
  // Routes are matched to history by index within their category, so
  // don't reorder entries — append new ones at the end instead.
  categories: [
    {
      name: 'After Work',
      routes: [
        {
          name:  'Home',
          color: '#4285F4',  // Blue
          emoji: '🏠',
          origin:      { placeId: 'YOUR_WORK_PLACE_ID',  location: {"lat": 0, "lng": 0 } },  // Optional: location speeds up initial map render
          destination: { placeId: 'YOUR_HOME_PLACE_ID',  location: {"lat": 0, "lng": 0 } },
        },
        // Add more routes here — the UI is fully data-driven from this array.
        // {
        //   name: 'Gym', color: '#EA4335', emoji: '💪',
        //   origin:      { placeId: 'YOUR_WORK_PLACE_ID', location: { lat: 0, lng: 0 } },
        //   destination: { placeId: 'YOUR_GYM_PLACE_ID',  location: { lat: 0, lng: 0 } },
        // },
      ],
    },
    // Add more categories below. Example:
    // {
    //   name: 'Morning Commute',
    //   routes: [
    //     {
    //       name: 'Home → Work', color: '#4285F4', emoji: '🏢',
    //       origin:      { placeId: 'YOUR_HOME_PLACE_ID', location: { lat: 0, lng: 0 } },
    //       destination: { placeId: 'YOUR_WORK_PLACE_ID', location: { lat: 0, lng: 0 } },
    //     },
    //   ],
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
