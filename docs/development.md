# Development Guide

## Package Management

Use npm for all dependency work.

```bash
npm install
npm install <package>
npm uninstall <package>
```

Do not use Yarn in this project. `yarn.lock` was removed during the 2026
modernization pass and `package-lock.json` is the source of truth.

## Runtime

The backend is an ESM Node.js application.

```bash
npm run exec
npm start
```

Admin credentials are configured through environment variables:

```bash
MAP_SERVICE_ADMIN_USERNAME=admin
MAP_SERVICE_ADMIN_PASSWORD=change-me
MAP_SERVICE_ADMIN_TOKEN_SECRET=change-me-too
```

Local development has `admin` / `admin` defaults so the console can run without
extra setup. Do not expose those defaults in a shared environment.

Scripts:

- `npm run dev` - run the Vite dev server for frontend development.
- `npm run build` - build the frontend into `service/app/`.
- `npm run exec` - run `service/index.js` directly.
- `npm start` - run the service through nodemon.
- `npm run check` - syntax-check backend, Vite config, and frontend modules.
- `npm test` - run Node native tests.
- `npm run pm2-start` - start with PM2 using `pm2.config.js`.

## Frontend Workflow

Edit source files under `src/` and root `index.html`.

Do not hand-edit generated files under `service/app/`; rebuild them instead:

```bash
npm run build
```

The production service serves the generated `service/app/index.html` at `/`.
The management console is the same Vite app and is opened with `/?view=admin`.

## Requirements Workflow

Larger product or system changes should start with a focused document under
`docs/requirements/`. Keep the document close to implementation and update the
acceptance criteria when scope changes.

## Verification Checklist

Before committing service changes, run:

```bash
npm install
npm run check
npm test
npm run build
npm outdated --json
npm audit --omit=dev --registry=https://registry.npmjs.org --json
```

For map UI changes, also verify:

- `GET /` returns the generated map app.
- Browser console has no script errors.
- Leaflet loads, a marker is visible, and map tiles load through
  `/api/v1/tiles/relay`.

## Local State

Local runtime files are intentionally ignored:

- `.cache/`
- `.db/`
- `log/`
- `logs/`
- `.omx/`
- `.playwright-cli/`
