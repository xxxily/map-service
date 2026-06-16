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

The service is an ESM Node.js application.

```bash
npm run exec
npm start
```

Scripts:

- `npm run exec` - run `service/index.js` directly.
- `npm start` - run the service through nodemon.
- `npm run check` - syntax-check the service entrypoint.
- `npm run pm2-start` - start with PM2 using `pm2.config.js`.

## Verification Checklist

Before committing service changes, run:

```bash
npm install
npm run check
npm outdated --json
npm audit --omit=dev --registry=https://registry.npmjs.org --json
```

For map UI changes, also verify:

- `GET /map.html` returns 200.
- Browser console has no script errors.
- Leaflet loads, a marker is visible, and map tiles load.

## Local State

Local runtime files are intentionally ignored:

- `.cache/`
- `.db/`
- `log/`
- `logs/`
- `.omx/`
- `.playwright-cli/`
