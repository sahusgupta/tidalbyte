# ML bootstrap handoff

Date: 2026-11-21. Branch: `integrate/bootstrap-ml` (to be integrated by lead).

Changed files: `ml/config.yaml`, `ml/train.py`, `ml/README.md`,
`ml/artifacts/.gitkeep`, `ml/artifacts/README.md`, and
`ml/tests/test_training_guard.py`, plus this handoff.

Commands run:

- `git fetch origin`, `git status --short --branch`, `git log -1 --oneline`.
- `python -m pytest ml/tests`: **4 passed** on Python 3.13.14 / pytest 8.4.1.
- `python ml/train.py --config ml/config.yaml`: expected refusal; no verified
  dataset/provenance or training implementation exists. CLI returns code 2
  (also asserted by subprocess tests). No artifact/metrics were written.

Dependencies: Python standard library only for the guard; pytest for tests.
`config.yaml` intentionally uses JSON-compatible YAML. No external API,
download, source-data verification, ML library, model artifact, or metrics.

Next owner: ML/data workstream. Implement verified preparation, target and units,
event/time-held-out baseline/model evaluation, provenance, artifact metadata,
and the inference path described in `docs/03-ML-DATA.md`. Replace the guard only
when a real pipeline exists. Offline fixture output does not satisfy P1.
