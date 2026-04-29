const { onSchedule }  = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore }  = require('firebase-admin/firestore');

initializeApp();

const MAPS_API_KEY = defineSecret('MAPS_API_KEY');

// Mirror of public/config.js — keep place IDs in sync if routes change.
const CATEGORIES = [
  {
    name: 'After Work',
    routes: [
      { name: 'The Apt',     origin: { placeId: 'ChIJZ2w2FseCToYRGzso_Erkmh0' }, destination: { placeId: 'ChIJu75pRICfToYRdmLWE1YKJOQ' } },
      { name: 'Honey Butt', origin: { placeId: 'ChIJZ2w2FseCToYRGzso_Erkmh0' }, destination: { placeId: 'ChIJC9EwSwwfTIYRcBAA2TAZSOo' } },
      // { name: 'Kwebby',     origin: { placeId: 'ChIJu75pRICfToYRdmLWE1YKJOQ' }, destination: { placeId: 'ChIJC9EwSwwfTIYRcBAA2TAZSOo' } },
    ],
  },
  // {
  //   name: 'Morning Commute',
  //   routes: [
  //     { name: 'The Apt',     origin: { placeId: 'ChIJu75pRICfToYRdmLWE1YKJOQ' }, destination: { placeId: 'ChIJZ2w2FseCToYRGzso_Erkmh0' } },
  //     { name: 'Honey Butt', origin: { placeId: 'ChIJC9EwSwwfTIYRcBAA2TAZSOo' }, destination: { placeId: 'ChIJZ2w2FseCToYRGzso_Erkmh0' } },
  //   ],
  // },
];

const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.legs.startLocation',
  'routes.legs.endLocation',
].join(',');

async function fetchRoute(apiKey, origin, destination, name) {
  const res = await fetch(ROUTES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      origin:            { placeId: origin.placeId },
      destination:       { placeId: destination.placeId },
      travelMode:        'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      routeModifiers:    { avoidTolls: true },
    }),
  });

  const data = await res.json();

  if (!data.routes || data.routes.length === 0) {
    console.error(`No routes returned for "${name}":`, data.error ?? data);
    return null;
  }

  const route = data.routes[0];
  const leg   = route.legs[0];

  return {
    duration:        parseInt(route.duration, 10),
    distanceMeters:  route.distanceMeters,
    encodedPolyline: route.polyline.encodedPolyline,
    startLat:        leg.startLocation.latLng.latitude,
    startLng:        leg.startLocation.latLng.longitude,
    endLat:          leg.endLocation.latLng.latitude,
    endLng:          leg.endLocation.latLng.longitude,
  };
}

// Runs every 15 minutes from 1 PM to 10 PM Central Time.
// Cloud Scheduler evaluates the cron in America/Chicago, so no UTC math needed.
exports.refreshRouteCache = onSchedule(
  {
    schedule: '*/15 13-22 * * *',
    timeZone: 'America/Chicago',
    secrets:  [MAPS_API_KEY],
  },
  async () => {
    console.log('refreshRouteCache started');

    let db;
    try {
      db = getFirestore();
      console.log('Firestore initialized');
    } catch (err) {
      console.error('Failed to initialize Firestore:', err);
      throw err;
    }

    let apiKey;
    try {
      apiKey = MAPS_API_KEY.value();
      console.log('API key retrieved, length:', apiKey?.length ?? 0);
    } catch (err) {
      console.error('Failed to retrieve MAPS_API_KEY secret:', err);
      throw err;
    }

    await Promise.all(
      CATEGORIES.map(async (category) => {
        const slug = category.name.toLowerCase().replace(/\s+/g, '_');
        console.log(`Processing category "${category.name}" (slug: "${slug}")`);

        const routes = await Promise.all(
          category.routes.map(r =>
            fetchRoute(apiKey, r.origin, r.destination, r.name).catch(err => {
              console.error(`Fetch error for "${r.name}":`, err);
              return null;
            })
          )
        );

        const ok = routes.filter(Boolean).length;
        console.log(`${category.name}: fetched ${ok}/${routes.length} routes, writing to Firestore...`);

        const ts  = Date.now();
        const ref = db.collection('routeHistory').doc(slug).collection('entries');
        console.log(`Firestore path: routeHistory/${slug}/entries`);

        try {
          await ref.add({
            timestamp: ts,
            payload:   JSON.stringify({ timestamp: ts, routes }),
          });
          console.log(`${category.name}: Firestore write succeeded`);
        } catch (err) {
          console.error(`${category.name}: Firestore write failed — code: ${err.code}, message: ${err.message}`);
          throw err;
        }
      })
    );

    console.log('refreshRouteCache completed');
  }
);
