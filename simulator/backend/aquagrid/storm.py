"""Local what-if rain footprints on the same drainage grid used to build AquaGrid's features."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile

import numpy as np
from scipy.spatial import cKDTree

from .pipeline.dem import px_to_lonlat
from .pipeline.hydrology import priority_flood


@dataclass(frozen=True)
class StormEvent:
    kind: str
    track: tuple[tuple[float, float], ...]
    radius_km: float
    progress: float = 1.0

    @classmethod
    def from_dict(cls, event):
        return cls(event["kind"], tuple(tuple(p) for p in event["track"]),
                   event["radius_km"], event.get("progress", 1.0))


def traveled_track(points, progress):
    """Prefix of a polyline by metric length, including the interpolated storm centre."""
    if len(points) == 1 or progress <= 0:
        return points[:1]
    if progress >= 1:
        return points
    lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
    remaining = lengths.sum() * progress
    for i, length in enumerate(lengths):
        if length and remaining <= length:
            return np.vstack([points[:i + 1], points[i] + (points[i + 1] - points[i]) * (remaining / length)])
        remaining -= length
    return points


def rainfall_swath(shape, track_rc, radius_cells):
    """Cosine falloff to zero at the swath edge. Work only inside each segment's padded box."""
    local = np.zeros(shape, dtype=np.float32)
    segments = zip(track_rc, track_rc[1:]) if len(track_rc) > 1 else [(track_rc[0], track_rc[0])]
    for a, b in segments:
        start = np.maximum(np.floor(np.minimum(a, b) - radius_cells).astype(int), 0)
        stop = np.minimum(np.ceil(np.maximum(a, b) + radius_cells).astype(int) + 1, shape)
        rr, cc = np.ogrid[start[0]:stop[0], start[1]:stop[1]]
        dr, dc = b - a
        length2 = dr * dr + dc * dc
        t = np.clip(((rr - a[0]) * dr + (cc - a[1]) * dc) / length2, 0, 1) if length2 else 0
        dist = np.hypot(rr - a[0] - t * dr, cc - a[1] - t * dc)
        weight = 0.5 + 0.5 * np.cos(np.pi * np.minimum(dist / radius_cells, 1))
        patch = local[start[0]:stop[0], start[1]:stop[1]]
        np.maximum(patch, weight, out=patch)
    return local


def flow_parent(path, rasters, prepare=False):
    if "flow_parent" in rasters:
        return rasters["flow_parent"]
    # Older prepared regions still have the exact DEM and outlet mask. The normal
    # prepare command saves their drainage tree so the first map edit needn't build it.
    sidecar = path.with_name("flow-parent.npy")
    source_time = path.stat().st_mtime_ns
    if sidecar.is_file() and sidecar.stat().st_mtime_ns == source_time:
        return np.load(sidecar)
    outlets = rasters["water"].copy()
    outlets[[0, -1], :] = True
    outlets[:, [0, -1]] = True
    _, parent, _ = priority_flood(rasters["elev"], outlets)
    parent = parent.astype(np.int32)
    if prepare:
        output = NamedTemporaryFile(dir=path.parent, delete=False)
        temp = Path(output.name)
        try:
            with output:
                np.save(output, parent)
            os.utime(temp, ns=(source_time, source_time))
            temp.replace(sidecar)
        finally:
            temp.unlink(missing_ok=True)
    return parent


class Drainage:
    """Rain reaches downstream cells solely along the filled DEM's outlet-directed tree."""

    def __init__(self, parent, accumulation):
        self.parent = np.asarray(parent, dtype=np.int32).ravel()
        self.accumulation = accumulation.ravel()
        # Group cells by steps to their outlet so an entire level transfers water at once.
        upstream = self.parent >= 0
        depth = upstream.astype(np.int32)
        jump = np.where(upstream, self.parent, np.arange(len(self.parent), dtype=np.int32))
        while np.any(jump != jump[jump]):
            depth += depth[jump]
            jump = jump[jump]
        order = np.argsort(depth, kind="stable")
        cuts = np.cumsum(np.bincount(depth))
        self.upstream_levels = np.split(order[cuts[0]:], cuts[1:-1] - cuts[0])[::-1]

    def effective_rain(self, local):
        """Catchment mean is an equivalent rainfall input to the local depth surrogate.

        The surrogate already models topographic concentration. An upstream mean avoids
        multiplying by contributing area twice and cannot exceed the peak storm intensity.
        """
        total = local.ravel().copy()
        for cells in self.upstream_levels:
            np.add.at(total, self.parent[cells], total[cells])
        return np.maximum(local.ravel(), total / self.accumulation)


class StormGrid:
    def __init__(self, grid, parent, accumulation, asset_xy, cell_rc, neighborhoods):
        self.grid = grid
        self.shape = (grid.height, grid.width)
        self.drainage = Drainage(parent, accumulation)
        r, c = grid.lonlat_to_rc(*asset_xy.T)
        self.asset_cells = np.ravel_multi_index(np.rint([r, c]).astype(int), self.shape, mode="clip")
        self.cell_indices = np.ravel_multi_index(cell_rc, self.shape)
        self.neighborhoods = neighborhoods
        rr, cc = grid.lonlat_to_rc(*np.array([(p["lon"], p["lat"]) for p in neighborhoods]).T)
        self.area_index = cKDTree(np.c_[rr, cc]).query(np.c_[r, c])[1]
        self.last_event = self.last_forcing = None

    @classmethod
    def load(cls, region, grid, asset_xy, cell_rc, neighborhoods):
        path = region.out_dir / "rasters.npz"
        with np.load(path) as rasters:
            parent = flow_parent(path, rasters)
            return cls(grid, parent, rasters["acc"], asset_xy, cell_rc, neighborhoods)

    def active_rc(self, event):
        r, c = self.grid.lonlat_to_rc(*np.asarray(event.track).T)
        return traveled_track(np.c_[r, c], event.progress)

    def lonlat(self, rc):
        r, c = np.asarray(rc).T
        g = self.grid
        lon, lat = px_to_lonlat(g.x0 + (c + 0.5) * g.factor, g.y0 + (r + 0.5) * g.factor, g.z)
        return np.round(np.c_[lon, lat], 6).tolist()

    def forcing(self, event):
        if event != self.last_event:
            swath = rainfall_swath(self.shape, self.active_rc(event), event.radius_km * 1000 / self.grid.cell_m)
            effective = self.drainage.effective_rain(swath)
            self.last_forcing = np.concatenate([effective[self.asset_cells], effective[self.cell_indices]])
            self.last_event = event
        return self.last_forcing

    def trace(self, track_rc, radius_km):
        """Representative runoff from the track and the wet inner swath, ending at water/grid edge."""
        centreline = np.array([traveled_track(track_rc, f)[-1] for f in np.linspace(0, 1, 5)])
        offset = radius_km * 1000 / self.grid.cell_m * 0.35
        inner_swath = centreline[::2, None, :] + offset * np.array([[-1, 0], [1, 0], [0, -1], [0, 1]])
        starts = np.rint(np.vstack([centreline, inner_swath.reshape(-1, 2)])).astype(int)
        seen = set()
        paths = []
        for r, c in starts:
            if not (0 <= r < self.grid.height and 0 <= c < self.grid.width):
                continue
            i = r * self.grid.width + c
            if i in seen:
                continue
            cells = [i]
            while self.drainage.parent[i] >= 0:
                i = int(self.drainage.parent[i])
                cells.append(i)
                if i in seen:
                    break
            seen.update(cells)
            if len(cells) >= 2:
                rc = np.array(np.unravel_index(cells, self.shape)).T
                # Keep each turn, drop collinear cells; the line still follows the same terrain.
                bends = np.any(np.diff(rc, n=2, axis=0) != 0, axis=1)
                paths.append(self.lonlat(rc[np.r_[True, bends, True]]))
        return paths

    def area_impacts(self, edge_length, flooded, impassable, buildings_flooded):
        n = len(self.neighborhoods)
        edges, buildings = np.split(self.area_index, [len(edge_length)])
        flooded_km = np.bincount(edges, weights=edge_length * flooded, minlength=n) / 1000
        blocked_km = np.bincount(edges, weights=edge_length * impassable, minlength=n) / 1000
        affected = np.bincount(buildings[buildings_flooded], minlength=n)
        return [dict(name=self.neighborhoods[i]["name"], flooded_road_km=round(float(flooded_km[i]), 2),
                     blocked_road_km=round(float(blocked_km[i]), 2), affected_buildings=int(affected[i]))
                for i in np.argsort(-flooded_km, kind="stable")]
