"""The hosted numerical archive must give the same storm and pin route as the prepared tables."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import pandas as pd
import shapely
import xgboost as xgb

from aquagrid.engine import RegionEngine
from aquagrid.model.featurize import FEATURES, STATIC_FEATURES
from aquagrid.pipeline.dem import Grid, save_grid
from aquagrid.runtime_data import export_runtime_bundle


class ReleaseInputsTest(unittest.TestCase):
    def test_numeric_release_preserves_storm_overlay_and_pin_route(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        prepared, release = root / "prepared", root / "release"
        (prepared / "model").mkdir(parents=True)
        (prepared / "static").mkdir()
        grid = Grid(14, 985218, 1733180, 16, 5, 4, 132.7)
        save_grid(grid, prepared / "grid.json")
        lon, lat = grid.cell_centers_lonlat()
        nodes = np.array([[lon[1, c], lat[1, c]] for c in (0, 2, 4)])
        np.save(prepared / "nodes.npy", nodes)
        np.save(prepared / "building_node.npy", [[1, 4.1]])
        edges = pd.DataFrame({
            "length_m": [260.0, 270.0], "name": ["A Street", None], "cls": [5, 6],
            "ui": [0, 1], "vi": [1, 2], "time_s": [25.0, 27.0],
            "geometry": shapely.to_wkb(shapely.linestrings(np.array([nodes[:2], nodes[1:]]))),
        })
        edges.to_parquet(prepared / "edges.parquet")
        rows, cols = np.indices(lon.shape)
        for kind, n, extra in [
            ("edges", 2, {"lon": nodes[:2, 0], "lat": nodes[:2, 1]}),
            ("buildings", 1, {"lon": nodes[1:2, 0], "lat": nodes[1:2, 1]}),
            ("cells", lon.size, {"row": rows.ravel(), "col": cols.ravel()}),
        ]:
            pd.DataFrame({**{key: np.zeros(n) for key in STATIC_FEATURES}, **extra}).to_parquet(
                prepared / f"feat_{kind}.parquet")
        parent = np.where(rows == 0, -1, (rows - 1) * grid.width + cols).ravel()
        np.savez(prepared / "rasters.npz", flow_parent=parent, acc=grid.height - rows)
        meta = dict(hospitals=[dict(id="h", name="Hospital", lon=nodes[0, 0], lat=nodes[0, 1], node=0)],
                    neighborhoods=[dict(id="n", name="East", lon=nodes[2, 0], lat=nodes[2, 1], node=2)])
        (prepared / "static/meta.json").write_text(json.dumps(meta))
        (prepared / "model/metrics.json").write_text('{"n_trees":2}')
        features = np.zeros((16, len(FEATURES)), dtype=np.float32)
        features[:, FEATURES.index("rain")] = np.arange(16) * 10
        model = xgb.train({"max_depth": 2, "nthread": 1},
                          xgb.DMatrix(features, label=np.linspace(0, 0.5, 16)), num_boost_round=2)
        model.save_model(prepared / "model/flood_xgb.ubj")

        export_runtime_bundle(prepared, release)
        for filename in ("model/flood_xgb.ubj", "model/metrics.json", "grid.json", "static/meta.json"):
            (release / filename).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(prepared / filename, release / filename)
        region = dict(id="example", bbox=grid.bounds_lonlat(), base_water_level=0.3)
        local = RegionEngine(SimpleNamespace(**region, out_dir=prepared))
        with patch("pandas.read_parquet", side_effect=AssertionError("host attempted to load Parquet")):
            hosted = RegionEngine(SimpleNamespace(**region, out_dir=release))
        np.testing.assert_array_equal(local.static, hosted.static)
        self.assertEqual(hosted.edge_name.tolist(), ["A Street", None])
        for event in (None, dict(kind="flood", track=nodes[:2].tolist(), radius_km=0.2, progress=0.5)):
            req = dict(rain=120, duration=6, surge=0, clog=0.5, dest_lonlat=nodes[2].tolist(), event=event)
            before, after = local.simulate(**req), hosted.simulate(**req)
            del before["timing_ms"], after["timing_ms"]
            self.assertEqual(before, after)
            self.assertEqual(after["route"]["dry"]["n_edges"], 2)
            self.assertTrue(after["overlay"].startswith("data:image/png;base64,"))
