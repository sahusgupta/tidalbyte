# Simulator frontend

The charcoal map work surface preserves the simulator's preset, scenario, playback,
pin, vehicle, hospital, impact and API flows. Storm controls, impact/routing and map
layers open on demand. On phones these are keyboard-accessible dialogs; Escape
closes them and restores focus. Camera zoom, view angle, north and reset controls
operate on the existing map.

From this directory:

```powershell
npm ci
$env:AQUAGRID_API = 'http://127.0.0.1:8001'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174
```

`npm run dev` also starts Vite, with the API defaulting to `http://127.0.0.1:8000`.
The frontend needs a running simulator API with a prepared region. It does not
generate sample predictions when data are missing. See [the simulator setup](../README.md).
An unavailable API and a connected API with no built regions have distinct states.

`npm run typecheck` and `npm run build` check the frontend. Deployment must retain
the `/api` reverse proxy; the Vite development proxy is not part of the static build.

The build/dev plugin copies the already bundled Houston USGS display archives and
their provenance from `apps/web/public/map`, and the MapLibre worker from the
installed version. Source Sans 3 is pinned and bundled with its OFL license. Keep
the full repository when building; generated `public/map`, `public/maplibre` and
`public/fonts` files are ignored. Opening imagery, fonts and workers are local.
Optional USGS detail starts at zoom 16 and is not cached by this application.
The archive is a 2017–2021 visual reference, not current conditions or model input.
