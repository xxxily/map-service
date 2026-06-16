# API Reference

Base URL:

```text
/api.v1
```

## Health

### `GET /check`

Returns a minimal process health response.

```json
{
  "code": 0,
  "result": {
    "msg": "ok"
  },
  "error": null
}
```

## Service Metadata

### `GET /api.v1/service-config`

Returns current static service configuration.

This endpoint currently exposes internal paths and should not be exposed to
untrusted networks without review.

## Static Resource Helpers

### `GET /api.v1/resource-list`

Lists files under the configured static directory.

### `GET /api.v1/has-resource-file?filename=<name>`

Checks whether a static resource exists.

### `GET /api.v1/search-package-file`

Searches historical frontend package records from the static log.

### `GET /api.v1/get-latest-package-file`

Returns the latest matching package record or redirects to it when requested.

## Tile Relay

### `GET /api.v1/fetchRelay?url=<encoded-url>`

Fetches a whitelisted upstream URL and caches successful responses locally.

Current whitelisted providers:

- `google.com`
- `autonavi.com`

Current query parameters:

- `url` - required, URL-encoded upstream resource URL.
- `useProxy` - optional boolean; when true, uses the configured local proxy.
- `noCache` - optional boolean; when true, bypasses the local cache.

Known follow-up work:

- cache freshness currently needs stronger revalidation semantics,
- failed upstream responses must not be cached,
- cache purge/revalidate controls should be documented after implementation.

## Legacy / Review Required

The following endpoints came from earlier utility/testing work and should be
reviewed before expanding the public API:

- `GET /api.v1/random-file-selector`
- `GET /api.v1/random-wallhaven-wallpapers`
- `ALL /api.v1/do1-gitlab-webhook`
- `ALL /login`

They are candidates for removal or isolation from the public API surface.
