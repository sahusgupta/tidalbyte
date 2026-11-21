# Paste into Claude Code or Codex: ML / DATA

Read agent docs, `docs/03-ML-DATA.md`, `docs/06-API-CONTRACTS.md`, `docs/08-SOURCES.md`, `STATUS.md`, `DECISIONS.md`. Own `ml/**`, `data/provenance/**`, and model endpoint/service paths described in `docs/05-TEAM-PROTOCOL.md`.

Download and inspect the actual open outage-warning dataset from https://zenodo.org/records/22651795 (if cannot access, report blocker; never invent files). Inspect data dictionary, outcome unit, covariates and selection mechanism. THE JOINED TABLE IS POSITIVE-OUTAGE + MATCHED-WARNING SELECTED CASES; do not build an invalid all-hours outage probability classifier.

Train a bounded CPU baseline and scikit-learn HistGradientBoostingRegressor for transformed outage severity conditional on source selection. No future target leakage, event/time holdout, MAE/p90 errors vs baseline, honest data provenance and failure cases. Provide `ml/prepare.py`, `ml/train.py`, `ml/evaluate.py`, `ml/config.yaml`, tests, model metadata with training conditions. Implement `/api/v1/scenarios/evaluate` and `/api/v1/models/current` using contracts. Use server-side cached joblib, validate ranges and flags.

If source inaccessible, implement clearly flagged offline adapter and stop claiming the ML is complete. Report sample counts, measured runtime, validation results, and whether inference generalizes. Never use Google photorealistic imagery as training data.

Complete with PR, actual commands, measured metrics if any, and handoff. Don't modify web/shared contracts without lead approval.
