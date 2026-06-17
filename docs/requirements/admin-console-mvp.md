# Admin Console MVP

## Background

map-service has completed its first modernization pass: dependency management
uses npm, the frontend is Vite based, and the tile relay cache is served through
structured `/api/v1` endpoints. The next step is an operations console that
turns the service from a passive tile proxy into a manageable system.

## Goals

- Provide a clear admin entry from the map page.
- Protect management functions behind login.
- Let operators inspect application version, runtime, cache state, and traffic.
- Let operators configure the upstream tile proxy without code changes.
- Let operators submit bounded pre-cache jobs for map areas and zoom ranges.
- Establish a requirements document home for future system planning.

## Users

- Operator: deploys and maintains map-service, checks health and traffic, clears
  or warms cache, and changes proxy settings.
- Developer: extends new API modules and admin pages without touching unrelated
  map rendering code.

## Scope

### In Scope For This MVP

- Add a management icon on the map tool menu.
- Add an admin login view in the existing Vite app.
- Add a dashboard view after login.
- Show package version, Node version, uptime, process id, and server time.
- Show tile cache totals, freshness distribution, provider counts, and recent
  entries.
- Show access log summary, status-code distribution, top paths, and recent
  requests.
- Allow runtime proxy enable/disable plus host, port, protocol, and optional
  credentials.
- Add pre-cache task creation with bounds, zoom range, provider, and concurrency
  controls.
- Track pre-cache task status, progress, success/failure counts, and recent
  errors.
- Persist admin settings and task snapshots under the service data directory.
- Protect all admin APIs with bearer-token authentication.

### Out Of Scope For This MVP

- Multi-user role based access control.
- Database-backed durable task queue.
- Distributed workers.
- Fine-grained audit log.
- Visual polygon drawing and arbitrary shape clipping.
- Push notifications or websocket progress updates.

These are roadmap items and should be designed after the MVP validates the
operational workflow.

## Functional Requirements

### F1. Admin Entry

The map page exposes a compact management icon in the existing tool menu. The
icon opens `?view=admin` in the same application.

### F2. Authentication

Operators log in with configured credentials. The backend returns a signed
bearer token with an expiry. The frontend stores the token locally and attaches
it to admin API calls. Logout removes local credentials.

Default development credentials may exist for local startup, but deployment
documentation must point operators to environment variables:

- `MAP_SERVICE_ADMIN_USERNAME`
- `MAP_SERVICE_ADMIN_PASSWORD`
- `MAP_SERVICE_ADMIN_TOKEN_SECRET`

### F3. System Overview

The dashboard shows:

- package name and version
- Node.js version
- process id
- uptime
- server time
- environment
- service base path

### F4. Cache Operations

The dashboard shows cache totals and allows clearing the complete tile relay
cache. A future iteration can add single-entry clearing from the recent-entry
table.

### F5. Access Statistics

The dashboard parses recent visit logs and shows:

- total parsed requests
- status-code groups
- top requested paths
- recent requests with method, path, status, and user agent

Log parsing must be best-effort. Invalid lines are ignored rather than failing
the admin dashboard.

### F6. Proxy Settings

Operators can configure the proxy used for upstream tile requests:

- enabled
- protocol: `http` or `https`
- host
- port
- optional username/password

The tile relay and pre-cache jobs use these settings when proxy is enabled.
Request query `useProxy` remains supported for direct tile relay debugging, but
runtime settings are the authoritative admin path.

### F7. Pre-Cache Jobs

Operators can submit a bounded pre-cache job:

- provider from a safe internal tile provider catalog
- west, south, east, north bounds
- min zoom and max zoom
- refresh existing cache or only fill missing/expired entries
- concurrency limit

The backend expands the bounds into Web Mercator tile coordinates and fetches
each generated tile through the existing relay cache pipeline. The task status
is queryable and persisted as a snapshot so the dashboard can recover after a
process restart.

## Non-Functional Requirements

- Admin endpoints must not be public; every endpoint under `/api/v1/admin`
  except login requires a bearer token.
- Credentials and token secrets must not be returned by settings APIs.
- Bounds, zoom levels, provider names, and proxy values must be validated.
- Pre-cache jobs must have a maximum tile count guard to prevent accidental
  large downloads.
- Upstream non-2xx tile responses must not be cached.
- Frontend admin UI should be operational and dense, not marketing oriented.
- Tests should cover auth, settings persistence, proxy config propagation, and
  pre-cache coordinate planning.

## API Design

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/admin/auth/login` | Login and receive bearer token |
| `POST` | `/api/v1/admin/auth/logout` | Frontend logout no-op endpoint |
| `GET` | `/api/v1/admin/session` | Validate current token |
| `GET` | `/api/v1/admin/system` | Runtime and version overview |
| `GET` | `/api/v1/admin/cache` | Tile cache stats |
| `DELETE` | `/api/v1/admin/cache` | Clear tile cache |
| `GET` | `/api/v1/admin/visits` | Access statistics |
| `GET` | `/api/v1/admin/settings` | Read sanitized admin settings |
| `PUT` | `/api/v1/admin/settings` | Update runtime settings |
| `GET` | `/api/v1/admin/precache/providers` | List supported tile providers |
| `GET` | `/api/v1/admin/precache/tasks` | List pre-cache tasks |
| `POST` | `/api/v1/admin/precache/tasks` | Create pre-cache task |

## Data Model

Runtime admin data is stored under `.db/admin/`:

- `settings.json`: proxy and future admin settings.
- `precache-tasks.json`: recent task snapshots.

The `.db` directory is intentionally runtime state and should not be committed.

## Acceptance Criteria

- Map page management icon opens the admin view.
- Unauthenticated admin dashboard access shows login.
- Successful login opens dashboard and loads all admin panels.
- Dashboard displays current application version from `package.json`.
- Cache panel shows stats from the tile relay cache.
- Clearing cache through admin API removes cache entries.
- Access panel tolerates missing logs and shows stats when logs exist.
- Proxy settings can be saved and are used by backend tile fetches.
- Pre-cache task API rejects invalid or oversized requests.
- Valid pre-cache jobs are persisted and expose progress.
- `npm run check`, `npm test`, and `npm run build` pass.

## Roadmap

- Replace single admin password with user and role management.
- Add task cancellation, retry policy controls, and worker-level observability.
- Add interactive rectangle/polygon drawing in the admin map.
- Add OpenAPI schema details for request and response bodies.
- Add audit trail for sensitive admin operations.
- Add optional websocket or server-sent events for live task progress.
