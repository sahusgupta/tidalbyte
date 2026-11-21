# ML handoff: `feat/ml-harvey-peak-flood`

Date: 2026-11-21. Owner: ML/data workstream. Base: `origin/main` @ `deeb024` (prompt 00 bootstrap).
The branch is **local only** at the time of writing (not pushed).

## What this branch adds

1. **Outage-severity model (P1, matches the frozen v1 contracts).** Files: `ml/{common,prepare,train,evaluate,inference}.py`, `ml/config.yaml`, `ml/tests/*`, `data/provenance/zenodo-22651795.md`.
   - Data: Saki et al. EAGLE-I x NWS VTEC archive, Zenodo 22651795 (CC BY 4.0), MD5-verified.
   - Model: scikit-learn `HistGradientBoostingRegressor` on `log1p(max_rolling_avg)` (customers). Whole-event time split: train 2015-2019, validation 2020, test 2021-2022, with a 48 h embargo.
   - It replaces the bootstrap training guard. `ml/train.py` still **fails closed**: exit 2, nothing written, if the config, the prepared data, or the ML packages are missing. `ml/tests/test_training_guard.py` asserts this using stdlib + PyYAML only.
2. **Harvey flood-depth model (outside the v1 contracts).** Files: `ml/flood/*`, `data/provenance/flood_sources.md`.
   - Labels: USGS Harvey flood documentation (doi:10.5066/F7VH5N3N).
   - Inputs: 3DEP terrain/hydrology, NLCD 2016, NOAA GHCN-Daily rainfall.
   - v1 (`flood_model.joblib`) is the **default for emergency routing**. v2 (`flood_model_v2.joblib`) is the alternative for map display.
   - `ml/flood/inference.py` provides `FloodDepthModel.load()` / `predict()` / `impassable(depth, vehicle)`.

## Held-out results (measured, not promised)

**Outage, Houston region, 2021-2022 events:**
- Relative error: the model beats all baselines (MAE on log1p 1.935 vs 2.416 for the best baseline).
- Absolute error: roughly tied with a per-county median (MAE 3,478 vs 3,487 customers).
- Failure case: Winter Storm Uri, observed 359,049, predicted 488.
- Drift: median outage levels in 12 of 13 counties jump 5-40x in 2021, consistent with a change in reporting coverage.
- Interval coverage is 67 % for a nominal 80 %.
- Details: `ml/artifacts/evaluation_report.md`, `ml/artifacts/model_metadata.json`.

**Flood, San Jacinto reach (Harris County), every labeled land cell:**

| Model | CSI >15 cm | Flooding caught (POD) | False alarms (FAR) | Depth MAE |
|---|---:|---:|---:|---:|
| v1 | 0.378 | 0.777 | 0.576 | 0.717 m |
| v2 | 0.382 | 0.590 | 0.481 | 0.712 m |
| HAND + river-size baseline | 0.366 | n/a | n/a | n/a |

All labels come from one storm. v2 was built after seeing v1's hold-out result (disclosed in its metadata). Details: `ml/flood/artifacts/evaluation_report.md`.

## Commands run

The ML environment is Python 3.13 with `ml/requirements.txt` / `ml/flood/requirements.txt`:
- `python -I ml/prepare.py --config ml/config.yaml`
- `python -I ml/train.py --config ml/config.yaml`
- `python -I ml/flood/build_labels.py`, `build_features.py`, `train_flood.py`, `train_flood_v2.py`

## Tests (actual results)

| Environment | Command | Result |
|---|---|---|
| ML env, training workspace with prepared data | `pytest ml/tests ml/flood/tests` | 32 passed |
| ML env, this clone (no prepared data) | `pytest ml/tests ml/flood/tests` | 29 passed, 3 skipped (split tests need `data/processed/outage_rows.parquet`) |
| Replica of app CI (`requirements.lock`, no pandas/sklearn) | `pytest apps/api/tests ml/tests packages/contracts/tests` | 52 passed, 3 skipped (ML model tests skip via `importorskip`) |

## Integration requirements and open decisions (lead)

- **Weights are not in Git.** Transfer `outage_model.joblib`, `flood_model.joblib`, and `flood_model_v2.joblib` from the training laptop (see `ml/README.md`, `ml/flood/README.md`). `load()` verifies the SHA-256 recorded in the metadata.
- **Root `.gitignore` hides `ml/artifacts/*`.** `model_metadata.json`, `metrics.json`, and `evaluation_report.md` were force-added because AGENTS.md says to commit metadata. Please add explicit exceptions if you agree.
- **The app lock lacks pandas, scikit-learn, and joblib.** Wiring `ml/inference.py` into `apps/api/app/services/model.py` and `routes/predict.py` (ML-owned) needs either those packages in the app environment (lead decision) or a separate model service. This is not done yet.
- **The flood model is outside contract v1.0.0.** Showing flood depth or road closures in the app needs a `docs/proposals/` entry and lead approval (ADR-010).
- **`STATUS.md` was not edited (lead-owned).** Suggested ML row: "Outage model trained + flood model trained on `feat/ml-harvey-peak-flood`; API wiring pending."
- **Data quirks are documented in provenance:**
  - The outage archive ends 2023-01-03, despite "2024" in its name.
  - The USGS depth rasters are in feet.
  - The Annual NLCD service errored, so NLCD 2016 was used.
  - USGS precipitation series were empty, so NOAA GHCN-Daily was used.
  - Harris County FWS bulk data and USGS STN high-water marks were not obtained.
