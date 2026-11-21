# Outage-severity artifacts

Versioned (small, reviewable):
- `model_metadata.json`: model version, SHA-256 of the weights, data source and checksum, target and units, feature order, excluded columns, split policy and counts, selection results, held-out metrics vs baselines, and limitations
- `metrics.json`: detailed held-out breakdowns (by county, by storm episode, failure cases)
- `evaluation_report.md`: human-readable summary

Not versioned (gitignored `*.joblib`): `outage_model.joblib`, the trained weights. Rebuild them with
`python -I ml/train.py --config ml/config.yaml`, or copy them from the training laptop (see `ml/README.md`).
`OutageSeverityModel.load()` refuses weights whose SHA-256 does not match `model_metadata.json`.

Do not create placeholder weights or edit metrics by hand. Rerun training and review the changed
metadata before committing.
