# map-service

`map-service` is a small Node.js static map service. It serves the map UI from
`service/app`, exposes a versioned API under `/api.v1`, and relays selected map
tile requests through a local cache.

## Requirements

- Node.js >= 22.13
- npm >= 10

Dependency management uses npm only. Keep `package-lock.json` committed and do
not reintroduce `yarn.lock`.

## Quick Start

```bash
npm install
npm run exec
```

Default service URL:

```text
http://127.0.0.1:3088
```

Useful pages and endpoints:

- `GET /map.html` - Leaflet + AMap mixed map page
- `GET /check` - health check
- `GET /api.v1/fetchRelay?url=...` - whitelisted tile relay with cache

## Documentation

- [Development Guide](docs/development.md)
- [Architecture Overview](docs/architecture.md)
- [API Reference](docs/api.md)
- [Change Log](docs/changelog.md)

## Verification

```bash
npm run check
npm outdated --json
npm audit --omit=dev --registry=https://registry.npmjs.org --json
```
