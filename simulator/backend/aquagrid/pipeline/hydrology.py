"""Terrain hydrology on the analysis grid.

Produces the static rasters the flood model needs:

* water / sea masks
* fill          - depression-filled DEM (outlets: all water + grid border)
* sink_depth    - fill - elev: how much water a depression can pond before spilling
* sea_thresh    - minimum sea level at which a cell becomes hydraulically connected to the
                  open sea (priority-flood seeded only from sea cells). A connected "bathtub"
                  surge model is then simply: flooded <=> water_level > sea_thresh.
* acc           - flow accumulation (cells), from the priority-flood drainage tree
* twi           - Topographic Wetness Index ln(a / tan(beta))
* hand          - Height Above Nearest Drainage (m)
* tpi           - Topographic Position Index (m): elevation minus ~150 m neighbourhood mean
* slope_pct, dist_water_m, dist_sea_m
"""
from __future__ import annotations

import heapq

import numpy as np
from scipy import ndimage

_NEIGH = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def priority_flood(elev: np.ndarray, seeds: np.ndarray):
    """Priority-Flood (Barnes et al. 2014) from `seeds`.

    Returns (fill, parent, order):
      fill   - minimax spill elevation from the seeds (depression-filled DEM)
      parent - flat index of the cell each cell drains into (-1 for seeds)
      order  - flat indices in processing order (outlets first)
    """
    H, W = elev.shape
    n = H * W
    e = elev.ravel().tolist()
    fill = [0.0] * n
    parent = [-1] * n
    closed = bytearray(n)
    order = []
    heap = []
    for i in np.flatnonzero(seeds.ravel()).tolist():
        closed[i] = 1
        fill[i] = e[i]
        heap.append((e[i], i))
    heapq.heapify(heap)
    push, pop = heapq.heappush, heapq.heappop
    while heap:
        f, i = pop(heap)
        order.append(i)
        r, c = divmod(i, W)
        for dr, dc in _NEIGH:
            rr, cc = r + dr, c + dc
            if 0 <= rr < H and 0 <= cc < W:
                j = rr * W + cc
                if not closed[j]:
                    closed[j] = 1
                    fj = e[j] if e[j] > f else f
                    fill[j] = fj
                    parent[j] = i
                    push(heap, (fj, j))
    return (
        np.asarray(fill, dtype=np.float32).reshape(H, W),
        np.asarray(parent, dtype=np.int64),
        np.asarray(order, dtype=np.int64),
    )


def flow_accumulation(parent: np.ndarray, order: np.ndarray) -> np.ndarray:
    acc = np.ones(parent.shape[0], dtype=np.float64)
    par = parent.tolist()
    a = acc.tolist()
    for i in reversed(order.tolist()):
        p = par[i]
        if p >= 0:
            a[p] += a[i]
    return np.asarray(a)


def drainage_elevation(elev_flat: np.ndarray, parent: np.ndarray, order: np.ndarray) -> np.ndarray:
    """Elevation of the outlet (water/border cell) each cell ultimately drains to."""
    e = elev_flat.tolist()
    par = parent.tolist()
    d = [0.0] * len(e)
    for i in order.tolist():
        p = par[i]
        d[i] = e[i] if p < 0 else d[p]
    return np.asarray(d, dtype=np.float32)


def compute(elev_raw: np.ndarray, nodata: np.ndarray, water_poly_mask: np.ndarray, cell_m: float) -> dict:
    H, W = elev_raw.shape
    elev = elev_raw.copy()
    water = water_poly_mask | nodata | (np.nan_to_num(elev, nan=-1.0) < 0.05)
    elev[nodata] = -1.0
    elev = np.nan_to_num(elev, nan=-1.0)
    # water surfaces: flatten to a common low level so they behave as outlets / sea
    elev = np.where(water, np.minimum(elev, 0.0), elev).astype(np.float32)

    # sea = water bodies with real extent (the bay / ocean / tidal canals), not ponds or pools
    lab, nlab = ndimage.label(water, structure=np.ones((3, 3)))
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, nlab + 1))
    big = np.flatnonzero(sizes >= max(2000, 0.05 * water.sum())) + 1
    sea = np.isin(lab, big)

    border = np.zeros_like(water)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True

    # Pluvial drainage: outlets are all water + the grid border.
    fill, parent, order = priority_flood(elev, water | border)
    sink_depth = np.clip(fill - elev, 0, None)
    acc = flow_accumulation(parent, order).reshape(H, W)
    # HAND uses a drainage tree whose only outlets are real water bodies (no border artefacts)
    _, parent_w, order_w = priority_flood(elev, water)
    drain_elev = drainage_elevation(elev.ravel(), parent_w, order_w).reshape(H, W)
    hand = elev - drain_elev
    # Topographic Position Index: elevation relative to the ~150 m neighbourhood (land only).
    # In a flat coastal city this is what tells a street "you are the local low spot".
    land = (~water).astype(np.float32)
    sig = 150.0 / cell_m
    tpi = elev - ndimage.gaussian_filter(elev * land, sig) / np.maximum(ndimage.gaussian_filter(land, sig), 1e-3)

    # Coastal connectivity: outlets are only the sea.
    # Coastal connectivity: outlets are only the sea. Inland regions (no large water body) cannot be
    # reached by surge at all, so their threshold is effectively infinite.
    if sea.any():
        sea_thresh, _, _ = priority_flood(elev, sea)
    else:
        sea_thresh = np.full(elev.shape, 999.0, dtype=np.float32)

    smooth = ndimage.gaussian_filter(elev, 1.0)
    gy, gx = np.gradient(smooth, cell_m)
    tanb = np.hypot(gx, gy)
    slope_pct = 100.0 * tanb
    twi = np.log((acc * cell_m) / np.maximum(tanb, 0.002))

    dist_water = ndimage.distance_transform_edt(~water) * cell_m
    dist_sea = ndimage.distance_transform_edt(~sea) * cell_m if sea.any() else np.full(elev.shape, 1e5)

    return dict(
        elev=elev.astype(np.float32),
        flow_parent=parent.astype(np.int32),
        water=water,
        sea=sea,
        fill=fill,
        sink_depth=sink_depth.astype(np.float32),
        sea_thresh=sea_thresh.astype(np.float32),
        acc=acc.astype(np.float32),
        hand=hand.astype(np.float32),
        tpi=tpi.astype(np.float32),
        slope_pct=slope_pct.astype(np.float32),
        twi=twi.astype(np.float32),
        dist_water=dist_water.astype(np.float32),
        dist_sea=dist_sea.astype(np.float32),
    )


def rasterize_polygons(geoms, grid) -> np.ndarray:
    """Boolean mask of grid cells whose centre lies inside any of `geoms` (lon/lat)."""
    import shapely

    lon, lat = grid.cell_centers_lonlat()
    mask = np.zeros((grid.height, grid.width), dtype=bool)
    for g in geoms:
        if g is None or g.is_empty:
            continue
        minx, miny, maxx, maxy = g.bounds
        r0, c0 = grid.lonlat_to_rc(minx, maxy)
        r1, c1 = grid.lonlat_to_rc(maxx, miny)
        r0, c0 = max(int(np.floor(r0)), 0), max(int(np.floor(c0)), 0)
        r1, c1 = min(int(np.ceil(r1)) + 1, grid.height), min(int(np.ceil(c1)) + 1, grid.width)
        if r0 >= r1 or c0 >= c1:
            continue
        sub = shapely.contains_xy(g, lon[r0:r1, c0:c1], lat[r0:r1, c0:c1])
        mask[r0:r1, c0:c1] |= sub
    return mask
