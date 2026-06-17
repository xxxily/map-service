# API Reference

Base URL:

```text
/api/v1
```

All JSON endpoints use the shared response envelope:

```json
{
  "code": 0,
  "result": {},
  "error": null
}
```

Errors use `code: -1` and place details under `error.message`.

## System

### `GET /api/v1/health`

Returns process health.

### `GET /health`

Root-level health check for simple load balancer probes.

### `GET /api/v1/routes`

Returns the registered API route catalog.

### `GET /api/v1/openapi.json`

Returns a lightweight OpenAPI 3.1 document generated from the registered route
metadata.

## Tile Relay

### `GET /api/v1/tiles/relay?url=<encoded-url>`

Fetches a whitelisted upstream map tile URL through the service cache.

Allowed upstreams:

- `https://www.google.com/maps/vt`
- `https://www.google.cn/maps/vt`
- `https://webst01.is.autonavi.com/appmaptile` through `webst04`
- `https://webrd01.is.autonavi.com/appmaptile` through `webrd04`

Query parameters:

- `url` - required, URL-encoded upstream tile URL.
- `refresh=true` - bypasses a stale/fresh read and updates cache from upstream.
- `noCache=true` - alias for `refresh=true`.
- `cache=false` - streams upstream response without writing local cache.
- `useProxy=true` - uses the configured local proxy for upstream requests.

Response headers:

- `X-Cache: MISS` - fetched upstream and wrote a new cache file.
- `X-Cache: HIT` - served a fresh cache file.
- `X-Cache: REVALIDATED` - upstream returned `304`, metadata TTL was extended.
- `X-Cache: STALE` - upstream refresh failed, served cache within stale window.
- `X-Cache: BYPASS` - cache was disabled for this request.

Cache policy:

- Only `2xx` upstream responses are cacheable.
- Empty or undersized responses are rejected and not cached.
- Responses with non-tile content types are rejected and not cached.
- Cache files are written atomically through a temporary file and renamed only
  after validation.
- Metadata is stored beside each tile as `<cache-file>.meta.json`.
- Fresh cache TTL defaults to 6 hours.
- Stale fallback window defaults to 30 days.

## Cache Management

### `GET /api/v1/cache/fetch-relay`

Returns cache stats, provider counts, and up to 100 recent entries.

### `DELETE /api/v1/cache/fetch-relay`

Clears the full tile relay cache.

### `DELETE /api/v1/cache/fetch-relay?url=<encoded-url>`

Clears a single whitelisted tile cache entry.

## Admin

Admin endpoints are grouped under `/api/v1/admin`. Except for login, every
admin endpoint requires:

```text
Authorization: Bearer <token>
```

Configure credentials through environment variables:

- `MAP_SERVICE_ADMIN_USERNAME`
- `MAP_SERVICE_ADMIN_PASSWORD`
- `MAP_SERVICE_ADMIN_TOKEN_SECRET`

Development defaults are `admin` / `admin`. Override them before exposing the
service outside a local environment.

### `POST /api/v1/admin/auth/login`

Request:

```json
{
  "username": "admin",
  "password": "admin"
}
```

Returns a bearer token, expiry timestamp, and public user info.

### `POST /api/v1/admin/auth/logout`

Validates the current token and returns `status: ok`. Token removal is handled
client-side.

### `GET /api/v1/admin/session`

Validates the current token and returns username plus token timestamps.

### `GET /api/v1/admin/system`

Returns package name/version, Node.js version, process id, uptime,
environment, server time, and API base path.

### `GET /api/v1/admin/cache`

Returns tile relay cache stats. This is the authenticated equivalent of
`GET /api/v1/cache/fetch-relay`.

### `DELETE /api/v1/admin/cache`

Clears the full tile relay cache.

### `DELETE /api/v1/admin/cache?url=<encoded-url>`

Clears one whitelisted tile cache entry.

### `GET /api/v1/admin/visits`

Returns best-effort access statistics parsed from
`log/visitRecorder/access.log`, including status-code counts, top paths, and
recent requests.

### `GET /api/v1/admin/settings`

Returns sanitized runtime settings. Proxy passwords are never returned; the
response uses `hasPassword` instead.

### `PUT /api/v1/admin/settings`

Updates runtime settings.

```json
{
  "proxy": {
    "enabled": true,
    "protocol": "http",
    "host": "127.0.0.1",
    "port": 10809,
    "username": "",
    "password": ""
  }
}
```

When enabled, these proxy settings are used by tile relay upstream requests and
pre-cache jobs.

### `GET /api/v1/admin/precache/providers`

Returns the supported internal tile provider catalog for pre-cache jobs.

### `GET /api/v1/admin/precache/tasks`

Returns recent pre-cache task snapshots.

### `POST /api/v1/admin/precache/tasks`

Creates a bounded pre-cache task.

```json
{
  "providerId": "amap-road",
  "bounds": {
    "west": 113.24,
    "south": 23.11,
    "east": 113.29,
    "north": 23.15
  },
  "minZoom": 12,
  "maxZoom": 12,
  "concurrency": 4,
  "refresh": false
}
```

Requests are rejected when bounds are invalid, zoom levels are outside the
provider range, or the expanded tile count exceeds the configured maximum.

## Removed APIs

The old utility/testing APIs were removed during the API cleanup:

- random local file selector
- Wallhaven wallpaper selector
- GitLab webhook handler
- static resource/package search endpoints
- `/login`

New APIs should be added under `/api/v1`, registered in
`service/bin/simpleApi.js`, and documented here.
