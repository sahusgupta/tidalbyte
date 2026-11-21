# Harvey flood-depth model: evaluation (v2 vs v1)

Created 2026-11-21T19:27:27+00:00. v2 artifact sha256 `9f246f527d27e029…`. Sources and citations: `data/provenance/flood_sources.md`. **Selected for emergency routing: v1** (default `flood_model.joblib`; decided 2026-11-21). v2 is kept as `flood_model_v2.joblib` for flood-map display.

**Target:** mean water depth over a 20 m cell during the Hurricane Harvey peak (Aug-Sep 2017), dry ground inside the USGS mapped area counted as 0; open water excluded.

**v2 method:** Two-part model: scikit-learn HistGradientBoostingClassifier (wet > 15 cm) + HistGradientBoostingRegressor (depth given wet); CV-chosen probability threshold and river-connectivity filter. Chosen by leave-one-basin-out CV on Brazos / San Bernard / coastal: feature set `all`, wet-probability threshold 0.3, connectivity filter `none`.

**Disclosure:** v2 was developed after seeing v1's hold-out false alarms, so the hold-out reach is no longer fully untouched; v2's settings were selected only on the other basins.

## Held-out San Jacinto reach (Harris County), every labeled land cell

| Predictor | CSI >15 cm | Flooding caught (POD) | False alarms (FAR) | CSI >30 cm | MAE (m) | MAE wet cells (m) | Bias (m) |
|---|---:|---:|---:|---:|---:|---:|---:|
| model_v2 | 0.382 | 0.590 | 0.481 | 0.376 | 0.712 | 1.754 | -0.115 |
| model_v1 | 0.378 | 0.777 | 0.576 | 0.384 | 0.717 | 1.800 | -0.174 |
| hand_river_size | 0.366 | 0.702 | 0.567 | 0.357 | 0.929 | 1.861 | +0.214 |
| hand_threshold | 0.297 | 0.622 | 0.637 | 0.286 | 1.142 | 2.081 | +0.203 |

**Surveyed high-water marks (105):** v2 MAE 1.116 m (bias +0.402), v1 MAE 0.849 m (bias +0.227), terrain-threshold baseline 1.139 m; USGS map itself at 20 m: 0.631 m.

## What changed

- v2 cuts false alarms (FAR 0.58 to 0.48) but misses more flooding (POD 0.78 to 0.59). Overall extent skill (CSI) is unchanged, and depth at surveyed marks is worse because more flood-edge cells are gated to dry.
- In CV the best threshold sat at the wettest end of the range (0.3): the training basins want *more* water, San Jacinto wants less. Tuning on other basins cannot fix that shift; it needs labels from more places or storms.
- The river-connectivity filter did not improve CV in any basin, so it is off.
- Both versions over-flood the low ground around Lake Houston and the southeast. Absolute elevation is the top feature, and low ground mostly flooded in the training basins.

## Choosing an operating point

- **Emergency routing:** missing a flooded road is worse than an unnecessary detour, so the higher-recall v1 catches 78 % of flooded cells vs 59 %.
- **Flood map display:** v2 has visibly less speckle (`holdout_san_jacinto_observed_v1_v2.png`: USGS observed | v1 | v2).

## CV (non-holdout basins, CSI >15 cm, chosen v2 setting)

- brazos: CSI 0.450, MAE 0.949 m
- san_bernard: CSI 0.482, MAE 1.087 m
- coastal: CSI 0.353, MAE 0.508 m

## Limitations

- All labels come from one storm (Hurricane Harvey). Validation is across places, not across storms; skill for other storms (or for slider-driven what-ifs) is unvalidated.
- Rainfall varies only spatially within Harvey (roughly 40-1250 mm storm totals). The model has never seen a modest storm, so low-rain scenarios are extrapolations and should not be shown as predictions.
- Labels are USGS riverine flood documentation along mapped reaches, derived by interpolating surveyed high-water marks over a DEM; they are not observations of street-level ponding in central Houston.
- Central Houston bayous (Buffalo, Brays, White Oak) are outside the USGS Harvey mapped reaches; predictions there are untested transfer.
- 20 m cells average out sub-cell terrain (curbs, underpasses); not a substitute for engineering models.
