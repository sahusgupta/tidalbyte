"""Digital elevation model: download AWS Terrain Tiles (Terrarium encoding, USGS 3DEP in the US)
and expose a Web-Mercator-aligned analysis grid.

The grid lives in Web Mercator pixel space so the flood overlay drops straight onto the
map as a bitmap with no reprojection.
"""
from __future__ import annotations

import io
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import requests
from PIL import Image
from scipy.ndimage import map_coordinates

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
UA = {"User-Agent": "AquaGridAI-hackathon/0.1"}


def lonlat_to_px(lon, lat, z: int):
    n = 256 * 2**z
    lon = np.asarray(lon, dtype=np.float64)
    lat = np.radians(np.asarray(lat, dtype=np.float64))
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - np.arcsinh(np.tan(lat)) / np.pi) / 2.0 * n
    return x, y


def px_to_lonlat(x, y, z: int):
    n = 256 * 2**z
    lon = np.asarray(x, dtype=np.float64) / n * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * np.asarray(y, dtype=np.float64) / n))))
    return lon, lat


@dataclass
class Grid:
    """Raster grid in Web Mercator pixel space at zoom `z`, aggregated by `factor`."""

    z: int
    x0: int  # global pixel x of the left edge (at zoom z)
    y0: int  # global pixel y of the top edge
    factor: int
    width: int
    height: int
    cell_m: float  # ground size of one cell in metres

    def lonlat_to_rc(self, lon, lat):
        """Fractional (row, col) in cell-centre coordinates."""
        x, y = lonlat_to_px(lon, lat, self.z)
        col = (x - self.x0) / self.factor - 0.5
        row = (y - self.y0) / self.factor - 0.5
        return row, col

    def cell_centers_lonlat(self):
        cols = (np.arange(self.width) + 0.5) * self.factor + self.x0
        rows = (np.arange(self.height) + 0.5) * self.factor + self.y0
        X, Y = np.meshgrid(cols, rows)
        return px_to_lonlat(X, Y, self.z)

    def bounds_lonlat(self):
        west, north = px_to_lonlat(self.x0, self.y0, self.z)
        east, south = px_to_lonlat(self.x0 + self.width * self.factor, self.y0 + self.height * self.factor, self.z)
        return [float(west), float(south), float(east), float(north)]

    def sample(self, arr: np.ndarray, lon, lat, order: int = 1):
        r, c = self.lonlat_to_rc(lon, lat)
        r = np.clip(r, 0, self.height - 1)
        c = np.clip(c, 0, self.width - 1)
        return map_coordinates(arr, [np.atleast_1d(r), np.atleast_1d(c)], order=order, mode="nearest")

    def to_json(self):
        return asdict(self)

    @classmethod
    def from_json(cls, d):
        return cls(**d)


def _grid_for_bbox(bbox, z: int, factor: int) -> Grid:
    west, south, east, north = bbox
    px0, py0 = lonlat_to_px(west, north, z)
    px1, py1 = lonlat_to_px(east, south, z)
    px0, py0 = int(math.floor(px0)), int(math.floor(py0))
    w = (int(math.ceil(px1)) - px0) // factor
    h = (int(math.ceil(py1)) - py0) // factor
    cell_m = 156543.03392 * math.cos(math.radians((south + north) / 2)) / 2**z * factor
    return Grid(z=z, x0=px0, y0=py0, factor=factor, width=w, height=h, cell_m=cell_m)


def _mercator_bounds(grid: Grid):
    R = 6378137.0
    n = 256 * 2**grid.z
    to_m = lambda p: p / n * 2 * math.pi * R - math.pi * R
    xmin, xmax = to_m(grid.x0), to_m(grid.x0 + grid.width * grid.factor)
    ymax = -to_m(grid.y0)
    ymin = -to_m(grid.y0 + grid.height * grid.factor)
    return xmin, ymin, xmax, ymax


THREEDEP_URL = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"


def _fetch_3dep(grid: Grid, cache: Path) -> np.ndarray:
    """USGS 3DEP bare-earth DEM (lidar-derived, NAVD88 metres), resampled onto the grid at zoom-z pixels."""
    f = cache / f"3dep_{grid.z}_{grid.x0}_{grid.y0}_{grid.width * grid.factor}x{grid.height * grid.factor}.tif"
    if not f.exists():
        xmin, ymin, xmax, ymax = _mercator_bounds(grid)
        params = dict(
            bbox=f"{xmin},{ymin},{xmax},{ymax}", bboxSR=3857, imageSR=3857,
            size=f"{grid.width * grid.factor},{grid.height * grid.factor}", format="tiff",
            pixelType="F32", interpolation="RSP_BilinearInterpolation", f="image",
        )
        last = None
        for attempt in range(4):
            try:
                r = requests.get(THREEDEP_URL, params=params, headers=UA, timeout=180)
                r.raise_for_status()
                if not r.headers.get("content-type", "").startswith("image/"):
                    raise RuntimeError(f"unexpected response: {r.text[:200]}")
                f.write_bytes(r.content)
                break
            except Exception as e:  # noqa: BLE001
                last = e
                time.sleep(3 * 2**attempt)
        else:
            raise RuntimeError(f"3DEP request failed: {last}")
    a = np.asarray(Image.open(f), dtype=np.float64)
    a[~np.isfinite(a) | (a < -30) | (a > 120)] = np.nan  # nodata / corrupt blocks
    return a


def _fetch_tile(z, x, y, cache: Path) -> np.ndarray:
    f = cache / f"{z}_{x}_{y}.png"
    if not f.exists():
        r = requests.get(TILE_URL.format(z=z, x=x, y=y), headers=UA, timeout=60)
        r.raise_for_status()
        f.write_bytes(r.content)
    rgb = np.asarray(Image.open(f).convert("RGB"), dtype=np.float64)
    return rgb[..., 0] * 256.0 + rgb[..., 1] + rgb[..., 2] / 256.0 - 32768.0


def _fetch_terrarium(grid: Grid, cache: Path) -> np.ndarray:
    """Fallback: AWS Terrain Tiles. Global, but mixes sources and can contain block artifacts."""
    z, px0, py0 = grid.z, grid.x0, grid.y0
    px1, py1 = px0 + grid.width * grid.factor, py0 + grid.height * grid.factor
    tx0, ty0, tx1, ty1 = px0 // 256, py0 // 256, (px1 - 1) // 256, (py1 - 1) // 256
    tiles = [(tx, ty) for ty in range(ty0, ty1 + 1) for tx in range(tx0, tx1 + 1)]
    with ThreadPoolExecutor(8) as ex:
        arrs = list(ex.map(lambda t: _fetch_tile(z, t[0], t[1], cache), tiles))
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256))
    for (tx, ty), a in zip(tiles, arrs):
        mosaic[(ty - ty0) * 256 : (ty - ty0 + 1) * 256, (tx - tx0) * 256 : (tx - tx0 + 1) * 256] = a
    return mosaic[py0 - ty0 * 256 : py1 - ty0 * 256, px0 - tx0 * 256 : px1 - tx0 * 256]


def fetch_dem(bbox, z: int, factor: int, cache: Path, source: str = "3dep") -> tuple[np.ndarray, np.ndarray, Grid]:
    """Return (elevation, nodata_mask, grid) on the analysis grid (block mean of zoom-z pixels)."""
    cache.mkdir(parents=True, exist_ok=True)
    grid = _grid_for_bbox(bbox, z, factor)
    if source == "3dep":
        try:
            full = _fetch_3dep(grid, cache)
        except Exception as e:  # noqa: BLE001
            print(f"[dem] 3DEP unavailable ({e}); falling back to Terrarium tiles")
            full = _fetch_terrarium(grid, cache)
    else:
        full = _fetch_terrarium(grid, cache)
    h, w, f = grid.height, grid.width, grid.factor
    blocks = full[: h * f, : w * f].reshape(h, f, w, f)
    nodata = np.isnan(blocks).mean(axis=(1, 3)) > 0.5
    with np.errstate(all="ignore"):
        elev = np.nanmean(blocks, axis=(1, 3))
    elev[nodata] = np.nan
    return elev.astype(np.float32), nodata, grid


def save_grid(grid: Grid, path: Path):
    path.write_text(json.dumps(grid.to_json()))


def load_grid(path: Path) -> Grid:
    return Grid.from_json(json.loads(path.read_text()))
