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

## Removed APIs

The old utility/testing APIs were removed during the API cleanup:

- random local file selector
- Wallhaven wallpaper selector
- GitLab webhook handler
- static resource/package search endpoints
- `/login`

New APIs should be added under `/api/v1`, registered in
`service/bin/simpleApi.js`, and documented here.
