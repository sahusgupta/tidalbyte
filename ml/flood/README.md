# Harvey peak-flood model (v1 default, v2 alternative)

This is a Hurricane Harvey 2017 **peak-flood depth reconstruction model with spatial holdout evaluation**, not a validated interactive storm simulator. It predicts mean depth in a 20 m cell. It does not produce a storm timeline, validate arbitrary rainfall sliders, estimate building damage, or certify road safety. No web/API integration is included.

The milestone covers nine mapped reaches in four basin groups. Feature selection uses leave-one-basin-out validation on the Brazos, San Bernard, and coastal groups. San Jacinto is the held-out test reach. Each saved bundle contains a held-out model (`holdout_model` / `holdout_models`) and a deployment refit on all four groups. Use the held-out model when reproducing the San Jacinto scores; the refit has seen San Jacinto training data.

## Which model to use

There are two models:
- **v1** (`flood_model.joblib`) is the **default for emergency routing**. It is a single gradient-boosted regressor. The project owner chose it on 2026-11-21 because missing a flooded road is worse than an unnecessary detour.
- **v2** (`flood_model_v2.joblib`) is a two-part model: a wet/dry classifier plus depth given wet, with a cross-validation-chosen probability threshold. It has fewer false alarms but misses more flooding, so it is kept for cleaner flood-map display.

Held-out San Jacinto results, scored on every labeled land cell:

| Model | CSI >15 cm | Flooding caught (POD) | False alarms (FAR) | Depth MAE | MAE on wet cells |
|---|---:|---:|---:|---:|---:|
| **v1** | 0.378 | 0.777 | 0.576 | 0.717 m | 1.800 m |
| v2 | 0.382 | 0.590 | 0.481 | 0.712 m | 1.754 m |
| HAND + river-size baseline | 0.366 | 0.702 | 0.567 | 0.929 m | 1.861 m |
| HAND threshold baseline | 0.297 | 0.622 | 0.637 | 1.142 m | 2.081 m |

Caveats:
- False alarms remain substantial.
- v2 was developed after seeing v1's San Jacinto results, so that reach is no longer a fully untouched test. v2's settings were chosen only on the other basins.
- Surveyed marks also inform the source maps, so comparing against them is not an independent validation.
- No other storm is held out.
- Brays, Buffalo, and White Oak bayous are outside this evaluation's coverage.

Details: [evaluation](artifacts/evaluation_report.md), [v1 metadata](artifacts/flood_model_metadata.json), [v2 metadata](artifacts/flood_model_metadata_v2.json), [sources](../../data/provenance/flood_sources.md).

## Use it

```python
from ml.flood.inference import FloodDepthModel
model = FloodDepthModel.load()                     # v1; verifies the SHA-256 recorded in metadata
depth_m = model.predict(features_df)               # columns = model.features (see ml/flood/common.py)
blocked = FloodDepthModel.impassable(depth_m, "ambulance")   # sedan 0.15 m, ambulance 0.30 m, truck 0.75 m
alt = FloodDepthModel.load("v2")                   # alternative for map display
```

## Retrieve the saved models

There is currently **no published artifact download URL**. Obtain the model files from the training-machine owner by direct file transfer. On the originating laptop they are:

```text
/Users/sparsh/tidalHackathon/ml-work/ml/flood/artifacts/flood_model.joblib      (v1, default)
/Users/sparsh/tidalHackathon/ml-work/ml/flood/artifacts/flood_model_v2.joblib   (v2, alternative)
```

From the repository root on that same laptop:

```sh
mkdir -p ml/flood/artifacts
cp /Users/sparsh/tidalHackathon/ml-work/ml/flood/artifacts/flood_model.joblib ml/flood/artifacts/
cp /Users/sparsh/tidalHackathon/ml-work/ml/flood/artifacts/flood_model_v2.joblib ml/flood/artifacts/
```

On another machine, ask the owner to transfer those exact files, or use this SSH template after replacing `TRAINING_USER` and `TRAINING_HOST` with the owner's reachable SSH account:

```sh
mkdir -p ml/flood/artifacts
scp TRAINING_USER@TRAINING_HOST:/Users/sparsh/tidalHackathon/ml-work/ml/flood/artifacts/flood_model.joblib ml/flood/artifacts/
scp TRAINING_USER@TRAINING_HOST:/Users/sparsh/tidalHackathon/ml-work/ml/flood/artifacts/flood_model_v2.joblib ml/flood/artifacts/
```

Keep the file names exactly as above. Verify the transferred bytes against the committed checksums before loading:

```sh
(cd ml/flood/artifacts && shasum -a 256 -c flood_model.sha256 flood_model_v2.sha256)
```

`FloodDepthModel.load()` repeats this check against the metadata. Joblib loading deserializes Python objects, so only load the trusted team artifacts. The checksum checks file identity; it does not make an unknown artifact safe.

## Environment and tests

Use a separate Python 3.13 environment for this workstream; do not replace the application dependency lock. Direct dependency versions are captured in `requirements.txt`; transitive dependencies are not fully locked.

```sh
python3.13 -m venv .venv-flood
.venv-flood/bin/python -m pip install -r ml/flood/requirements.txt
.venv-flood/bin/python -m pytest ml/flood/tests -q
```

Five tests run without the model files. Four artifact-dependent tests skip until the files are retrieved. All nine should pass after retrieval. Training uses scikit-learn on the CPU, not CUDA.

## Rebuild from source data

From the repository root:

```sh
.venv-flood/bin/python -I ml/flood/build_labels.py
.venv-flood/bin/python -I ml/flood/build_features.py
.venv-flood/bin/python -I ml/flood/train_flood.py      # v1 -> flood_model.joblib
.venv-flood/bin/python -I ml/flood/train_flood_v2.py   # v2 -> flood_model_v2.joblib (re-scores v1 for comparison)
```

These commands require data preparation first. Raw downloads and acquisition scripts for all sources are **not bundled**.
- Obtain the USGS release archives and NOAA daily precipitation described in the provenance document, or request the matching input bundle from the training-machine owner.
- Extract the USGS archives under `data/interim/harvey` using the exact paths in `config.yaml`.
- Place NOAA files under `data/raw/noaa-ghcnd`.
- `build_features.py` downloads and caches 3DEP and NLCD through network services. Endpoint availability and changes to the terrain products can affect reproduction.

Alternatively, transfer the nine `grid_*.json`, `labels_*.npz`, and `features_*.npz` files from the owner's `data/processed/flood` directory to that same repository-relative directory, then run training. These large inputs are not committed. Preserve their source metadata when transferring.

Generated model, raster, preview image, and log files are ignored. Only the small evaluation report, the two metadata files, and the checksums are versioned. A rerun may overwrite them; review any changed metrics before committing. The report records the completed v1 and v2 runs, not a claim that this commit reproduced a fresh download.
