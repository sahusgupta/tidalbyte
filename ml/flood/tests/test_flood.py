import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from ml.flood.build_labels import FT_TO_M, aggregate  # noqa: E402
from ml.flood.common import FEATURES, GridSpec, idw, load_cfg, p  # noqa: E402
from ml.flood.train_flood import hand_baseline_predict, scores  # noqa: E402


def _write_raster(path, arr, x0, y0, res, nodata):
    import rasterio
    from rasterio.transform import from_origin

    with rasterio.open(path, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1, dtype="float32",
                       crs="EPSG:6579", transform=from_origin(x0, y0, res, res), nodata=nodata) as ds:
        ds.write(arr.astype("float32"), 1)


def test_aggregate_converts_feet_and_counts_dry_as_zero(tmp_path):
    nod = -3.4e38
    a = np.full((40, 40), nod, dtype=np.float32)  # 2 m pixels -> 80 m x 80 m
    a[:20, :20] = 1.0  # 1 ft deep in the top-left quarter (= 2x2 cells of 20 m)
    a[:5, 20:30] = 2.0  # 2 ft over half of the next cell (5 of 10 pixel rows)
    src = tmp_path / "d.tif"
    _write_raster(src, a, 1000.0, 2000.0, 2.0, nod)
    g = GridSpec(1000.0, 2000.0, 20.0, 4, 4, 6579)
    s, n, wet = aggregate(src, g, 6579, strip=7)
    depth = s / n
    assert np.allclose(n, 100)
    assert np.allclose(depth[:2, :2], FT_TO_M)
    assert np.isclose(depth[0, 2], 2.0 * FT_TO_M * 0.5) and np.isclose(wet[0, 2] / n[0, 2], 0.5)
    assert np.allclose(depth[2:, :], 0)


def test_scores_csi():
    obs = np.array([0.0, 0.0, 0.5, 1.0, 0.2])
    pred = np.array([0.0, 0.4, 0.6, 0.0, 0.3])
    s = scores(obs, pred)
    # >15 cm: obs wet = {2,3,4}; pred wet = {1,2,4} -> hits 2, misses 1, false alarms 1
    assert s["csi_15cm"] == 0.5 and s["pod_15cm"] == round(2 / 3, 4) and s["far_15cm"] == round(1 / 3, 4)


def test_hand_baseline_shapes():
    df = pd.DataFrame({"hand": [0.0, 1.0, 5.0, np.nan], "log_stream_up_km2": [2.0, 1.0, 0.0, 0.0]})
    out = hand_baseline_predict(dict(h=2.0, a=1.0, b=1.0), df)
    assert list(out["hand_threshold"]) == [2.0, 1.0, 0.0, 0.0]
    assert list(out["hand_river_size"]) == [3.0, 1.0, 0.0, 0.0]


def test_idw_exact_shape_and_bounds():
    g = GridSpec(0.0, 1000.0, 20.0, 53, 37, 6579)
    out = idw(g, np.array([100.0, 900.0]), np.array([100.0, 900.0]), np.array([10.0, 50.0]))
    assert out.shape == (37, 53) and 10 <= out.min() and out.max() <= 50


@pytest.fixture(scope="module")
def meta():
    cfg = load_cfg()
    f = p(cfg["paths"]["artifacts"]) / "flood_model_metadata.json"
    if not f.exists():
        pytest.skip("flood model not trained yet")
    metadata = json.loads(f.read_text())
    if not p(metadata["artifact"]["path"]).exists():
        pytest.skip("retrieve the flood artifact as documented in ml/flood/README.md")
    return cfg, metadata


def test_artifact_matches_metadata(meta):
    cfg, m = meta
    digest = hashlib.sha256(p(m["artifact"]["path"]).read_bytes()).hexdigest()
    assert digest == m["artifact"]["sha256"]
    assert set(m["features"]) <= set(FEATURES)


def test_holdout_is_the_harris_county_reach(meta):
    cfg, m = meta
    ev = m["evaluation"]
    assert ev["holdout_group"] == cfg["holdout_group"] == "san_jacinto"
    folds = ev["cv"]["folds"] if "folds" in ev["cv"] else ev["cv"][ev["chosen_feature_set"]]["folds"]
    assert cfg["holdout_group"] not in folds
