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

## Relief money

Open any Houston area and choose a storm, then select **Relief money** in the header. The panel lists the five places where a donation would reach the most people in need for that storm. Each has an amount, the number of people in modeled flooded homes and up to two plain reasons, such as low incomes or no car. Choose $250K, $1M, $5M or type another amount (`750k`, `2.5m`). **Most in need** gives extra weight to more socially vulnerable places; **Most people** counts every resident equally. The places appear on the map in gold with their rank. Clicking one brings it into view.

The overlay follows whatever storm is on screen, including storm paths. Census tracts and CDC/ATSDR Social Vulnerability Index measures come from `public/relief/<region>.json`. The browser matches each building to its tract and spreads a tract's residents evenly over its buildings. The share of flooded buildings (over 15 cm) then estimates residents in flooded homes. Need adds residents in deep water (over 50 cm), without a car, or 65+ or disabled and cut off from the selected hospital. The budget is split in proportion to vulnerability-weighted need, in $100 steps. This is an exploratory rule from a modeled scenario, not a needs assessment. Rebuild the tract files with `ml/relief/build_relief.py`; inputs are listed in [the provenance note](../data/provenance/relief_sources.md).

## Interpretation
## Interpretation

### Compare infrastructure improvements under an event

Run the integrated stack with `pnpm dev`. Open Downtown / Buffalo Bayou, choose the 100-Yr NOAA Atlas preset under **Storm controls**, then choose an origin and a waypoint under **Event origin & path**. Open **Impact & routing → Plan infrastructure improvements → Compare agency plans**. The selected vehicle and hospital govern both sides of each comparison.

Compare local drainage improvements before an event and temporary pumping after flooding. The simulator screens up to three named roads by their length-weighted loss of travel speed and tests local segments near a specific point on each road. It reroutes service access for every project combination. Each project assumes a 20 cm (drainage) or 10 cm (pumping) offset on the treated roadway. These planning assumptions are uncalibrated. They do not redistribute basin water or estimate structural failure.

The two agencies can spend within individual and shared budget limits. Each project occupies one crew. Switch strategies to inspect the funded corridors and see before-and-after road closures, hospital cutoffs and cumulative building delay. Budget units represent illustrative costs. Rounded reports give agencies less precise information when they choose a plan. All displayed outcomes come from the paired simulation runs.

For a separately hosted simulator, route `/api/v1/allocation/` to the EarthLab API and other `/api/` traffic to AquaGrid. In Vite development use `EARTHLAB_API` and `AQUAGRID_API` to override the two targets. The integrated launcher supplies a compatible setup.

After preparing Downtown and starting the stack, run `npm ci --prefix simulator/qa` and `node simulator/qa/verify-storm-planning.mjs` for the desktop and emulated-touch demonstration. Set `QA_CHROME_PATH` to a local Chrome executable or install Playwright Chromium. The script writes screenshots and measured strategy outcomes to the printed temporary folder.

Hospital choices are derived from Overture place records and snapped to the regional road
network. The prepare pipeline excludes one audited BrightQuery record that mislabels the
[Holly Hall outpatient clinic](https://www.harrishealth.org/locations-hh/Pages/smith-clinic.aspx)
as [Ben Taub Hospital](https://www.harrishealth.org/locations-hh/Pages/ben-taub.aspx).
The exclusion matches its source ID and erroneous location; a corrected future location
is retained. Run catalog regressions from `simulator/backend` with the simulator environment:
`python -m unittest discover -s tests -v`.

The route estimate uses the selected vehicle and modeled road depths. Travel time excludes live traffic. Roads are treated as undirected. Route availability in this scenario does not establish current road safety or emergency access.
