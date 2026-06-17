# Change Log

## 1.0.0 - 2026-06-17

### Release

- First stable release after the API, cache, frontend, and test modernization.
- This release contains breaking changes and intentionally does not preserve the
  old `/api.v1` API surface.

### API

- Replaced `/api.v1` with `/api/v1`.
- Removed unrelated/testing APIs: random file selector, Wallhaven selector,
  GitLab webhook handler, static resource/package search helpers, and `/login`.
- Added `GET /api/v1/health` and root `GET /health`.
- Added `GET /api/v1/routes` and `GET /api/v1/openapi.json` for lightweight API
  discovery.
- Added `GET /api/v1/cache/fetch-relay` and
  `DELETE /api/v1/cache/fetch-relay` cache management endpoints.

### Tile Relay Cache

- Replaced permanent cache reads with TTL-based cache metadata.
- Added `HIT`, `MISS`, `REVALIDATED`, `STALE`, and `BYPASS` cache status
  headers.
- Added conditional upstream revalidation with `ETag` and `Last-Modified`
  headers when available.
- Prevented failed, undersized, or non-tile upstream responses from being
  cached.
- Added atomic cache writes through temporary files and metadata sidecars.
- Tightened the upstream whitelist to exact hosts and tile paths.

### Frontend

- Migrated the map UI to Vite 8.
- Added npm-managed `leaflet` and `@amap/amap-jsapi-loader`.
- Replaced CDN/time-stamped script and style tags with module imports and
  hashed build output.
- Split map code into focused modules under `src/`.
- Removed duplicated `map.html` and unrelated static HTML/text/binary assets.
- Removed browser-side PouchDB tile caching so cache freshness is centralized in
  the backend.

### Dependencies and Tests

- Removed dependencies tied to deleted utility scripts: Directus SDK, dayjs,
  ExcelJS, lowdb, Meilisearch, MiniSearch, and p-queue.
- Removed old offline task scripts and JSON DB/random selector utilities.
- Added `npm test` using Node's native test runner.
- Added tests for relay cache freshness, stale fallback, failed-response cache
  rejection, cache bypass, and relay whitelist rules.

## 2026-06-17 - Modernization Baseline

### Dependency Management

- Migrated dependency management from Yarn to npm.
- Removed `yarn.lock`.
- Added `package-lock.json`.
- Updated PM2 watch configuration to track `package-lock.json`.
- Raised engine baseline to Node.js >= 22.13 and npm >= 10.

### Dependency Upgrades

- Upgraded runtime dependencies to current stable releases, including:
  - `express@5.2.1`
  - `@directus/sdk@22.0.0`
  - `axios@1.18.0`
  - `cron@4.4.0`
  - `glob@13.0.6`
  - `meilisearch@0.58.0`
  - `minisearch@7.2.0`
- Removed unused legacy build-chain dependencies.
- Added npm `overrides` to keep `exceljs` transitive dependencies on audited
  safe versions.

### Map UI

- Upgraded AMap from JSAPI 1.4.15 to JSAPI 2.0.
- Standardized Leaflet at 1.9.4.
- Upgraded PouchDB CDN usage to 9.0.0.
- Removed the unused jQuery CDN.
- Unified `map.html` and `index.html` around the shared `index.js` and
  `style.css` map implementation.
- Refined the search panel and floating map controls.

### Server Compatibility

- Replaced `body-parser` usage with Express built-in parsers.
- Updated CORS import for ESM compatibility.
- Migrated `glob` usage to v13 APIs.
- Updated cron jobs to `CronJob.from(...)`.
- Updated `rotating-file-stream` import to named `createStream`.
- Fixed asynchronous cron module loading.

### Verification

- `npm outdated --json` returns no outdated dependencies.
- `npm audit --omit=dev --registry=https://registry.npmjs.org --json` reports
  zero vulnerabilities.
- Browser verification on `/map.html` confirmed Leaflet 1.9.4, AMap JSAPI 2.0,
  loaded tiles, marker, and no console errors.
