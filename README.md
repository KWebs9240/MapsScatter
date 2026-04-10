# After Work Routes

A mobile-first web app that shows live, traffic-aware travel times from your work address to your most common after-work destinations — all at a glance on one screen.

Built with the Google Maps Directions API and hosted on Firebase Hosting.

## What it does

- Fetches live driving times (with current traffic) to Home, Gym, and Friends simultaneously
- Shows each destination as a card with travel time, estimated arrival, and distance
- Displays all three color-coded routes on a map
- Tap a card to highlight that route and zoom the map to it; tap again to see all routes
- Auto-refreshes every 5 minutes; manual refresh button in the header

## Setup

### Prerequisites

- [Node.js](https://nodejs.org) (for the Firebase CLI)
- A [Google Cloud](https://console.cloud.google.com) account
- A [Firebase](https://console.firebase.google.com) project with Hosting enabled

---

### Todo

- [ ] **Fill in your addresses** in `public/app.js` at the top of the file:
  ```js
  origin: 'YOUR WORK ADDRESS',

  destinations: [
    { name: 'Home',    address: 'YOUR HOME ADDRESS',    ... },
    { name: 'Gym',     address: 'YOUR GYM ADDRESS',     ... },
    { name: 'Friends', address: 'YOUR FRIENDS ADDRESS', ... },
  ]
  ```

- [ ] **Create a Google Maps API key**
  1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
  2. Click **Create Credentials** → API Key
  3. Enable both of these APIs on your project:
     - Maps JavaScript API
     - Directions API
  4. Restrict the key to your Firebase domain (e.g. `your-project.web.app`) to prevent unauthorized use

- [ ] **Add the API key to `public/index.html`** — find this line near the bottom and replace the placeholder:
  ```html
  <script async
    src="https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY&callback=initMap">
  </script>
  ```

---

## Local Development

There's no build step — open the files directly or use any static file server.

**Option 1: Firebase emulator (recommended)**
```bash
# Install the Firebase CLI (once)
npm install

npx firebase serve
```
App runs at `http://localhost:5000`.

**Option 2: Any static server**
```bash
# Python
python -m http.server 8080 --directory public

# Node (npx, no install needed)
npx serve public
```

> **Note:** The Google Maps API key must be set in `public/index.html` before the app will load. The `localhost` origin needs to be added to the API key's allowed HTTP referrers in Google Cloud Console if you've restricted it.

---

## Deploying to Firebase Hosting

```bash
# Install the Firebase CLI (once)
npm install -g firebase-tools

# Log in to Firebase
firebase login

# Connect to your Firebase project (run from repo root)
firebase use --add

# Deploy
firebase deploy
```

Your app will be live at `https://your-project.web.app`.

## Project structure

```
MapsScatter/
├── firebase.json       # Firebase Hosting configuration
├── .firebaserc         # Firebase project ID
└── public/
    ├── index.html      # App shell and Google Maps script tag
    ├── styles.css      # Mobile-first layout and card styles
    └── app.js          # CONFIG addresses + all app logic
```
