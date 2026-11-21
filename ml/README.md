# ML workstream (EarthLab P1)

Two trained models live here:

| Model | Folder | What it estimates | Data |
|---|---|---|---|
| **Outage severity** (contract model) | `ml/` | Customers without power in a Houston-region county during an hour that already has an outage under active NWS warnings | Saki et al. EAGLE-I x NWS VTEC archive (Zenodo 22651795, CC BY 4.0) |
| **Harvey flood depth** | [`ml/flood/`](flood/README.md) | Peak water depth per 20 m cell, for flood-aware routing | USGS Harvey flood documentation + 3DEP + NLCD + NOAA rainfall |

The outage model is the one the frozen v1 API contracts describe (`/api/v1/scenarios/evaluate`,
`/api/v1/models/current`). The flood model is outside those contracts. Showing it in the app needs a
contract proposal approved by the lead (`docs/proposals/`).

## Outage-severity model

It estimates **how many customers are without power** in a Houston-region county during an hour that
already has an outage under active NWS warnings. This is **not** an outage probability, not a forecast,
and not asset-level. See `data/provenance/zenodo-22651795.md` and the `limitations` list in
`ml/artifacts/model_metadata.json`.

### Environment

The app's `requirements.lock` does not include pandas or scikit-learn. Use a separate Python 3.13
environment for ML work:

```bash
python3.13 -m venv .venv-ml
.venv-ml/bin/python -m pip install -r ml/requirements.txt
```

In the app's CI environment, `ml/tests` still runs the stdlib-only training guard. Model tests skip
there because the ML packages are absent.

### Reproduce (from the repository root)

```bash
# 1. data: download into data/raw/zenodo-22651795/ (see the provenance file for URLs + MD5s)
.venv-ml/bin/python -I ml/prepare.py --config ml/config.yaml     # ~15 s: parquet + Houston storm catalog
.venv-ml/bin/python -I ml/train.py --config ml/config.yaml       # ~6 min on a laptop CPU
.venv-ml/bin/python -I ml/evaluate.py --config ml/config.yaml    # re-verify held-out metrics from the artifact
.venv-ml/bin/python -I -m pytest ml/tests -q
```

`train.py` fails closed. Without a readable config, the prepared dataset, or the ML packages, it exits
with code 2 and writes nothing. `-I` runs Python isolated from the current directory and user
site-packages; the scripts add the repository root to `sys.path` themselves.

### Method

| Step | Choice |
|---|---|
| Target | `max_rolling_avg` (customers, max 4-h trailing average in the hour), fit on `log1p`, absolute-error loss, so predictions are the conditional median |
| Features | 18 warning-type flags, number of warnings, NWS office, month, local solar hour, source-record availability, county area / water share / centroid, and county outage statistics from the **training period only** |
| Excluded | Target, event peak, event duration, event-level availability, event id, and `median_sum` (computed over the full record, so it leaks the future) |
| Split | Whole outage events by start time: train 2015-2019, validation 2020 (geography + hyper-parameter selection), **test 2021-2022** (reported once). 48 h embargo before each boundary. |
| Final model | Refit on 2015-2020 with the selected settings, plus 10th/90th percentile models for an 80 % interval |
| Baselines | Global median; warning-type median; county median; county x warning-type median (all from Houston training rows) |
| Inference | `ml/inference.py`: validates county / warning codes / allow-listed what-if parameters, assumes full source-record availability, and returns the API `Prediction` shape |

### Results (held-out 2021-2022, Houston region)

- **Relative error:** the model beats every baseline (MAE on log1p 1.94 vs 2.42 for the best baseline).
- **Absolute error:** it is roughly tied with a per-county median lookup. Customer MAE is 3,478 vs 3,487, and slightly worse on a train-through-2021, test-2022 check.
- **Big events:** it underestimates them by orders of magnitude. Winter Storm Uri peaked at 359k in Harris County; the model predicted 488.
- **Reporting drift:** median outage levels in 12 of 13 counties jump 5-40x in 2021 (Harris in 2018), consistent with a change in utility reporting coverage rather than weather.

Full report: `ml/artifacts/evaluation_report.md`.

### Outputs

Weights are gitignored. Metadata and reports are versioned.
- `ml/artifacts/outage_model.joblib` (not in Git): models, feature schema, training-period county statistics, baselines
- `ml/artifacts/model_metadata.json`: provenance, split counts, selection results, held-out metrics, SHA-256, limitations
- `ml/artifacts/metrics.json`, `ml/artifacts/evaluation_report.md`
- `data/processed/houston_events_catalog.json` (not in Git): historical storm episodes (observed values) for scenario presets

To get the weights without retraining, copy `/Users/sparsh/tidalHackathon/ml-work/ml/artifacts/outage_model.joblib`
from the training laptop into `ml/artifacts/`. `OutageSeverityModel.load()` verifies the SHA-256 in
`model_metadata.json`.

### API hook (for `apps/api/app/services/model.py`, ML-owned)

```python
from ml.inference import OutageSeverityModel, UnsupportedInput
model = OutageSeverityModel.load()            # verifies sha256 against metadata
model.predict(["48201"], ["WS"], "2021-02-16T08:00:00Z")      # POST /api/v1/scenarios/evaluate
model.describe()                                               # GET  /api/v1/models/current
```

`UnsupportedInput.code` maps to HTTP status codes:
- `unsupported_county` -> 404
- `unsupported_warning`, `unsupported_parameter`, `out_of_range`, `no_warning`, `empty_selection` -> 422
