# Change Log

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
