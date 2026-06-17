# map-service

`map-service` is a small Node.js map service. It serves a Vite-built Leaflet +
AMap browser app, exposes a versioned API under `/api/v1`, and relays selected
map tile requests through a freshness-aware local cache.

## Requirements

- Node.js >= 22.13
- npm >= 10

Dependency management uses npm only. Keep `package-lock.json` committed and do
not reintroduce `yarn.lock`.

## Quick Start

```bash
npm install
npm run build
npm run exec
```

Default service URL:

```text
http://127.0.0.1:3088
```

Useful pages and endpoints:

- `GET /` - Vite-built map app.
- `GET /?view=admin` - management console.
- `GET /api/v1/health` - health check.
- `GET /api/v1/tiles/relay?url=...` - whitelisted tile relay with cache.
- `GET /api/v1/cache/fetch-relay` - cache stats.

Default local admin credentials are `admin` / `admin`. Configure
`MAP_SERVICE_ADMIN_USERNAME`, `MAP_SERVICE_ADMIN_PASSWORD`, and
`MAP_SERVICE_ADMIN_TOKEN_SECRET` before using the console outside local
development.

## Development

```bash
npm run dev
npm test
npm run check
npm run build
```

## Documentation

- [Development Guide](docs/development.md)
- [Architecture Overview](docs/architecture.md)
- [API Reference](docs/api.md)
- [Requirements](docs/requirements/README.md)
- [Change Log](docs/changelog.md)
