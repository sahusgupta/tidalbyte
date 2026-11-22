"""Inference engine: storm scenario -> flood depth on every road, building and ground cell,
plus impact statistics and flood-aware emergency routing."""
from __future__ import annotations

import base64
import io
import json
import os
import time
from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock
from weakref import WeakValueDictionary

import numpy as np
import pandas as pd
import xgboost as xgb
from PIL import Image

from .catalog import VEHICLES, public_meta
from .config import REGIONS, Region
from .model.featurize import FEATURES, assemble, inundation_index
from .model.simulator import MAX_DEPTH_M, coastal_depth
from .pipeline.dem import load_grid
from .routing import WET_M, NodeIndex, Router, edge_weights
from .runtime_data import load_inputs
from .storm import StormEvent, StormGrid

FLOODED_M = 0.15  # "flooded" for statistics: water over the curb / doorstep
_VERCEL_WORKER = os.environ.get("VERCEL") == "1"


@dataclass(frozen=True)
class Scenario:
    rain: float
    duration: float
    surge: float
    clog: float
    event: StormEvent | None = None

    @classmethod
    def make(cls, rain, duration, surge, clog, event=None):
        # quantise so near-identical slider positions share a cache entry
        return cls(round(float(np.clip(rain, 0, 250)), 1), round(float(np.clip(duration, 0.1, 48)), 2),
                   round(float(np.clip(surge, 0, 4)), 2), round(float(np.clip(clog, 0, 1)), 2),
                   StormEvent.from_dict(event) if event is not None else None)


def _depth_lut():
    """RGBA lookup for depth in 2 cm steps (index 0..255): shallow cyan -> deep navy."""
    d = np.arange(256) * 0.02
    stops = np.array([
        [0.00, 120, 220, 255, 0],
        [0.03, 120, 220, 255, 70],
        [0.15, 70, 175, 255, 150],
        [0.30, 40, 130, 245, 180],
        [0.60, 30, 90, 220, 205],
        [1.20, 25, 55, 175, 225],
        [2.50, 20, 30, 120, 240],
        [5.10, 15, 20, 80, 250],
    ])
    lut = np.stack([np.interp(d, stops[:, 0], stops[:, i]) for i in range(1, 5)], axis=1)
    lut[0] = 0
    return lut.astype(np.uint8)


class RegionEngine:
    def __init__(self, region: Region):
        t0 = time.time()
        self.region = region
        out = region.out_dir
        self.grid = load_grid(out / "grid.json")
        self.meta = json.loads((out / "static" / "meta.json").read_text())
        self.metrics = json.loads((out / "model" / "metrics.json").read_text())
        self.booster = xgb.Booster()
        self.booster.load_model(out / "model" / "flood_xgb.ubj")
        self.n_trees = self.metrics["n_trees"]

        inputs = load_inputs(out)
        self.edge_len = inputs["edge_len"]
        # Missing street names have code -1. Keep them missing for hotspot grouping.
        self.edge_name = np.append(inputs["edge_names"].astype(object), None)[inputs["edge_name_codes"]]
        self.edge_cls = inputs["edge_cls"]
        bn = inputs["building_node"]
        self.bld_node = bn[:, 0].astype(int)
        self.bld_snap_m = bn[:, 1]

        self.cell_rc = (inputs["cell_row"], inputs["cell_col"])
        self.asset_xy = inputs["asset_xy"]
        self.storm_grid = None
        self.splits = inputs["splits"]
        self.static = np.ascontiguousarray(inputs["static"])
        self.X = np.empty((len(self.static), len(FEATURES)), dtype=np.float32)

        geoms = np.split(inputs["coordinates"], inputs["geometry_stops"][:-1])
        self.router = Router(inputs["ui"], inputs["vi"], inputs["time_s"],
                             self.edge_len, inputs["node_xy"], geoms)
        self.lut = _depth_lut()
        self._prediction_lock = Lock()
        self._pred_cache: OrderedDict[Scenario, tuple] = OrderedDict()
        self._dry_cache: dict = {}
        self._dry_routes = OrderedDict()
        self._route_lock = Lock()
        self.pois = {p["id"]: p for p in self.meta["hospitals"] + self.meta["neighborhoods"]}
        self._node_index = None
        print(f"[engine] {region.id}: {len(self.static):,} prediction points, "
              f"{len(self.edge_len):,} edges, loaded in {time.time() - t0:.1f}s")

    # ------------------------------------------------------------------ flood
    def predict(self, sc: Scenario):
        # The feature matrix is reused across frames and must stay paired with its storm.
        with self._prediction_lock:
            if sc in self._pred_cache:
                self._pred_cache.move_to_end(sc)
                return self._pred_cache[sc]
            rain, surge = sc.rain, sc.surge
            if sc.event:
                if self.storm_grid is None:
                    self.storm_grid = StormGrid.load(self.region, self.grid, self.asset_xy, self.cell_rc,
                                                     self.meta["neighborhoods"])
                rain = self.storm_grid.forcing(sc.event) * sc.rain
                # The Ship Channel is our only estuarine study region. The sea level is
                # a boundary condition and the existing depth model includes sea connectivity.
                if sc.event.kind != "hurricane" or self.region.id != "ship-channel":
                    surge = 0
            if sc.event:
                # Outside the swath and its downstream catchment only coastal water can
                # reach a feature. Use the teacher's sea connectivity/backflow calculation
                # there, avoiding surrogate residuals and full-grid inference in dry areas.
                wet = rain > 0
                d = np.zeros(len(self.static), dtype=np.float32)
                if surge > 0:
                    columns = [FEATURES.index(name) for name in ("elev", "sea_thresh", "dist_sea", "is_bridge")]
                    elev, threshold, dist, bridge = (self.static[:, col] for col in columns)
                    coastal = coastal_depth(self.region.base_water_level + surge, elev, threshold, dist, bridge > 0)
                    np.clip(coastal, 0, MAX_DEPTH_M, out=d)
                if wet.any():
                    X = self.X[:np.count_nonzero(wet)]
                    assemble(self.static[wet], rain[wet], sc.duration, surge, sc.clog,
                             self.region.base_water_level, out=X)
                    d[wet] = np.maximum(d[wet], self.booster.inplace_predict(X, iteration_range=(0, self.n_trees)))
            else:
                assemble(self.static, rain, sc.duration, surge, sc.clog, self.region.base_water_level, out=self.X)
                d = self.booster.inplace_predict(self.X, iteration_range=(0, self.n_trees))
                d = np.asarray(d, dtype=np.float32)
            d[d < 0.01] = 0
            a, b, c, e = self.splits
            res = (d[a:b], d[b:c], d[c:e])
            self._pred_cache[sc] = res
            if len(self._pred_cache) > (8 if _VERCEL_WORKER else 96):
                self._pred_cache.popitem(last=False)
            return res

    def overlay_png(self, cell_depth: np.ndarray) -> str:
        g = self.grid
        q = np.zeros((g.height, g.width), dtype=np.uint8)
        q[self.cell_rc] = np.clip(np.round(cell_depth / 0.02), 0, 255).astype(np.uint8)
        img = Image.fromarray(q, "P")
        img.putpalette(self.lut[:, :3].ravel().tolist())
        buf = io.BytesIO()
        img.save(buf, format="PNG", compress_level=3, transparency=bytes(self.lut[:, 3].tolist()))
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    # ---------------------------------------------------------------- routing
    def nearest_node(self, lon, lat):
        if self._node_index is None:
            self._node_index = NodeIndex(self.router.node_xy, float(np.mean(self.region.bbox[1::2])))
        i, d = self._node_index.query([lon], [lat])
        return int(i[0]), float(d[0])

    def _dry(self, src, clearance):
        key = (src, clearance)
        if key not in self._dry_cache:
            w = edge_weights(self.router.base_time, np.zeros_like(self.edge_len), clearance)
            self._dry_cache[key] = (w, self.router.access_times(src, w))
        return self._dry_cache[key]

    # ------------------------------------------------------------------- main
    def simulate(self, rain, duration, surge, clog, vehicle="ambulance", hospital=None, dest=None,
                 dest_lonlat=None, overlay=True, event=None):
        t0 = time.perf_counter()
        sc = Scenario.make(rain, duration, surge, clog, event=event)
        de, db, dc = self.predict(sc)
        t_pred = time.perf_counter() - t0

        clearance = VEHICLES.get(vehicle, VEHICLES["ambulance"])["clearance_m"]
        hosp = self.pois.get(hospital) or self.meta["hospitals"][0]
        src = hosp["node"]
        if dest_lonlat is not None:
            dst, snap = self.nearest_node(*dest_lonlat)
            dest_info = dict(id="custom", name="Dropped pin", lon=dest_lonlat[0], lat=dest_lonlat[1], node=dst)
        else:
            dest_info = self.pois.get(dest) or self.meta["neighborhoods"][0]
            dst = dest_info["node"]

        w = edge_weights(self.router.base_time, de, clearance)
        w_dry, t_dry = self._dry(src, clearance)
        t_now = self.router.access_times(src, w)
        route_now = self.router.route(src, dst, w)
        rkey = (src, dst, clearance)
        with self._route_lock:
            if rkey not in self._dry_routes:
                self._dry_routes[rkey] = self.router.route(src, dst, w_dry)
            route_dry = self._dry_routes[rkey]
            if _VERCEL_WORKER:
                self._dry_routes.move_to_end(rkey)
                if len(self._dry_routes) > 32:
                    self._dry_routes.popitem(last=False)
        t_route = time.perf_counter() - t0 - t_pred

        blocked = []
        if route_dry:
            blocked = [self.router.geoms[i].tolist() for i in route_dry["edges"] if not np.isfinite(w[i])]
        status = "blocked" if route_now is None else ("detour" if blocked or (
            route_dry and route_now["time_s"] > route_dry["time_s"] * 1.05 + 15) else "clear")

        # building access (minutes); 65535 = cut off from the hospital
        bt = t_now[self.bld_node]
        bt_dry = t_dry[self.bld_node]
        reach = np.isfinite(bt)
        access = np.where(reach, np.clip(np.round(bt / 6.0), 0, 65000), 65535).astype(int)

        L = self.edge_len
        tot_km = L.sum() / 1000
        imp = ~np.isfinite(w)
        stats = dict(
            roads=dict(
                total_km=round(tot_km, 1),
                wet_km=round(L[de > WET_M].sum() / 1000, 1),
                flooded_km=round(L[de > FLOODED_M].sum() / 1000, 1),
                impassable_km=round(L[imp].sum() / 1000, 1),
                flooded_pct=round(100 * L[de > FLOODED_M].sum() / 1000 / tot_km, 1),
                impassable_pct=round(100 * L[imp].sum() / 1000 / tot_km, 1),
                mean_fii=round(float((inundation_index(de) * L).sum() / L.sum()), 3),
            ),
            buildings=dict(
                total=int(len(db)),
                wet=int((db > WET_M).sum()),
                flooded=int((db > FLOODED_M).sum()),
                severe=int((db > 0.5).sum()),
            ),
            area_km2=round(float((dc > 0.10).sum()) * self.grid.cell_m**2 / 1e6, 2),
            max_depth_m=round(float(max(dc.max(initial=0), de.max(initial=0))), 2),
            access=dict(
                cut_off=int((~reach).sum()),
                over_15min=int((bt > 900).sum()),
                median_min=round(float(np.median(bt[reach])) / 60, 1) if reach.any() else None,
                median_min_dry=round(float(np.median(bt_dry[np.isfinite(bt_dry)])) / 60, 1),
            ),
            hotspots=self._hotspots(de, imp),
        )
        route = dict(
            status=status,
            vehicle=vehicle,
            clearance_m=clearance,
            hospital=dict(id=hosp["id"], name=hosp["name"], lon=hosp["lon"], lat=hosp["lat"]),
            dest=dict(id=dest_info["id"], name=dest_info["name"], lon=dest_info["lon"], lat=dest_info["lat"]),
            current=_route_json(route_now),
            dry=_route_json(route_dry),
            blocked=blocked,
            delay_s=None if route_now is None or route_dry is None else round(route_now["time_s"] - route_dry["time_s"], 1),
        )
        out = dict(
            scenario=dict(rain=sc.rain, duration=sc.duration, surge=sc.surge, clog=sc.clog),
            edges=np.round(de * 100).astype(int).tolist(),
            closed_edges_b64=base64.b64encode(np.packbits(imp, bitorder="little").tobytes()).decode("ascii"),
            buildings=np.round(db * 100).astype(int).tolist(),
            access=access.tolist(),
            stats=stats,
            route=route,
        )
        if sc.event:
            out["scenario"]["event"] = dict(kind=sc.event.kind, track=sc.event.track,
                                             radius_km=sc.event.radius_km, progress=sc.event.progress)
            active_rc = self.storm_grid.active_rc(sc.event)
            out["spatial"] = dict(
                active_track=self.storm_grid.lonlat(active_rc),
                flow_paths=self.storm_grid.trace(active_rc, sc.event.radius_km) if sc.rain > 0 else [],
                areas=self.storm_grid.area_impacts(L, de > FLOODED_M, imp, db > FLOODED_M),
            )
        if overlay:
            out["overlay"] = self.overlay_png(dc)
        out["timing_ms"] = dict(model=round(t_pred * 1000, 1), routing=round(t_route * 1000, 1),
                                total=round((time.perf_counter() - t0) * 1000, 1))
        return out

    def _hotspots(self, de, imp, k=5):
        df = pd.DataFrame(dict(name=self.edge_name, L=self.edge_len, d=de, imp=imp))
        df = df[df.name.notna() & (df.d > FLOODED_M)]
        if df.empty:
            return []
        df["imp_L"] = df.L * df.imp
        g = df.groupby("name").agg(km=("L", "sum"), max_d=("d", "max"), imp_km=("imp_L", "sum"))
        g = g.sort_values("km", ascending=False).head(k)
        return [dict(name=str(n), flooded_km=round(float(r.km) / 1000, 2),
                     impassable_km=round(float(r.imp_km) / 1000, 2), max_depth_m=round(float(r.max_d), 2))
                for n, r in g.iterrows()]

    def public_meta(self):
        return public_meta(self.region)


def _route_json(r):
    if r is None:
        return None
    return dict(coords=np.round(np.asarray(r["coords"]), 6).tolist(), time_s=round(r["time_s"], 1),
                length_m=round(r["length_m"], 1), n_edges=len(r["edges"]))


_ENGINES: OrderedDict[str, RegionEngine] = OrderedDict()
_LOAD_LOCKS = {region_id: Lock() for region_id in REGIONS}
_HOSTED_LOAD_LOCK = Lock()
_LIVE_ENGINES: WeakValueDictionary[str, RegionEngine] = WeakValueDictionary()


def get_engine(region_id: str) -> RegionEngine:
    if _VERCEL_WORKER:
        # Serialize large allocations. An evicted engine may still serve an active
        # request; its weak entry lets other callers reuse it until that request ends.
        with _HOSTED_LOAD_LOCK:
            engine = _LIVE_ENGINES.get(region_id)
            if region_id not in _ENGINES and len(_ENGINES) >= 2:
                _ENGINES.popitem(last=False)
            if engine is None:
                engine = RegionEngine(REGIONS[region_id])
                _LIVE_ENGINES[region_id] = engine
            _ENGINES[region_id] = engine
            _ENGINES.move_to_end(region_id)
            return engine
    with _LOAD_LOCKS[region_id]:
        if region_id not in _ENGINES:
            _ENGINES[region_id] = RegionEngine(REGIONS[region_id])
        return _ENGINES[region_id]
