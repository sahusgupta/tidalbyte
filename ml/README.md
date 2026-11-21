# ML workstream handoff

Status: **not trained**. This directory is a scaffold. No verified source table,
model artifact, validation metrics, or numerical ML predictions exist yet.
The application's canned fixture remains `offline_example`.

`config.yaml` uses the JSON subset of YAML so the bootstrap guard needs only the
Python standard library. Until a training implementation exists, this command
deliberately exits with code 2 and an actionable message:

```sh
python ml/train.py --config ml/config.yaml
```

Run the bootstrap guard tests from the repository root:

```sh
python -m pytest ml/tests
```

The ML/data owner should read `docs/03-ML-DATA.md` and `prompts/02-ML-DATA.md`, then:

1. Verify accessible source data, license, version, columns, target definition,
   and units. Keep raw downloads in ignored `data/raw/`; commit small permissible
   fixtures and provenance metadata only. No dataset has been verified here.
2. Implement preparation and record dataset counts, geography, dates, missingness,
   and exclusions. Positive-outage county-hours with matched warnings represent
   selected observations. Do not invent no-outage negatives or train an outage
   occurrence classifier from that selected archive.
3. Choose only features available at prediction time. Exclude future outage,
   post-event damage, and other outcome-derived predictors. Split whole weather
   events and time periods; never randomly split related county-hours.
4. Train a transparent baseline and the agreed scikit-learn regressor. Report
   held-out MAE, median absolute error, p90 absolute error on original target
   units, and event/county breakdowns, including baseline comparison. Do not
   assume or promise improvement.
5. Export a locally reproducible artifact plus SHA256 and metadata with model
   version, feature order/units/support, target/units, source version, split policy,
   train/test counts and periods, seed, metrics, and limitations. Model weights
   stay out of Git; coordinate artifact distribution with the lead.
6. Wire the model-loading/inference service to the frozen shared contracts.
   The public scope is conditional outage severity among selected positive-outage
   warning hours. It is not an absolute outage probability or asset-failure
   forecast. Refuse unsupported features/geographies and label perturbations
   exploratory.

The full `prepare.py` and `evaluate.py` commands are future work, not implemented
interfaces in this bootstrap. The train guard also refuses a populated config
until a real pipeline replaces it, preventing configuration alone from falsely
promoting an offline fixture to trained output.
