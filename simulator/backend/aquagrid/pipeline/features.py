"""Static flood-susceptibility features for every road edge, building, and open-ground grid cell.

Every object is reduced to one representative point (its lowest point: where water would
collect first) and described by the same feature vector, so one model covers all of them.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import shapely
from scipy import ndimage

from .network import WIDTH_M

STATIC_FEATURES = [
    "elev",        # m, NAVD88 (3DEP bare earth)
    "slope_pct",   # local terrain slope
    "twi",         # topographic wetness index
    "hand",        # height above nearest drainage, m
    "tpi",         # topographic position index, m (negative = local low spot)
    "sink_depth",  # depression storage depth, m
    "sea_thresh",  # sea level needed to reach this point over land, m
    "dist_water",  # m to nearest water body / canal
    "dist_sea",    # m to open bay / ocean
    "imperv",      # impervious fraction (buildings + pavement density)
    "road_class",  # 0 motorway .. 6 service, 7 off-road
    "is_bridge",
]
BRIDGE_DECK_M = 6.0
RASTER_KEYS = ["elev", "slope_pct", "twi", "hand", "tpi", "sink_depth", "sea_thresh", "dist_water", "dist_sea", "imperv"]


def imperviousness(grid, buildings, edge_pts, edge_w):
    H, W = grid.height, grid.width
    cell_area = grid.cell_m**2

    def accumulate(lon, lat, weight):
        r, c = grid.lonlat_to_rc(lon, lat)
        r = np.clip(np.round(r).astype(int), 0, H - 1)
        c = np.clip(np.round(c).astype(int), 0, W - 1)
        return np.bincount(r * W + c, weights=weight, minlength=H * W).reshape(H, W) / cell_area

    rp = buildings.geometry.representative_point()
    bcov = accumulate(rp.x.to_numpy(), rp.y.to_numpy(), buildings.area_m2.to_numpy())
    rcov = accumulate(edge_pts[:, 0], edge_pts[:, 1], edge_w)
    bcov = ndimage.uniform_filter(np.clip(bcov, 0, 1), 5)
    rcov = ndimage.uniform_filter(np.clip(rcov, 0, 1), 5)
    return np.clip(0.28 + 1.3 * bcov + 1.2 * rcov, 0.05, 0.97).astype(np.float32)


def _sample_all(grid, rasters, lon, lat):
    return {k: grid.sample(rasters[k], lon, lat, order=1) for k in RASTER_KEYS}


def edge_sample_points(edges, step_m=12.0):
    n = np.maximum(2, np.ceil(edges.length_m.to_numpy() / step_m).astype(int) + 1)
    idx = np.repeat(np.arange(len(edges)), n)
    frac = np.concatenate([np.linspace(0, 1, k) for k in n])
    geoms = edges.geometry.to_numpy()[idx]
    pts = shapely.line_interpolate_point(geoms, frac, normalized=True)
    xy = shapely.get_coordinates(pts)
    seg_len = (edges.length_m.to_numpy() / (n - 1))[idx]
    return idx, xy, seg_len


def _lowest_point_table(grid, rasters, obj_idx, xy, n_obj):
    s = _sample_all(grid, rasters, xy[:, 0], xy[:, 1])
    df = pd.DataFrame(s)
    df["obj"] = obj_idx
    pick = df.groupby("obj")["elev"].idxmin()
    out = df.loc[pick.values].set_index("obj").reindex(np.arange(n_obj))
    out["lon"] = xy[pick.values, 0]
    out["lat"] = xy[pick.values, 1]
    return out.reset_index(drop=True)


def edge_features(grid, rasters, edges, idx, xy):
    f = _lowest_point_table(grid, rasters, idx, xy, len(edges))
    f["road_class"] = edges.cls.to_numpy()
    f["is_bridge"] = edges.is_bridge.to_numpy()
    b = f.is_bridge == 1
    deck = np.maximum(f.loc[b, "elev"], BRIDGE_DECK_M)
    f.loc[b, "hand"] += deck - f.loc[b, "elev"]
    f.loc[b, "tpi"] = np.maximum(f.loc[b, "tpi"], 0) + (deck - f.loc[b, "elev"])
    f.loc[b, "elev"] = deck
    f.loc[b, "sea_thresh"] = np.maximum(f.loc[b, "sea_thresh"], deck)
    f.loc[b, "sink_depth"] = 0.0
    return f


def building_features(grid, rasters, buildings):
    ext = shapely.get_exterior_ring(buildings.geometry.to_numpy())
    xy, idx = shapely.get_coordinates(ext, return_index=True)
    rp = shapely.get_coordinates(buildings.geometry.representative_point().to_numpy())
    xy = np.vstack([xy, rp])
    idx = np.concatenate([idx, np.arange(len(buildings))])
    f = _lowest_point_table(grid, rasters, idx, xy, len(buildings))
    f["road_class"] = 7
    f["is_bridge"] = 0
    return f


def cell_features(grid, rasters):
    land = ~rasters["water"]
    rows, cols = np.nonzero(land)
    f = pd.DataFrame({k: rasters[k][rows, cols] for k in RASTER_KEYS})
    f["road_class"] = 7
    f["is_bridge"] = 0
    f["row"] = rows
    f["col"] = cols
    return f


def edge_width(edges, idx):
    return np.array([WIDTH_M[c] for c in edges.cls.to_numpy()])[idx]
