# Harvey peak-flood model (v1)

This is a Hurricane Harvey 2017 **peak-flood depth reconstruction model with spatial holdout evaluation**, not a validated interactive storm simulator. It predicts mean depth in a 20 m cell. It does not produce a storm timeline, validate arbitrary rainfall sliders, estimate building damage, or certify road safety. No web/API integration is included.

The completed v1 milestone covers nine mapped reaches in four basin groups. Feature selection uses leave-one-basin-out validation on Brazos, San Bernard, and coastal groups. San Jacinto is the held-out test reach. The saved bundle contains both the held-out model (`holdout_model`) and a deployment refit on all four groups (`model`). Use the former when reproducing the reported San Jacinto scores; the refit has seen San Jacinto training data.

San Jacinto depth MAE is 0.719 m overall and 1.804 m on wet cells. CSI above 15 cm is 0.379 versus 0.365 for the river-size HAND baseline. False alarms remain substantial. See [evaluation](artifacts/evaluation_report.md), [metadata](artifacts/flood_model_metadata.json), and [sources](../../data/provenance/flood_sources.md). Surveyed marks also inform the source maps, so their comparison is not an independent validation dataset. No other storm is held out. Brays, Buffalo, and White Oak bayous are outside this evaluation coverage.

## Retrieve the saved model

There is currently **no published artifact download URL**. Obtain the completed v1 file from the training-machine owner by direct file transfer. On the originating laptop it is:

```text
/Users/sparsh/tidalHackathon/ml-work/ml/flood/artifacts/flood_model_v1.joblib
```

From the repository root on that same laptop:

```sh
mkdir -p ml/flood/artifacts
cp /Users/sparsh/tidalHackathon/ml-work/ml/flood/artifacts/flood_model_v1.joblib ml/flood/artifacts/flood_model.joblib
```

On another machine, ask the owner to transfer that exact file, or use the following SSH template after replacing `TRAINING_USER` and `TRAINING_HOST` with the owner's reachable SSH account:

```sh
mkdir -p ml/flood/artifacts
scp TRAINING_USER@TRAINING_HOST:/Users/sparsh/tidalHackathon/ml-work/ml/flood/artifacts/flood_model_v1.joblib ml/flood/artifacts/flood_model.joblib
```

Do not substitute the ongoing v2 experiment or a newly generated artifact. Verify the transferred bytes against the committed SHA-256 before loading:

```sh
python - <<'PY'
import hashlib, json
from pathlib import Path
root = Path('ml/flood/artifacts')
meta = json.loads((root / 'flood_model_metadata.json').read_text())
actual = hashlib.sha256((root / 'flood_model.joblib').read_bytes()).hexdigest()
assert actual == meta['artifact']['sha256'], 'Model checksum mismatch'
print('Verified:', actual)
PY
```

Joblib loading deserializes Python objects: only load the trusted team artifact. The checksum checks file identity; it does not make an unknown artifact safe.

## Environment and tests

Use a separate Python 3.13 environment for this workstream; do not replace the application dependency lock. Direct dependency versions are captured in `requirements.txt`; transitive dependencies are not fully locked.

```sh
python3.13 -m venv .venv-flood
.venv-flood/bin/python -m pip install -r ml/flood/requirements.txt
.venv-flood/bin/python -m pytest ml/flood/tests -q
```

Four tests run without the artifact; two artifact-dependent tests skip until the file is retrieved. All six should pass after retrieval. The training model uses scikit-learn CPU training, not CUDA.

## Rebuild from source data

From the repository root:

```sh
.venv-flood/bin/python -I ml/flood/build_labels.py
.venv-flood/bin/python -I ml/flood/build_features.py
.venv-flood/bin/python -I ml/flood/train_flood.py
```

These commands require data preparation first. Raw downloads and acquisition scripts for all sources are **not bundled**. Obtain the USGS release archives and NOAA daily precipitation described in the provenance document, or request the matching input bundle from the training-machine owner. Extract the USGS archives under `data/interim/harvey` using the exact paths in `config.yaml`; place NOAA files under `data/raw/noaa-ghcnd`. `build_features.py` downloads/caches 3DEP and NLCD through network services. Endpoint availability and changed terrain products can affect reproduction.

Alternatively, transfer the nine `grid_*.json`, `labels_*.npz`, and `features_*.npz` files from the owner's `data/processed/flood` directory to that same repository-relative directory, then run training. These large inputs are not committed. Preserve their source metadata when transferring.

Generated model, raster, preview image, and log files are ignored. Only the small evaluation report, metadata, and checksum are versioned. A rerun may overwrite them; review any changed metrics before committing. The report records the completed v1 run, not a claim that a fresh download was reproduced by this commit.
