# Houston flood and routing simulator

Standalone AquaGrid source used by EarthLab's zone iframe. Includes five Houston
regions, a Downtown & Buffalo Bayou default, preset fallback, and pin-to-hospital
routing with visible Start/Destination labels, a solid green route and estimated time.
The original simulator styling is preserved.

## Local setup

From this directory, create a Python 3.13 environment and install dependencies:

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cd backend
../.venv/bin/python -m aquagrid.pipeline.build --region downtown-buffalo-bayou
../.venv/bin/python -m aquagrid.model.train --region downtown-buffalo-bayou
../.venv/bin/python -m uvicorn aquagrid.api:app --port 8000
```

The build downloads geographic data and training takes additional time. Repeat
build/train for `medical-center-brays`, `meyerland`, `ship-channel`, and
`kingwood-lake-houston` as needed. Generated data and trained model artifacts are
excluded from Git; a fresh clone needs those steps or separately supplied artifacts.

In another terminal, from `simulator/frontend`:

```sh
npm ci
npm run dev -- --port 5174
```

Open http://localhost:5174. For EarthLab embedding, set
`VITE_SIMULATOR_URL=http://localhost:5174/` in EarthLab's local configuration and
restart its Vite server. Keep EarthLab's existing iframe integration unchanged.

## Checks and limitations

`npm run typecheck` passes in the original working frontend. Browser verification
confirmed Houston-only region choices, dropped-pin routing, solid green paths,
estimated time/distance and visible From/To labels. A fresh-clone rebuild has not
been performed. This directory snapshots the previously unversioned sibling
`frontend/` and `backend/`; currently running servers still use those siblings.

The model is a surrogate trained against a process-based simulator. Estimates do
not include live traffic or verified current road conditions. Routing treats roads
as undirected and applies vehicle-specific modeled flood thresholds; it is not
operational navigation or a guarantee that a road is safe.
