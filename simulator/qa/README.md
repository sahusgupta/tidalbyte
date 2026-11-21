# Study-zone browser checks

This opt-in end-to-end check uses the **real integrated services and prepared region
models**. It does not mock API responses, build datasets, or download geodata.
Run the integrated stack from the repository root first, then from this directory:

```powershell
npm ci
npm run verify
```

The default target is atlas `http://127.0.0.1:5173/` and simulator/proxy
`http://127.0.0.1:5174/`. All five Houston regions must advertise `built: true`,
including Downtown/Buffalo Bayou, Medical Center/Brays, Meyerland,
Ship Channel/Pasadena and Kingwood/Lake Houston.
An unprepared region fails immediately; a fallback region cannot pass.

The harness uses installed Windows Chrome when available. Otherwise install
Playwright Chromium with `npx playwright install chromium`, or set `QA_CHROME_PATH`
to an existing Chrome executable. Node 20+ is required. Dependencies are pinned in
the package lock; this package is separate from production frontend dependencies.

For each region, desktop (1440×900) and **emulated touch** (390×844) runs navigate
the product landing page via **Open EarthLab**, then the Houston area chooser. The checks require the region heading,
iframe zone, road and building datasets, and simulation endpoint to match the requested region,
with no fallback notice. A WebGL probe requires the building layer to draw extruded
walls in the selected region. The checks select a storm through the UI, play it, and require
different hashes of the returned road/building depth arrays across playback frames.
They then choose a mild preset, select a destination and vehicle, and click/tap an
in-bounds starting pin in the actual region camera view (zooming out if needed). A passing route has
multiple vertices, length above 100 m, a non-blocked model status, and visible From/To
information. This validates software behavior, **not road safety or live services**.

The reviewed road points, exact destination IDs and mild routing presets are in
`verified-pins.json`. A missing destination or changed invalid route fails with a
clear message; the harness never silently substitutes a different hospital. To
revalidate changed source data, set `QA_PINS_FILE` to a reviewed JSON file keyed by
region ID, with `lonlat`, `hospitalId`, `vehicle`, `routePreset`, optional
`stormPreset`, and `hospitalProvenance`. Provenance is recorded alongside the API's
own hospital note; identity/address checks do not establish live operational status.

Useful options (environment variables):

- `QA_ZONES=meyerland` to check a ready subset while other datasets build.
- `QA_VIEWPORTS=desktop` or `mobile` to run one input mode.
- `QA_ATLAS_URL`, `QA_SIMULATOR_URL` to change the integrated service origins.
- `QA_OUTPUT_DIR` to select the results/capture directory; default is a new TEMP folder.
- `QA_HEADED=1` for an interactive browser diagnostic.
- `QA_SOFTWARE_GL=1` to force SwiftShader on headless CI. Local runs keep the
  browser's hardware/default ANGLE path; the observed renderer is recorded.
- `QA_ALLOW_REMOTE=1` to allow remote providers; by default only the integrated origins
  are permitted, exercising the bundled imagery path.

Screenshots and compact `results.json` stay outside Git by default. Captures prove
the observed rendering; response fingerprints prove model outputs changed rather
than merely the time label. The report distinguishes desktop mouse and emulated
touch. A physical phone, live traffic, emergency suitability, and predictive model
accuracy remain outside this check.
