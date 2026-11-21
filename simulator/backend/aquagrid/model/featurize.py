"""Feature assembly shared by training and inference (guarantees identical columns)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..pipeline.features import STATIC_FEATURES

SCENARIO_FEATURES = ["rain", "duration", "surge", "clog"]
DERIVED_FEATURES = ["storm_total", "wl_minus_elev", "wl_minus_thresh"]
FEATURES = STATIC_FEATURES + SCENARIO_FEATURES + DERIVED_FEATURES

FEATURE_LABELS = {
    "elev": "Elevation",
    "slope_pct": "Slope",
    "twi": "Wetness index (TWI)",
    "hand": "Height above drainage",
    "tpi": "Local low spot (TPI)",
    "sink_depth": "Depression depth",
    "sea_thresh": "Sea connection level",
    "dist_water": "Distance to water",
    "dist_sea": "Distance to bay/ocean",
    "imperv": "Impervious cover",
    "road_class": "Road class",
    "is_bridge": "Bridge",
    "rain": "Rain intensity",
    "duration": "Storm duration",
    "surge": "Storm surge",
    "clog": "Drain clog",
    "storm_total": "Storm total rain",
    "wl_minus_elev": "Water level - elevation",
    "wl_minus_thresh": "Water level - sea connection",
}


def static_matrix(f: pd.DataFrame) -> np.ndarray:
    return f[STATIC_FEATURES].to_numpy(dtype=np.float32)


_I_ELEV = STATIC_FEATURES.index("elev")
_I_THRESH = STATIC_FEATURES.index("sea_thresh")


def assemble(static: np.ndarray, rain, duration, surge, clog, base_wl: float, out: np.ndarray | None = None):
    """[static | scenario | derived] as float32. Scenario args: scalars or per-row arrays."""
    n, k = static.shape
    X = out if out is not None else np.empty((n, len(FEATURES)), dtype=np.float32)
    X[:, :k] = static
    wl = base_wl + np.asarray(surge, dtype=np.float32)
    X[:, k] = rain
    X[:, k + 1] = duration
    X[:, k + 2] = surge
    X[:, k + 3] = clog
    X[:, k + 4] = np.asarray(rain, dtype=np.float32) * np.asarray(duration, dtype=np.float32)
    X[:, k + 5] = wl - static[:, _I_ELEV]
    X[:, k + 6] = wl - static[:, _I_THRESH]
    return X


def inundation_index(depth: np.ndarray) -> np.ndarray:
    """Flood Inundation Index in [0, 1]: 0.1 m -> 0.33, 0.3 m -> 0.70, 0.6 m -> 0.91."""
    return 1.0 - np.exp(-np.clip(depth, 0, None) / 0.25)
