# Architecture Overview

## Entry Points

- `service/index.js` creates the Express app, mounts middleware, serves static
  files, registers APIs, and starts cron jobs.
- `service/app/index.html` and `service/app/map.html` serve the browser map UI.
- `service/app/index.js` owns Leaflet layer setup, AMap search/geolocation, and
  map controls.

## Main Modules

- `service/bin/simpleApi.js` registers API route definitions under `/api.v1`
  and root-level utility routes.
- `service/bin/service.js` contains service-layer operations used by API
  handlers.
- `service/bin/middleware/fetchRelay/index.js` relays and caches whitelisted
  upstream map resources.
- `service/bin/whitelist.js` limits relay targets to known map providers.
- `service/bin/cronJob/` contains scheduled maintenance jobs.

## Static File Layout

```text
service/app/       Browser UI files
dist/              Served static resource directory
.cache/fetchRelay/ Relay cache
log/               Runtime logs
```

## Current Map Stack

- AMap JSAPI 2.0 for search, geolocation, and coordinate conversion.
- Leaflet 1.9.4 for map rendering and layer controls.
- PouchDB 9.0.0 for optional browser-side tile caching support.

## API Direction

The API surface should stay versioned and explicit. New endpoints should be
added under `/api.v1` with:

- a clear route path,
- method restrictions,
- input validation,
- consistent JSON responses,
- documented behavior in `docs/api.md`.
