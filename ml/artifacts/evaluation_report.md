# Outage-severity model evaluation (outage-severity-v1)

Created 2026-11-21T18:31:32+00:00. Artifact sha256 `cda12bfba3061638…`.

**What it estimates:** customers without power (max 4-h trailing average within the clock hour), for county-hours with a positive processed outage metric AND >= 1 matched NWS VTEC warning (dataset selection).

**Training:** 1,500,443 rows, 2015-2020 events, geography `conus`. **Test:** Houston-region (13 counties) events starting 2021-01-01 or later, never used for selection.

## Held-out test, Houston region

| Predictor | MAE (customers) | Median AE | P90 AE | MAE log1p | within ×2 |
|---|---:|---:|---:|---:|---:|
| model | 3,477.5 | 71.6 | 1,073.8 | 1.935 | 0.263 |
| county_x_warning_median | 3,486.6 | 79.2 | 1,117.3 | 2.416 | 0.174 |
| county_median | 3,485.8 | 78.5 | 1,125.4 | 2.416 | 0.174 |
| warning_type_median | 3,506.3 | 83.6 | 1,220.0 | 2.597 | 0.134 |
| global_median | 3,506.6 | 83.8 | 1,220.6 | 2.559 | 0.134 |

80% interval coverage (10th-90th pct models): 0.6664

Excluding the largest episode (`ep-20210211-15`): model MAE 239.5 vs county×warning baseline 250.3.

## Largest held-out storm episodes

| Episode | Warnings | Observed peak | Model at that hour | 10-90% interval |
|---|---|---:|---:|---|
| ep-20210211-15 | HZ;WC;WS;WW | 359,049 | 488 | 23-1,444 |
| ep-20221025-00 | SV;TO | 21,081 | 719 | 24-5,672 |
| ep-20220810-23 | SV;TO | 20,076 | 703 | 26-4,335 |
| ep-20210518-19 | SV;TO | 15,383 | 699 | 26-4,231 |
| ep-20211027-13 | SV;TO;WI | 9,726 | 697 | 26-4,134 |
| ep-20210912-15 | HU;TR | 9,426 | 12 | 3-63 |
| ep-20220708-15 | EH;HT;SV | 6,105 | 503 | 26-1,767 |
| ep-20220108-20 | SV;TO | 5,925 | 772 | 24-4,782 |

## Worst errors (one per episode)

- 2021-02-17 08:00:00+00:00 Harris [WS]: observed 359,049, predicted 488 (interval 24-1,444)
- 2022-10-25 08:00:00+00:00 Harris [SV]: observed 21,081, predicted 718 (interval 24-5,672)
- 2022-08-11 01:00:00+00:00 Harris [SV]: observed 20,076, predicted 703 (interval 26-4,336)
- 2021-05-19 06:00:00+00:00 Harris [SV]: observed 15,383, predicted 699 (interval 26-4,230)
- 2021-09-14 03:00:00+00:00 Matagorda [HU;TR]: observed 9,426, predicted 12 (interval 3-62)

## Extra forward test: train through 2021, test 2022 (Houston)

| Predictor | MAE | Median AE | MAE log1p | within ×2 |
|---|---:|---:|---:|---:|
| model | 253.5 | 63.7 | 1.493 | 0.280 |
| model_trained_2015_2020 | 226.9 | 63.9 | 1.649 | 0.272 |
| county_median | 230.9 | 66.8 | 1.896 | 0.202 |
| county_x_warning_median | 234.2 | 68.2 | 1.986 | 0.204 |
| warning_type_median | 250.9 | 71.5 | 2.183 | 0.156 |
| global_median | 249.3 | 67.9 | 1.976 | 0.162 |

## Data drift: median customers out per county-hour, by year

| County | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Austin | 2 | 1 | 2 | 3 | 2 | 2 | 76 | 68 |
| Brazoria | 31 |  | 15 | 30 | 16 | 11 | 335 | 286 |
| Chambers | 4 | 2 | 2 | 5 | 4 | 2 | 23 | 35 |
| Colorado | 2 | 1 | 2 | 3 | 4 | 3 | 33 | 20 |
| Fort Bend | 28 |  | 32 | 35 | 23 | 20 | 182 | 172 |
| Galveston | 3 | 2 | 6 | 20 | 28 | 22 | 163 | 102 |
| Harris | 22 | 12 | 28 | 748 | 488 | 533 | 753 | 407 |
| Liberty | 7 | 3 | 7 | 8 | 9 | 5 | 50 | 28 |
| Matagorda | 19 |  | 9 | 4 | 4 | 4 | 16 | 12 |
| Montgomery | 54 | 31 | 42 | 50 | 58 | 73 | 202 | 199 |
| Walker | 8 | 12 | 11 | 3 | 2 | 4 | 31 | 4 |
| Waller | 4 | 3 | 5 | 2 | 3 | 5 | 82 | 91 |
| Wharton | 10 |  | 5 | 3 | 4 | 2 | 134 | 117 |
| *mean source availability %* | 69 | 66 | 67 | 81 | 80 | 80 | 92 | 92 |

## Limitations

- Conditional on the archive's selection: only hours that already had a positive outage AND a matched warning. It does not predict whether an outage happens, nor its probability.
- Warning attribution is spatiotemporal co-occurrence (event start-to-peak window), not causation.
- EAGLE-I coverage is heterogeneous and grows over time; missing source records were zero-filled by the dataset authors, biasing low-availability hours downward.
- Tree ensembles cannot extrapolate beyond magnitudes seen in training; record events (Winter Storm Uri) are underestimated by orders of magnitude.
- Reporting-regime drift: median outage levels in 12 of 13 Houston counties jump 5-40x in 2021 (Harris in 2018) while source availability rises above 90%. The step change is consistent with a change in utility reporting coverage rather than weather; models trained on earlier years underestimate 2021+ levels. On absolute customer error the model is roughly tied with a per-county median lookup; its advantage is in relative (log-scale) error.
- County-level aggregate; says nothing about individual feeders, substations or buildings.
- Not a weather forecast and not for operational dispatch.
