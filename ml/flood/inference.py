"""Flood-depth inference for routing and maps.

    from ml.flood.inference import FloodDepthModel
    model = FloodDepthModel.load()            # v1: default for emergency routing (higher recall)
    depth_m = model.predict(features_df)      # columns = model.features (see ml/flood/common.py)
    blocked = model.impassable(depth_m, "ambulance")

`FloodDepthModel.load("v2")` gives the alternative with fewer false alarms (flood-map display).
Features come from ml/flood/common.py (3DEP terrain + pysheds hydrology, NLCD 2016, NOAA rainfall).
The model was trained only on Hurricane Harvey (2017) flood documentation; see the limitations in the
metadata before showing predictions for other storms or rainfall amounts.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ml.flood.common import p  # noqa: E402

VARIANTS = {
    "v1": ("ml/flood/artifacts/flood_model.joblib", "ml/flood/artifacts/flood_model_metadata.json"),
    "v2": ("ml/flood/artifacts/flood_model_v2.joblib", "ml/flood/artifacts/flood_model_metadata_v2.json"),
}
# Safe wading depth before a vehicle should not enter the water (matches the web console's vehicle picker).
CLEARANCE_M = {"sedan": 0.15, "ambulance": 0.30, "truck": 0.75}
WET_M = 0.15


class FloodDepthModel:
    def __init__(self, art: dict, metadata: dict, variant: str):
        self.art, self.metadata, self.variant = art, metadata, variant
        self.features: list[str] = art["features"]
        self.version: str = metadata["modelVersion"]

    @classmethod
    def load(cls, variant: str = "v1", verify: bool = True) -> "FloodDepthModel":
        if variant not in VARIANTS:
            raise ValueError(f"unknown variant {variant!r}; choose from {sorted(VARIANTS)}")
        art_path, meta_path = (p(x) for x in VARIANTS[variant])
        meta = json.loads(meta_path.read_text())
        if verify and hashlib.sha256(art_path.read_bytes()).hexdigest() != meta["artifact"]["sha256"]:
            raise RuntimeError(f"{art_path.name} does not match the sha256 recorded in {meta_path.name}")
        return cls(joblib.load(art_path), meta, variant)

    def _frame(self, X) -> pd.DataFrame:
        df = X if isinstance(X, pd.DataFrame) else pd.DataFrame({f: np.ravel(X[f]) for f in self.features})
        missing = [f for f in self.features if f not in df.columns]
        if missing:
            raise ValueError(f"missing features: {missing}")
        return df[self.features]

    def predict(self, X) -> np.ndarray:
        """Water depth (m) per row/cell. X: DataFrame or dict of arrays keyed by feature name."""
        df = self._frame(X)
        if self.variant == "v1":
            return np.clip(self.art["model"].predict(df), 0, None).astype(np.float32)
        prob = self.art["classifier"].predict_proba(df)[:, 1]
        depth = np.clip(self.art["regressor"].predict(df), WET_M, None)
        # v2 chose no connectivity filter in CV, so gating is per cell
        return np.where(prob > self.art["tau"], depth, 0.0).astype(np.float32)

    @staticmethod
    def impassable(depth_m: np.ndarray, vehicle: str = "ambulance") -> np.ndarray:
        if vehicle not in CLEARANCE_M:
            raise ValueError(f"unknown vehicle {vehicle!r}; choose from {sorted(CLEARANCE_M)}")
        return np.asarray(depth_m) > CLEARANCE_M[vehicle]

    def describe(self) -> dict:
        m = self.metadata
        ev = m["evaluation"]
        hold = ev.get("holdout_all_labeled_cells", {}).get("model") or ev["holdout"].get("model") \
            or ev["holdout"].get("model_v2")
        return dict(modelVersion=self.version, variant=self.variant, selection=m.get("selection"),
                    target=m["target"], features=self.features, holdoutGroup=ev["holdout_group"],
                    holdoutMetrics=hold, limitations=m["limitations"],
                    sources="data/provenance/flood_sources.md")
