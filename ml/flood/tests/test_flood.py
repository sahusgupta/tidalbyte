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
    art = p(cfg["paths"]["artifacts"])
    f = art / "flood_model_metadata.json"
    if not f.exists():
        pytest.skip("flood model not trained yet")
    m = json.loads(f.read_text())
    if not p(m["artifact"]["path"]).exists():
        pytest.skip("model file not present (weights are not in Git; see ml/flood/README.md to retrieve them)")
    return cfg, m


@pytest.fixture(scope="module")
def both_models(meta):
    if not (p("ml/flood/artifacts") / "flood_model_v2.joblib").exists():
        pytest.skip("v2 model file not present (see ml/flood/README.md)")
    return meta


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


def test_connectivity_gate_drops_isolated_specks():
    from ml.flood.train_flood_v2 import gate

    prob = np.zeros((7, 7), np.float32)
    dgw = np.full((7, 7), 1.0, np.float32)
    streams = np.zeros((7, 7), bool)
    log_up = np.zeros((7, 7), np.float32)
    streams[3, 0:3] = True
    log_up[3, 0:3] = 2.5  # a 300 km2 river along the left of row 3
    prob[2:5, 0:3] = 0.9  # flooding beside the river
    prob[0, 6] = 0.9  # isolated speck far from any river
    out = gate(prob, dgw, 0.5, 2.0, streams, log_up)
    assert out[2:5, 0:3].min() == 1.0 and out[0, 6] == 0.0
    assert gate(prob, dgw, 0.5, None, streams, log_up)[0, 6] == 1.0  # no filter keeps it


def test_inference_default_is_v1_and_alternative_loads(both_models):
    from ml.flood.inference import FloodDepthModel

    v1 = FloodDepthModel.load()
    v2 = FloodDepthModel.load("v2")
    assert v1.variant == "v1" and v1.metadata["selection"]["status"] == "default"
    assert v1.metadata["selection"]["selectedFor"] == "emergency routing"
    assert v2.metadata["selection"]["status"] == "alternative"
    X = pd.DataFrame({f: np.zeros(3, np.float32) for f in FEATURES})
    X["hand"] = [0.0, 3.0, 30.0]
    X["elev"] = [5.0, 10.0, 60.0]
    X["rain_mm"] = 600.0
    for m in (v1, v2):
        d = m.predict(X)
        assert d.shape == (3,) and (d >= 0).all()
    assert list(FloodDepthModel.impassable(np.array([0.1, 0.31, 0.8]), "ambulance")) == [False, True, True]


def test_inference_rejects_bad_inputs(meta):
    from ml.flood.inference import FloodDepthModel

    m = FloodDepthModel.load()
    with pytest.raises(ValueError):
        m.predict(pd.DataFrame({"hand": [1.0]}))
    with pytest.raises(ValueError):
        FloodDepthModel.impassable(np.array([0.2]), "boat")
    with pytest.raises(ValueError):
        FloodDepthModel.load("v9")
