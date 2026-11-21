# Houston flood simulator

AquaGrid opens in the atlas from the Study menu or from any of the five Earth study zones. The standalone map supports the same regional datasets, storm presets, overlays, impact estimates and pin-to-hospital routes.

## Prepare a region

Use Python 3.13. From the repository root on Windows, run:

```powershell
python -m venv simulator/.venv
simulator/.venv/Scripts/python.exe -m pip install -r simulator/requirements.txt
npm ci --prefix simulator/frontend
cd simulator/backend
../.venv/Scripts/python.exe -m aquagrid.pipeline.build --region downtown-buffalo-bayou
../.venv/Scripts/python.exe -m aquagrid.model.train --region downtown-buffalo-bayou
```

On macOS or Linux, use `python3.13` to create the environment and `.venv/bin/python` in place of `.venv/Scripts/python.exe` in these paths.

Build downloads regional geography. Training fits a flood-depth surrogate to a process-based simulator. Generated files live under `simulator/data/` and are excluded from Git. An existing prepared region, including its model, can be placed in `simulator/data/processed/<region-id>/`. Additional region IDs are `medical-center-brays`, `meyerland`, `ship-channel` and `kingwood-lake-houston`.

## Open the map

After completing the [atlas setup](../README.md), run `pnpm dev:integrated` from the repository root. Open the [Houston atlas](http://127.0.0.1:5173) and choose **Study menu → Flood simulator**. **Open Earth view** lists all zones. The [standalone map](http://127.0.0.1:5174) also accepts `?region=<id>`. The [AquaGrid region catalog](http://127.0.0.1:8001/api/regions) reports which regions are built.

For standalone development, start Uvicorn with `python -m uvicorn aquagrid.api:app --port 8000` from `simulator/backend` using the simulator environment, and `npm run dev -- --port 5174` from `simulator/frontend`. Set the frontend process variable `AQUAGRID_API` when its API runs at a different address. To embed a separately served simulator, set `VITE_SIMULATOR_URL` to its public URL before starting or building the atlas. A static deployment of the simulator must forward its `/api/` requests to the AquaGrid backend.

## Interpretation

The route estimate uses the selected vehicle and modeled road depths. Travel time excludes live traffic. Roads are treated as undirected. Route availability in this scenario does not establish current road safety or emergency access.
