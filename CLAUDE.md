# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**After Work Routes** is a mobile-first static web app that shows real-time driving times from a work address to multiple destinations (home, gym, friends). It uses the Google Maps JavaScript API and the Google Routes API v2 for traffic-aware routing.

**No build system.** No npm, no TypeScript, no bundler. The `public/` folder is served as-is by Firebase Hosting.

## Deployment

```bash
firebase deploy
```

The Firebase project is `mapsfrontend` (see `.firebaserc`). The `public/` directory is the hosting root.

## Required Setup (Before Deploying)

Two files need real values before the app works:

1. **`public/index.html`** — Replace `YOUR_GOOGLE_MAPS_API_KEY` in the Maps script tag. Required Google Cloud APIs: Maps JavaScript API + Routes API.
2. **`public/app.js`** — Update the `CONFIG` object at the top with Google Maps Place IDs for `originPlaceId` and each destination's `placeId`. Find Place IDs via the [Place ID Finder](https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder).

## Architecture

All application logic lives in three files:

- **`public/index.html`** — Minimal shell. Cards container is empty on load; `app.js` populates it. The Maps script tag uses `callback=initMap` to bootstrap the app.
- **`public/app.js`** — Everything: config, state, and all functions. Entry point is `initMap()` (called by Maps SDK). Key flow: `initMap` → `buildCards` + `loadAllRoutes` → `placeMarkers` + card updates.
- **`public/styles.css`** — Mobile-first, uses CSS custom properties `--header-h` and `--cards-h` for layout math, and `100dvh` for mobile browser chrome handling.

### State (global vars in `app.js`)

| Variable | Purpose |
|---|---|
| `map` | Google Maps instance |
| `polylines[]` | One `Polyline` per destination, indexed by `CONFIG.destinations` order |
| `routeResults[]` | Cached route data (`null` = error, `undefined` = pending) |
| `originMarker` / `destMarkers[]` | Map markers |
| `activeIndex` | Which card is selected (`-1` = all shown) |

### Routes API Call

`loadAllRoutes()` fires parallel `fetch` calls to `https://routes.googleapis.com/directions/v2:computeRoutes` (POST). The API key is extracted at runtime from the Maps script tag's `src` URL — this is intentional so it doesn't need to be duplicated.

All fetches run in parallel; `onSettled()` is a counter-based callback that triggers final map fitting and marker placement only after all destinations settle (success or error).

### Card Interaction

Tapping a card calls `selectCard(index)`. Tapping the active card again resets to showing all routes. This toggles `.active`/`.dimmed` CSS classes and adjusts `strokeOpacity`/`strokeWeight` on the polylines.

## Extending Destinations

Add a new entry to `CONFIG.destinations` in `app.js`:
```js
{ name: 'Label', placeId: 'ChIJ...', color: '#HEXCOL', emoji: '🏷️' }
```
No other changes needed — card UI and route loading are fully data-driven from this array.
