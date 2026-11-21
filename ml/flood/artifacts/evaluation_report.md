# Harvey flood-depth model: evaluation (harvey-flood-depth-v1)

Created 2026-11-21T19:18:38+00:00. Artifact sha256 `327fb7ef6a1b3b86…`. Sources and citations: `data/provenance/flood_sources.md`.

**Target:** mean water depth over a 20 m cell during the Hurricane Harvey peak (Aug-Sep 2017), dry ground inside the USGS mapped area counted as 0; open water excluded.

**Protocol:** spatial hold-out by basin; feature set chosen by leave-one-basin-out CV on non-holdout basins; 'san_jacinto' (Harris County reach) tested once. All labels come from one storm (Harvey 2017).

## Held-out test: San Jacinto reach (Harris County: Kingwood, Humble, Lake Houston)

| Predictor | CSI >15 cm | POD | FAR | CSI >30 cm | MAE (m) | MAE wet cells (m) | Bias (m) |
|---|---:|---:|---:|---:|---:|---:|---:|
| model | 0.379 | 0.779 | 0.575 | 0.384 | 0.719 | 1.804 | -0.174 |
| hand_river_size | 0.365 | 0.701 | 0.567 | 0.357 | 0.933 | 1.865 | +0.214 |
| hand_threshold | 0.297 | 0.621 | 0.638 | 0.286 | 1.147 | 2.085 | +0.204 |

**Surveyed high-water marks (105 in the held-out reach):** model MAE 0.849 m (bias +0.227 m); HAND-threshold MAE 1.139 m; the USGS map itself, at 20 m, differs from the marks by 0.631 m (map-to-point discrepancy, not an established error floor).

## Leave-one-basin-out CV (feature-set selection; CSI >15 cm, model / HAND-threshold)

| Feature set | Brazos | San Bernard | Coastal | Mean CSI | Mean MAE (m) |
|---|---:|---:|---:|---:|---:|
| all (chosen) | 0.60 / 0.64 | 0.53 / 0.42 | 0.30 / 0.26 | 0.478 | 0.765 |
| no_abs_elev | 0.56 / 0.64 | 0.49 / 0.42 | 0.27 / 0.26 | 0.441 | 0.874 |
| no_abs_elev_no_rain | 0.63 / 0.64 | 0.52 / 0.42 | 0.26 / 0.26 | 0.471 | 0.778 |

## What drives predictions (permutation importance on held-out reach, MAE increase in m)

- Ground elevation: +0.223
- Local low spot (TPI): +0.128
- River size: +0.041
- Impervious surface: +0.034
- Storm rainfall: +0.032
- Distance to stream: +0.031
- Height above nearest stream (HAND): +0.026
- Depression depth: +0.004
- Upstream area: +0.003
- Wetness index (TWI): +0.000
- Slope: -0.001

## Known failure mode

Over-predicts shallow flooding on higher ground between rivers (false alarms; see `holdout_san_jacinto_observed_vs_predicted.png`, USGS observed left, model right). Training reaches were wetter (Brazos lower 83 % wet) than San Jacinto (27 %).

## Limitations

- All labels come from one storm (Hurricane Harvey). Validation is across places, not across storms; skill for other storms (or for slider-driven what-ifs) is unvalidated.
- Rainfall varies only spatially within Harvey (roughly 40-1250 mm storm totals). The model has never seen a modest storm, so low-rain scenarios are extrapolations and should not be shown as predictions.
- Labels are USGS riverine flood documentation along mapped reaches, derived by interpolating surveyed high-water marks over a DEM; they are not observations of street-level ponding in central Houston.
- Central Houston bayous (Buffalo, Brays, White Oak) are outside the USGS Harvey mapped reaches; predictions there are untested transfer.
- 20 m cells average out sub-cell terrain (curbs, underpasses); not a substitute for engineering models.

## Interpretation of high-water-mark checks

These marks may also underlie the USGS interpolated depth maps. The comparison is a consistency check, not independent observational validation. The held-out scores use the model trained without San Jacinto; the deployable model is subsequently refitted on all four basin groups.
