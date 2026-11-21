# Machine Learning and Data Protocol

## Data source and selection caveat (READ CAREFULLY)
Primary candidate: Saki et al. (2026), harmonized county-hour utility outage records and matched NWS VTEC weather warnings (Zenodo v2: https://zenodo.org/records/22651795 ; paper: https://www.nature.com/articles/s41597-026-08356-z ). **Primary joined table contains county-hours with positive processed outage metrics and matched warnings.** Hence it is **NOT** an unbiased sample of all no-outage and outage hours. Training a binary `will outage occur` classifier from this alone is invalid. No invented negative rows.

## MVP prediction task
Among county-hours in the joined positive-outage+warning dataset, estimate severity of the observed outage metric (e.g. `max_rolling_avg`, verify actual unit and definition from data dictionary). Transform target `log1p(y)` for modeling, invert with `expm1`, clamp nonnegative. Describe publicly as **conditional outage-severity estimate under historical event selection**, not absolute outage probability or a hurricane forecast.

## Data pipeline
1. Download only accessible relevant CSV(s) to `data/raw/` (gitignored). Inspect actual column names, missingness, warning semantics, unit definitions. If download inaccessible, stop and record blocker; use offline fixture WITHOUT claiming trained model.
2. Filter geographically to Texas Gulf Coast + adequate historical observations; if sample too small, train on broader US counties but test selected held-out weather events and disclose geography.
3. Choose only **available at scenario prediction time** covariates: warning event type, warning metadata, county static features, month/season, warning lead time if known. Exclude current/future outage metrics, rolling outcome summaries, post-event damage and future information. Handle temporal leakage explicitly.
4. Create event/group IDs and split by **whole warning events and time periods** so nearby county-hours in same event do not leak into test. Report counts and train/test time coverage.
5. Baseline: warning-category median or a regularized model. Trained: `HistGradientBoostingRegressor` or `RandomForestRegressor` with proper encoding / missing-value handling. Use sklearn Pipeline/ColumnTransformer where appropriate.
6. Evaluate MAE, median absolute error, p90 absolute error on original target scale, plus error breakdown by event and county. Compare baseline honestly. Only promote trained model if its validation result is not materially worse; even then disclosure required.
7. Export artifact via joblib + SHA256 + `model_metadata.json`: feature list/order, target definition/units, source version, split policy, counts, metrics, seed, supported geography/features, version.
8. API validates supported features, returns prediction with provenance and `modelScope=conditional_selected_event`. If out-of-distribution, flag or refuse; do not silently infer site-specific equipment failures.

## Environmental realism vs ML accuracy
- The photorealistic globe is visualization. Do not infer elevations, road topology or training features from Google tiles.
- A user dragging a fictitious storm is a **what-if sensitivity demo**, not a physically credible weather forecast. Model inputs may only be changed if they correspond to trained features.
- County overlay is an aggregation geometry, not evidence that each building within a county shares the same risk.
- Forecasting true outages would require representative no-outage hours, observed meteorology, proper validation, and calibration. This is beyond day-one scope unless vetted data is ready.

## Infra graph, separate from ML
- Use independently sourced OSM or tiny licensed fixture for roads/facilities (not electric grid claims).
- Route accessibility changes under synthetic disruptions are **hypothetical**. Do not map county outage severity directly to exact disconnected roads or substations.
- Baseline vs intervention metrics: connected components, count of critical facility nodes reachable, shortest path detours, weighted service access. Game theory extension models two strategic resource holders with documented utility/actions, not fabricated 'AI negotiation'.

## Exact training notebook/script obligations
`python ml/prepare.py --input ... --output ...`
`python ml/train.py --config ml/config.yaml`
`python ml/evaluate.py --model ... --split ...`
Document full command lines in README after code exists; require CPU train <= 10 minutes on the demo laptop **as a target**, never as an unverified fact. Use a subsample if required, with bias disclosed.

## Fallback
If no real dataset can be prepared in time, a **synthetic fixture** can exercise end-to-end architecture but DOES NOT count as real-world validation or historical-ML outcome. Clearly mark it and tell judges the truth.
