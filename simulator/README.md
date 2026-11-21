# Houston flood simulator

AquaGrid opens from EarthLab’s Houston area chooser. All five areas and the standalone map use the same 3D simulator, with regional datasets, storm presets, overlays, impact estimates and pin-to-hospital routes.

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

From `simulator/backend`, prepare all five zones sequentially with the simulator environment. The command reuses complete local builds and trains missing models with the standard settings.

```powershell
../.venv/Scripts/python.exe -m aquagrid.prepare_zones
```

After completing the [EarthLab setup](../README.md), run `pnpm dev` from the repository root. Select **Open EarthLab** on the product site or open the [Houston area chooser](http://127.0.0.1:5173/#/simulate) directly. The [standalone map](http://127.0.0.1:5174) also accepts `?region=<id>`. The [AquaGrid region catalog](http://127.0.0.1:8001/api/regions) reports which regions are built.

For standalone development, start Uvicorn with `python -m uvicorn aquagrid.api:app --port 8000` from `simulator/backend` using the simulator environment, and `npm run dev -- --port 5174` from `simulator/frontend`. Set the frontend process variable `AQUAGRID_API` when its API runs at a different address. To embed a separately served simulator, set `VITE_SIMULATOR_URL` to its public URL before starting or building the atlas. A static deployment of the simulator must forward its `/api/` requests to the AquaGrid backend.

## Interpretation

Hospital choices are derived from Overture place records and snapped to the regional road
network. The prepare pipeline excludes one audited BrightQuery record that mislabels the
[Holly Hall outpatient clinic](https://www.harrishealth.org/locations-hh/Pages/smith-clinic.aspx)
as [Ben Taub Hospital](https://www.harrishealth.org/locations-hh/Pages/ben-taub.aspx).
The exclusion matches its source ID and erroneous location; a corrected future location
is retained. Run catalog regressions from `simulator/backend` with the simulator environment:
`python -m unittest discover -s tests -v`.

The route estimate uses the selected vehicle and modeled road depths. Travel time excludes live traffic. Roads are treated as undirected. Route availability in this scenario does not establish current road safety or emergency access.
