"""Aggregate USGS Harvey depth rasters (1.4-10 m) to the 20 m analysis grid.

    python -I ml/flood/build_labels.py

Per mapped reach (Watson et al. 2018, doi:10.5066/F7VH5N3N):
  depth_mean  mean water depth in the cell, dry source pixels counted as 0 (m)
               NOTE: the USGS depth rasters store depth in FEET (horizontal units are metres). Verified
               against surveyed high-water-mark heights above ground (ft): median raster/HWM ratio ~1.0.
  wet_frac    fraction of source pixels that were inundated
  labeled     cell centre inside the USGS mapped-area boundary and covered by the depth raster
Inside the mapped boundary but outside the inundation extent is genuinely mapped as dry: the
release lines the boundary up with the inundation edge where extent is uncertain.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import Window

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ml.flood.common import GridSpec, load_cfg, log, p, save_grid  # noqa: E402

FT_TO_M = 0.3048
MAX_DEPTH_FT = 120.0


def _runs(idx: np.ndarray):
    """Start positions of runs of equal (non-decreasing) target indices."""
    return np.concatenate([[0], np.flatnonzero(np.diff(idx)) + 1])


def aggregate(src_path: Path, grid: GridSpec, crs_epsg: int, strip: int = 512):
    sum_d = np.zeros((grid.height, grid.width), np.float64)
    n_px = np.zeros((grid.height, grid.width), np.float64)
    n_wet = np.zeros((grid.height, grid.width), np.float64)
    with rasterio.open(src_path) as src:
        if src.crs is not None and src.crs.to_epsg() not in (None, crs_epsg):
            raise ValueError(f"{src_path}: CRS {src.crs} != EPSG:{crs_epsg}")
        T = src.transform
        sx, sy = T.a, -T.e
        tc = np.floor((T.c + (np.arange(src.width) + 0.5) * sx - grid.x0) / grid.res).astype(int)
        cmask = (tc >= 0) & (tc < grid.width)
        c_lo, c_hi = np.flatnonzero(cmask)[[0, -1]]
        tc_in = tc[c_lo:c_hi + 1]
        cstarts = _runs(tc_in)
        tcu = tc_in[cstarts]
        nodata = src.nodata
        for r0 in range(0, src.height, strip):
            h = min(strip, src.height - r0)
            a = src.read(1, window=Window(c_lo, r0, c_hi - c_lo + 1, h)).astype(np.float64)
            tr = np.floor((grid.y0 - (T.f - (r0 + np.arange(h) + 0.5) * sy)) / grid.res).astype(int)
            rmask = (tr >= 0) & (tr < grid.height)
            if not rmask.any():
                continue
            a, tr = a[rmask], tr[rmask]
            valid = np.isfinite(a) & (a > 0) & (a < MAX_DEPTH_FT)
            if nodata is not None:
                valid &= a != nodata
            d = np.where(valid, a * FT_TO_M, 0.0)  # feet -> metres
            ones = np.ones_like(d)
            rstarts = _runs(tr)
            tru = tr[rstarts]
            for arr, acc in ((d, sum_d), (ones, n_px), (valid.astype(np.float64), n_wet)):
                block = np.add.reduceat(np.add.reduceat(arr, cstarts, axis=1), rstarts, axis=0)
                acc[tru[0]:tru[-1] + 1, tcu[0]:tcu[-1] + 1] += block
    return sum_d, n_px, n_wet


def main():
    cfg = load_cfg()
    base = p(cfg["paths"]["harvey"])
    out = p(cfg["paths"]["out"])
    out.mkdir(parents=True, exist_ok=True)
    for u in cfg["units"]:
        dst = out / f"labels_{u['name']}.npz"
        if dst.exists():
            log(f"{u['name']}: labels exist, skipping")
            continue
        t0 = time.time()
        bnd = gpd.read_file(base / u["bnd"]).to_crs(cfg["crs_epsg"])
        grid = GridSpec.around(bnd.total_bounds, cfg["res_m"], cfg["margin_m"], cfg["crs_epsg"])
        sum_d, n_px, n_wet = aggregate(base / u["depth"], grid, cfg["crs_epsg"])
        inside = rasterize(((g, 1) for g in bnd.geometry), out_shape=(grid.height, grid.width),
                           transform=grid.transform, fill=0, dtype="uint8").astype(bool)
        # require most of the cell to be covered by the source raster
        full = n_px.max()
        labeled = inside & (n_px >= 0.5 * full)
        with np.errstate(invalid="ignore", divide="ignore"):
            depth = np.where(labeled, sum_d / n_px, np.nan).astype(np.float32)
            wet = np.where(labeled, n_wet / n_px, np.nan).astype(np.float32)

        hwm = gpd.read_file(base / u["hwm"]).to_crs(cfg["crs_epsg"])
        hag_col = next((c for c in hwm.columns if c.lower().startswith("height_ab")), None)
        hwm_out = None
        if hag_col is not None:
            hag = np.asarray(hwm[hag_col], dtype=float)
            r, c = grid.rc(hwm.geometry.x, hwm.geometry.y)
            ok = np.isfinite(hag) & (hag > -50) & (r >= 0) & (r < grid.height) & (c >= 0) & (c < grid.width)
            hwm_out = np.c_[r[ok], c[ok], hag[ok] * FT_TO_M]
        np.savez_compressed(dst, depth=depth, wet_frac=wet, labeled=labeled,
                            hwm=hwm_out if hwm_out is not None else np.zeros((0, 3)))
        save_grid(grid, out / f"grid_{u['name']}.json")
        lab = labeled.sum()
        log(f"{u['name']:18s} grid {grid.width}x{grid.height}  labeled {lab:,} cells "
            f"({lab * grid.res**2 / 1e6:.0f} km2)  wet>0.15m {np.nanmean(depth > 0.15):.1%}  "
            f"mean depth {np.nanmean(depth):.2f} m  max {np.nanmax(depth):.1f} m  "
            f"HWMs {0 if hwm_out is None else len(hwm_out)}  ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
