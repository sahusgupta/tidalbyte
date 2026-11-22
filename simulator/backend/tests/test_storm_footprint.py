import base64
import os
import tempfile
import unittest
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from types import SimpleNamespace
from unittest.mock import patch
from weakref import WeakValueDictionary

import numpy as np
from fastapi import HTTPException
from pydantic import ValidationError

from aquagrid import api, engine
from aquagrid.engine import RegionEngine, Scenario
from aquagrid.model.featurize import FEATURES, STATIC_FEATURES
from aquagrid.pipeline.dem import Grid
from aquagrid.pipeline.hydrology import flow_accumulation, priority_flood
from aquagrid.routing import Router
from aquagrid.storm import Drainage, StormGrid, flow_parent, rainfall_swath, traveled_track


class SwathTests(unittest.TestCase):
    def test_hosted_worker_keeps_two_warm_regions_and_reuses_evicted_active_instances(self):
        class TestEngine:
            def __init__(self, region):
                self.region = region

        with (patch.object(engine, "_VERCEL_WORKER", True), patch.object(engine, "_ENGINES", OrderedDict()),
              patch.object(engine, "_LIVE_ENGINES", WeakValueDictionary()),
              patch.object(engine, "RegionEngine", side_effect=TestEngine) as load):
            first, second, third = list(engine.REGIONS)[:3]
            active = engine.get_engine(first)
            engine.get_engine(second)
            engine.get_engine(third)
            self.assertEqual(list(engine._ENGINES), [second, third])
            with ThreadPoolExecutor(max_workers=4) as threads:
                self.assertTrue(all(item is active for item in threads.map(engine.get_engine, [first] * 8)))
            self.assertEqual(load.call_count, 3)
            self.assertEqual(list(engine._ENGINES), [third, first])

    def test_legacy_drainage_cache_is_reused_only_for_the_same_rasters(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "rasters.npz"
            elev = np.arange(16, dtype=np.float32).reshape(4, 4)
            water = np.zeros((4, 4), dtype=bool)
            np.savez(path, elev=elev, water=water)
            with np.load(path) as rasters:
                first = flow_parent(path, rasters, prepare=True)
                with patch("aquagrid.storm.priority_flood", side_effect=AssertionError("cached tree not used")):
                    np.testing.assert_array_equal(flow_parent(path, rasters), first)
            old_time = path.stat().st_mtime_ns
            np.savez(path, elev=elev[::-1].copy(), water=water)
            os.utime(path, ns=(old_time + 2_000_000_000, old_time + 2_000_000_000))
            with np.load(path) as rasters:
                self.assertFalse(np.array_equal(flow_parent(path, rasters), first))

    def test_track_progress_uses_distance_and_handles_repeated_waypoints(self):
        track = np.array([[0, 0], [2, 0], [2, 0], [2, 8]])
        np.testing.assert_array_equal(traveled_track(track, 0), [[0, 0]])
        np.testing.assert_array_equal(traveled_track(track, 0.6), [[0, 0], [2, 0], [2, 0], [2, 4]])
        np.testing.assert_array_equal(traveled_track(track, 1), track)
        early = rainfall_swath((10, 10), traveled_track(track, 0.2), 2)
        late = rainfall_swath((10, 10), track, 2)
        self.assertEqual(early[2, 7], 0)
        self.assertEqual(late[2, 7], 1)
        self.assertAlmostEqual(late[3, 7], 0.5)
        self.assertEqual(late[4, 7], 0)

    def test_upstream_rain_reaches_outlet_without_crossing_drainage_divide(self):
        # Four cells above a confluence drain to 0. The adjacent third branch ends at 5.
        parent = np.array([-1, 0, 1, 1, 2, -1, 5])
        acc = np.array([5, 4, 2, 1, 1, 2, 1])
        flow = Drainage(parent, acc)
        effective = flow.effective_rain(np.array([0, 0, 0, 0, 1, 0, 0], dtype=np.float32))
        np.testing.assert_allclose(effective, [0.2, 0.25, 0.5, 0, 1, 0, 0])

    def test_flow_traces_on_a_ridge_follow_depression_spills_to_an_outlet(self):
        elev = np.array([[1, 7, 7, 7, 7], [1, 1, 7, 1, 1], [1, 2, 8, 1, 1], [1, 2, 8, 1, 1]])
        outlets = np.zeros_like(elev, dtype=bool)
        outlets[0, 0] = outlets[-1, -1] = True
        fill, parent, order = priority_flood(elev, outlets)
        acc = flow_accumulation(parent, order)
        grid = Grid(14, 985218, 1733180, 2, 5, 4, 16.5)
        lon, lat = grid.cell_centers_lonlat()
        asset = np.array([[lon[3, 1], lat[3, 1]]])
        hood = [dict(name="West", lon=asset[0, 0], lat=asset[0, 1])]
        storm = StormGrid(grid, parent, acc, asset, np.nonzero(~outlets), hood)
        path = storm.trace(np.array([[3, 1]]), 0.2)[0]
        rc = np.rint(grid.lonlat_to_rc(*np.asarray(path).T)).astype(int)
        self.assertTrue(outlets[tuple(rc[:, -1])])
        self.assertTrue((rc[1] < 2).all())
        self.assertTrue((np.diff(fill[tuple(rc)]) <= 0).all())

    def test_bad_coordinates_and_sizes_are_rejected_before_inference(self):
        region = SimpleNamespace(bbox=(-96, 29, -95, 30))
        event = dict(kind="flood", track=[[-95.5, 29.5]], radius_km=1)
        api._validate_event_bounds(api.SimRequest(event=event), region)
        for overrides in [dict(track=[]), dict(track=event["track"] * 9), dict(track=[[1, 2, 3]]),
                          dict(radius_km=0), dict(radius_km=float("inf")), dict(progress=1.1), dict(kind="tornado")]:
            with self.subTest(overrides=overrides), self.assertRaises(ValidationError):
                api.SimRequest(event={**event, **overrides})
        for coords in [[-96.001, 29], [-95.5, float("nan")]]:
            with self.assertRaises(HTTPException) as error:
                api._validate_event_bounds(api.SimRequest(event={**event, "track": [coords]}), region)
            self.assertEqual(error.exception.status_code, 422)


class RainDepth:
    """Deterministic test surrogate; everything else uses the actual engine and road router."""

    def inplace_predict(self, X, iteration_range):
        return X[:, FEATURES.index("rain")] / 200 + X[:, FEATURES.index("surge")] / 2


class EventRoutingTests(unittest.TestCase):
    def setUp(self):
        grid = Grid(14, 985218, 1733180, 16, 11, 9, 132.7)
        lon, lat = grid.cell_centers_lonlat()
        self.xy = lambda r, c: [float(lon[r, c]), float(lat[r, c])]
        x = self.engine = RegionEngine.__new__(RegionEngine)
        x.region = SimpleNamespace(id="test-inland", base_water_level=0.3)
        x.grid = grid
        x.region.bbox = grid.bounds_lonlat()
        rows, cols = np.indices(lon.shape)
        parent = np.where(rows == 0, -1, (rows - 1) * grid.width + cols).ravel()
        x.edge_len = np.array([700.0, 900.0, 950.0])
        x.edge_name = np.array(["A Street", "B Street", "C Street"])
        nodes = np.array([self.xy(2, 1), self.xy(2, 8), self.xy(7, 4)])
        x.router = Router([0, 0, 2], [1, 2, 1], [50, 90, 95], x.edge_len, nodes,
                          [nodes[[0, 1]], nodes[[0, 2]], nodes[[2, 1]]])
        x.bld_node = np.array([0, 1])
        x.meta = dict(hospitals=[dict(id="h", name="Hospital", lon=nodes[0, 0], lat=nodes[0, 1], node=0)],
                      neighborhoods=[dict(id="d", name="East", lon=nodes[1, 0], lat=nodes[1, 1], node=1),
                                     dict(id="s", name="South", lon=nodes[2, 0], lat=nodes[2, 1], node=2)])
        x.pois = {p["id"]: p for p in x.meta["hospitals"] + x.meta["neighborhoods"]}
        asset_xy = np.array([self.xy(2, 4), self.xy(6, 3), self.xy(6, 7), self.xy(2, 4), self.xy(7, 4)])
        x.cell_rc = (rows.ravel(), cols.ravel())
        x.storm_grid = StormGrid(grid, parent, (grid.height - rows).ravel(), asset_xy, x.cell_rc, x.meta["neighborhoods"])
        x.splits = np.array([0, 3, 5, 5 + lon.size])
        x.static = np.zeros((x.splits[-1], len(STATIC_FEATURES)), dtype=np.float32)
        x.X = np.empty((x.splits[-1], len(FEATURES)), dtype=np.float32)
        x.booster = RainDepth()
        x.n_trees = 1
        x._pred_cache = OrderedDict()
        x._prediction_lock = Lock()
        x._dry_cache = {}
        x._dry_routes = OrderedDict()
        x._route_lock = Lock()
        x._node_index = None
        self.event = dict(kind="flood", track=[self.xy(2, 4)], radius_km=0.2)

    def run_scenario(self, rain=150, surge=0, **kwargs):
        return self.engine.simulate(rain, 4, surge, 0.1, dest_lonlat=self.xy(2, 8), overlay=False, **kwargs)

    def test_moving_storm_moves_flooded_building_and_road_and_restores_pin_route(self):
        hit = self.run_scenario(event=self.event)
        miss = self.run_scenario(event={**self.event, "track": [self.xy(7, 9)]})
        self.assertEqual(hit["route"]["status"], "detour")
        self.assertEqual(hit["route"]["current"]["n_edges"], 2)
        self.assertEqual(hit["edges"], [75, 0, 0])
        self.assertEqual(hit["buildings"], [75, 0])
        self.assertEqual(hit["spatial"]["areas"][0]["blocked_road_km"], 0.7)
        self.assertEqual(hit["spatial"]["areas"][0]["affected_buildings"], 1)
        self.assertEqual(miss["route"]["status"], "clear")
        self.assertEqual(miss["route"]["current"]["n_edges"], 1)
        self.assertEqual(miss["edges"], [0, 0, 0])
        self.assertEqual(miss["buildings"], [0, 0])
        self.assertNotEqual(hit["spatial"]["flow_paths"], miss["spatial"]["flow_paths"])

    def test_closure_bits_match_routing_even_if_depth_rounds_to_clearance(self):
        clearance = self.run_scenario(rain=0)["route"]["clearance_m"]
        result = self.run_scenario(rain=(clearance + 0.001) * 200, event=self.event)
        self.assertEqual(result["edges"][0], round(clearance * 100))
        self.assertEqual(base64.b64decode(result["closed_edges_b64"]), bytes([1]))
        self.assertEqual(result["route"]["status"], "detour")

    def test_null_event_keeps_uniform_legacy_shape_and_dry_has_no_flow(self):
        uniform = self.run_scenario()
        self.assertEqual(uniform["edges"], [75, 75, 75])
        self.assertNotIn("spatial", uniform)
        self.assertNotIn("event", uniform["scenario"])
        self.assertEqual(self.run_scenario(rain=0, event=self.event)["spatial"]["flow_paths"], [])
        uniform_key = Scenario.make(150, 4, 0, 0.1)
        self.assertIs(self.engine.predict(uniform_key), self.engine.predict(uniform_key))

    def test_hosted_predictions_bound_memory_and_refresh_recency(self):
        with patch.object(engine, "_VERCEL_WORKER", True):
            storms = [Scenario.make(i, 4, 0, 0.1) for i in range(10)]
            for sc in storms[:8]:
                self.engine.predict(sc)
            held = self.engine.predict(storms[0])
            self.engine.predict(storms[8])
            self.engine.predict(storms[9])
            self.assertEqual(len(self.engine._pred_cache), 8)
            self.assertNotIn(storms[1], self.engine._pred_cache)
            self.assertIs(self.engine.predict(storms[0]), held)

    def test_only_estuarine_hurricane_uses_coastal_surge(self):
        hurricane = {**self.event, "kind": "hurricane"}
        self.assertEqual(self.run_scenario(rain=0, surge=1, event=hurricane)["edges"], [0, 0, 0])
        self.engine.region.id = "ship-channel"
        self.engine._pred_cache.clear()
        # The first street is protected by both its elevation and its coastal spill threshold.
        self.engine.static[0, FEATURES.index("elev")] = 4
        self.engine.static[0, FEATURES.index("sea_thresh")] = 5
        self.assertEqual(self.run_scenario(rain=0, surge=1, event=hurricane)["edges"], [0, 130, 130])
        self.assertEqual(self.run_scenario(rain=0, surge=1, event=self.event)["edges"], [0, 0, 0])


if __name__ == "__main__":
    unittest.main()
