"""Paired roadway adaptation scenarios. Depth offsets and prices are explicit teaching assumptions."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .catalog import VEHICLES
from .routing import edge_weights

DEPTH_OFFSET_M = {"mitigation": 0.20, "response": 0.10}
WORK_RADIUS_M = 250
MAX_CORRIDORS = 3
DELAY_CAP_MIN = 30


def corridor_packages(engine, depths, weights, clearance, reduction):
    """Screen named roads by length × lost travel speed, then locate one local worksite per road."""
    length = engine.edge_len
    dry = engine.router.base_time
    impaired_length = length * (1 - dry / weights)
    table = pd.DataFrame({"name": engine.edge_name, "loss": impaired_length})
    ranked = table.loc[table.loss > 0].groupby("name").loss.sum().sort_values(ascending=False, kind="stable")
    coord = (engine.router.node_xy[engine.router.ui] + engine.router.node_xy[engine.router.vi]) / 2
    restored = edge_weights(dry, np.maximum(0, depths - reduction), clearance)
    benefit = length * (dry / restored - dry / weights)
    packages = []
    for name in ranked.head(MAX_CORRIDORS).index:
        edges = np.flatnonzero((engine.edge_name == name) & (impaired_length > 0))
        # Center on a segment sensitive to the intervention. If none respond, retain the site with zero benefit.
        anchor = edges[np.lexsort((-impaired_length[edges], -benefit[edges]))[0]]
        lon, lat = coord[anchor]
        delta = (coord[edges] - coord[anchor]) * [111_320 * math.cos(math.radians(lat)), 111_320]
        nearby = edges[np.sum(delta**2, axis=1) <= WORK_RADIUS_M**2]
        packages.append((str(name), nearby, [round(float(lon), 5), round(float(lat), 5)]))
    return packages


def evaluate(engine, scenario, phase, vehicle, hospital):
    """Replay the same event and hospital/vehicle selection for every possible package combination."""
    depths, _, _ = engine.predict(scenario)
    clearance = VEHICLES[vehicle]["clearance_m"]
    source = next(p for p in engine.meta["hospitals"] if p["id"] == hospital)
    router = engine.router
    base_weights = edge_weights(router.base_time, depths, clearance)
    offset = DEPTH_OFFSET_M[phase]
    treated_weights = edge_weights(router.base_time, np.maximum(0, depths - offset), clearance)
    packages = corridor_packages(engine, depths, base_weights, clearance, offset)
    _, dry_times = engine._dry(source["node"], clearance)
    dry_buildings = dry_times[engine.bld_node]
    reachable_dry = np.isfinite(dry_buildings)
    samples = []
    for mask in range(1 << len(packages)):
        weights = base_weights.copy()
        for index, (_, edges, _) in enumerate(packages):
            if mask & (1 << index):
                weights[edges] = treated_weights[edges]
        times = router.access_times(source["node"], weights)[engine.bld_node]
        extra = times[reachable_dry] - dry_buildings[reachable_dry]
        samples.append({
            "delay_minutes": round(float(np.clip(extra / 60, 0, DELAY_CAP_MIN).sum()), 2),
            "cut_off": int(np.count_nonzero(~np.isfinite(times))),
            "blocked_km": round(float(engine.edge_len[~np.isfinite(weights)].sum()) / 1000, 3),
            "impaired_km": round(float((engine.edge_len * (1 - router.base_time / weights)).sum()) / 1000, 4),
        })
    corridors = []
    for name, edges, center in packages:
        lon, lat = center
        # The prepared points are reference locations, not administrative neighborhood polygons.
        cos_lat = math.cos(math.radians(lat))
        nearest = min(engine.meta.get("neighborhoods", []),
                      key=lambda p: ((p["lon"] - lon) * cos_lat)**2 + (p["lat"] - lat)**2,
                      default=None)
        corridors.append({"name": name, "length_m": max(1, round(float(engine.edge_len[edges].sum()))),
                          "center": center, "nearby": nearest["name"] if nearest else None})
    return {
        "phase": phase,
        "offset_cm": round(offset * 100),
        "corridors": corridors,
        "outcomes": samples,
    }
