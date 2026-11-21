# Houston simulator region preparation

Prepared locally on November 21, 2026 using Python 3.13 and the pinned
[simulator requirements](../../simulator/requirements.txt). All five Houston
regions now have usable artifacts in the main checkout's ignored
`simulator/data/processed/`. This handoff covers the four additional regions;
the existing downtown dataset and model were retained unchanged.

## Reproduce

Follow the environment setup in [simulator/README.md](../../simulator/README.md),
then run from `simulator/backend`:

```powershell
$regions = @('medical-center-brays', 'meyerland', 'ship-channel', 'kingwood-lake-houston')
foreach ($region in $regions) {
  ../.venv/Scripts/python.exe -m aquagrid.pipeline.build --region $region
  if ($LASTEXITCODE -ne 0) { throw "Build failed: $region" }
  ../.venv/Scripts/python.exe -m aquagrid.model.train --region $region
  if ($LASTEXITCODE -ne 0) { throw "Training failed: $region" }
}
```

Full defaults were used: seed 7, 800 sampled storms plus 200 preset-enriched
storms, 2,500 samples per storm, and the existing XGBoost training settings.
The resulting split was 2,095,000 training rows from 838 storms and 405,000
validation rows from 162 storms. Validation measures agreement with the
process-based teacher, **not observed flood accuracy**.

## Input provenance and reproducibility limits

- Overture Maps CLI 2.1.1 downloaded release **2026-11-18.0**: transportation
  segments/connectors, buildings, water, places and divisions, bounded by each
  padded `aquagrid.config.REGIONS[id].bbox`. Per-file `.parquet.state` files
  record release, bounds and download time. Individual Overture records retain
  provider/license metadata; the selected POIs include BrightQuery and Meta
  sources under CDLA-Permissive-2.0.
- All four builds used the USGS 3DEP elevation image service, with cached
  `3dep_*.tif` files. No Terrarium fallback was needed. The existing pipeline
  aggregates zoom-14 elevation pixels by two to approximately 16.5–16.6 m cells.
  The source endpoint is in [dem.py](../../simulator/backend/aquagrid/pipeline/dem.py).
- The pipeline downloads the latest Overture release when raw inputs are absent.
  To repeat this input release, populate each raw cache with `overturemaps download
  --release 2026-11-18.0 --bbox=<configured bbox> -f geoparquet --type=<type>
  -o=<raw path>` for the six types before running the build. Keep the cached DEM
  for an identical elevation input; the live USGS service may change.
- Generated geography, feature tables and weights are excluded from Git. A clean
  clone must run preparation or receive prepared artifacts separately. No raw
  downloads or model weights were committed or uploaded for this task.

## Verified outputs

CLI wall times include process startup. Sizes are MiB, rounded to one decimal.

| Region | Road edges / buildings | Grid | Trees / teacher MAE | Build / train seconds | Processed / model MiB |
|---|---:|---:|---:|---:|---:|
| medical-center-brays | 20,672 / 31,424 | 472×409 | 286 / 0.91 cm | 76.49 / 33.61 | 36.4 / 9.2 |
| meyerland | 12,937 / 29,964 | 414×376 | 225 / 0.89 cm | 49.15 / 34.37 | 30.1 / 7.6 |
| ship-channel | 23,185 / 45,748 | 967×611 | 472 / 0.89 cm | 64.83 / 53.05 | 69.9 / 13.1 |
| kingwood-lake-houston | 26,723 / 67,635 | 1084×848 | 419 / 0.76 cm | 90.49 / 65.41 | 92.4 / 12.1 |

Raw input caches totaled about 90.9 MiB. The initial machine had 210.7 GiB disk
free and 6.5 GiB RAM free; builds/training ran sequentially. No pipeline
compatibility fixes or reduced training settings were needed.

## API and browser rehearsal pins

Start `pnpm dev:integrated`. Confirm `/api/regions` on port 8001 reports all five
entries `built:true`. Each region's real `meta`, `roads`, `buildings` and
`simulate` endpoints passed identity/count checks; prediction array lengths
matched geometry and a PNG overlay was returned. The following existing road
vertices yielded nonempty routes with preset `shower` and vehicle `ambulance`:

| Region | Pin `[lon, lat]` | Hospital ID | Modeled route |
|---|---|---|---:|
| medical-center-brays | `[-95.402584, 29.702416]` | `red-duke-trauma-institute` | 1,570.6 m / 116.3 s |
| meyerland | `[-95.46214, 29.684973]` | `bellaire-emergency-room` | 4,069.5 m |
| ship-channel | `[-95.176069, 29.725599]` | `community-first-emergency-room` | 9,253.1 m / 605.7 s |
| kingwood-lake-houston | `[-95.21533, 30.034656]` | `townsen-memorial-hospital-emergency-room` | 8,843.2 m / 657.5 s |

These are actual catalogued healthcare POIs, not fire-station or zone-centre
proxies. Their names/addresses match the providers' official pages:
[Red Duke, 6411 Fannin](https://memorialhermann.org/locations/red-duke-trauma-institute),
[Bellaire ER, 5302 Bellaire Boulevard](https://www.bellaireer.com/contact),
[Community First ER, 1101 East Boulevard](https://www.communityfirster.com/home),
and [Townsen ER, 1475 FM 1960 Bypass Road East](https://www.townsenmemorial.com/townsen-locations/townsen-memorial-emergency-room).
Coordinates remain provider geocodes, not surveyed emergency entrances. These
modeled routes do not establish current facility availability or road safety.

## Catalog correction

The first Medical Center catalog selected BrightQuery record `388529825`, named
Ben Taub General Hospital but located at 2525 Holly Hall. Harris Health identifies
that site as the [outpatient Smith Clinic](https://www.harrishealth.org/locations-hh/Pages/smith-clinic.aspx),
while [Ben Taub Hospital is at 1504 Taub Loop](https://www.harrishealth.org/locations-hh/Pages/ben-taub.aspx).
Commit `31d98b7` adds a source-ID-and-location exclusion and three regression
tests. A corrected future location and unrelated source records remain eligible.
The local Medical Center metadata was refreshed with:

```powershell
../.venv/Scripts/python.exe -m aquagrid.pipeline.build --region medical-center-brays --pois-only
../.venv/Scripts/python.exe -m unittest discover -s tests -v
```

The medical model was not retrained for this metadata correction. A running API
can retain a cached catalog; restart it after a POI refresh. The other listed
destinations were checked for provider identity/address, while the remainder of
each automatically derived catalog is not individually certified.
