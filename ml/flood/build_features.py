"""Terrain, land-cover and rainfall features on each reach's 20 m grid.

    python -I ml/flood/build_features.py

Per reach: USGS 3DEP elevation -> pysheds hydrology (HAND, flow accumulation, depressions, TWI);
NLCD 2016 impervious % and open-water fraction; Harvey storm-total rainfall interpolated from
USGS rain gauges. Raw downloads are cached under data/raw/.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pyproj

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ml.flood.common import (  # noqa: E402
    FEATURES, fetch_3dep, ghcn_storm_totals, fetch_nlcd_impervious, fetch_nlcd_water, idw, load_cfg, load_grid,
    log, p, terrain_features,
)


def harvey_gauges(cfg):
    ev = cfg["event"]
    tot = ghcn_storm_totals(p(cfg["paths"]["ghcn_dir"]), ev["id"], ev["rain_start"], ev["rain_end"])
    used = tot[tot.used & tot.lat.notna()].copy()
    x, y = pyproj.Transformer.from_crs(4326, cfg["crs_epsg"], always_xy=True).transform(used.lon, used.lat)
    used["x"], used["y"] = x, y
    return tot, used


def main(only: list[str] | None = None):
    cfg = load_cfg()
    out = p(cfg["paths"]["out"])
    tot, gauges = harvey_gauges(cfg)
    (out / "harvey_rain_gauges.json").write_text(tot.to_json(orient="records", indent=1))
    log(f"Harvey rain gauges: {len(gauges)} used of {len(tot)} (NOAA GHCN-Daily, >=85% of storm days reported); storm totals "
        f"{gauges.total_mm.min():.0f}-{gauges.total_mm.max():.0f} mm (median {gauges.total_mm.median():.0f})")
    for u in cfg["units"]:
        name = u["name"]
        if only and name not in only:
            continue
        dst = out / f"features_{name}.npz"
        if dst.exists():
            log(f"{name}: features exist, skipping")
            continue
        t0 = time.time()
        grid = load_grid(out / f"grid_{name}.json")
        elev = fetch_3dep(grid, p(f"data/raw/usgs-3dep/{name}_20m.tif"))
        t1 = time.time()
        feats = terrain_features(elev, grid, cfg["stream_threshold_km2"])
        t2 = time.time()
        feats["imperv"] = fetch_nlcd_impervious(grid, p(f"data/raw/nlcd2016/{name}_impervious_20m.tif"))
        water = fetch_nlcd_water(grid, p(f"data/raw/nlcd2016/{name}_water_20m.tif"))
        feats["rain_mm"] = idw(grid, gauges.x.to_numpy(), gauges.y.to_numpy(), gauges.total_mm.to_numpy())
        np.savez_compressed(dst, **{k: feats[k] for k in FEATURES}, water_frac=water.astype(np.float32),
                            dem_missing=feats["dem_missing"], streams=feats["streams"])
        lab = np.load(out / f"labels_{name}.npz")["labeled"]
        log(f"{name:18s} {grid.width}x{grid.height}  3DEP {t1 - t0:.0f}s  hydrology {t2 - t1:.0f}s  "
            f"DEM gaps {feats['dem_missing'].mean():.1%}  water(labeled) {np.nanmean(water[lab] > 0.5):.1%}  "
            f"HAND p50 {np.nanmedian(feats['hand'][lab]):.1f} m  imperv p50 {np.nanmedian(feats['imperv'][lab]):.0f}%  "
            f"rain {np.nanmean(feats['rain_mm'][lab]):.0f} mm  total {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
