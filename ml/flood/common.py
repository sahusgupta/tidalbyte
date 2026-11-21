"""Shared pieces of the Harvey flood-depth pipeline: grids, data access, terrain hydrology, rainfall.

Sources (see data/provenance/flood_sources.md for full citations):
  - labels: USGS Harvey flood documentation, Watson et al. 2018, doi:10.5066/F7VH5N3N
  - terrain: USGS 3D Elevation Program (3DEP) bare-earth DEM, 3DEPElevation ImageServer
  - impervious: NLCD 2016 fractional impervious surface (MRLC), doi:10.5066/P96HHBIE
  - rainfall: NOAA GHCN-Daily precipitation (COOP + CoCoRaHS stations), NCEI Access Data Service
    (USGS NWIS precipitation (00045) series exist but return no values for these events)
  - river stage: USGS NWIS instantaneous gage height (00065), doi:10.5066/F7P55KJN
"""
from __future__ import annotations

import io
import json
import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import yaml

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

UA = {"User-Agent": "hackathon-ml/0.1"}
THREEDEP = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
MRLC_WCS = "https://www.mrlc.gov/geoserver/ows"
NLCD_COVERAGE = "mrlc_download__NLCD_2016_Impervious_L48"

FEATURES = [
    "elev",               # m NAVD88, 3DEP
    "slope_pct",
    "hand",               # m above nearest stream along D8 flow path
    "dist_stream",        # m to nearest stream cell
    "log_up_km2",         # log10 upstream area at the cell
    "log_stream_up_km2",  # log10 upstream area of the nearest stream (river size)
    "twi",                # topographic wetness index
    "tpi",                # elevation minus 300 m neighbourhood mean
    "sink_depth",         # depression storage depth (filled - raw), m
    "imperv",             # NLCD 2016 impervious %, 0-100
    "rain_mm",            # storm-total rainfall interpolated from NOAA GHCN-Daily stations
]
FEATURE_LABELS = {
    "elev": "Ground elevation", "slope_pct": "Slope", "hand": "Height above nearest stream (HAND)",
    "dist_stream": "Distance to stream", "log_up_km2": "Upstream area", "log_stream_up_km2": "River size",
    "twi": "Wetness index (TWI)", "tpi": "Local low spot (TPI)", "sink_depth": "Depression depth",
    "imperv": "Impervious surface", "rain_mm": "Storm rainfall",
}


def load_cfg(path: str | Path | None = None) -> dict:
    return yaml.safe_load(open(path or ROOT / "ml" / "flood" / "config.yaml"))


def p(rel: str) -> Path:
    return ROOT / rel


def log(msg: str):
    print(f"[flood {time.strftime('%H:%M:%S')}] {msg}", flush=True)


# numpy 2.x removed np.in1d, which pysheds 0.5 still calls
if not hasattr(np, "in1d"):
    np.in1d = lambda a, b, assume_unique=False, invert=False: np.isin(  # type: ignore[attr-defined]
        np.ravel(a), b, assume_unique=assume_unique, invert=invert)


# ------------------------------------------------------------------------------------ grid
@dataclass
class GridSpec:
    x0: float  # left edge (m, EPSG:crs)
    y0: float  # top edge
    res: float
    width: int
    height: int
    crs: int

    @property
    def transform(self):
        from rasterio.transform import from_origin

        return from_origin(self.x0, self.y0, self.res, self.res)

    @property
    def bounds(self):
        return (self.x0, self.y0 - self.height * self.res, self.x0 + self.width * self.res, self.y0)

    @classmethod
    def around(cls, bounds, res, margin, crs):
        minx, miny, maxx, maxy = bounds
        x0 = math.floor((minx - margin) / res) * res
        y0 = math.ceil((maxy + margin) / res) * res
        w = int(math.ceil((maxx + margin - x0) / res))
        h = int(math.ceil((y0 - (miny - margin)) / res))
        return cls(x0, y0, res, w, h, crs)

    def centers(self):
        xs = self.x0 + (np.arange(self.width) + 0.5) * self.res
        ys = self.y0 - (np.arange(self.height) + 0.5) * self.res
        return xs, ys

    def rc(self, x, y):
        return ((self.y0 - np.asarray(y)) // self.res).astype(int), ((np.asarray(x) - self.x0) // self.res).astype(int)

    def to_json(self):
        return asdict(self)


def save_grid(g: GridSpec, path: Path):
    path.write_text(json.dumps(g.to_json()))


def load_grid(path: Path) -> GridSpec:
    return GridSpec(**json.loads(path.read_text()))


# ------------------------------------------------------------------------------------ 3DEP
def _get(url, params, tries=5, timeout=240):
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=timeout)
            r.raise_for_status()
            if "xml" in r.headers.get("content-type", "") or "json" in r.headers.get("content-type", ""):
                raise RuntimeError(r.text[:300])
            return r.content
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(4 * (i + 1))
    raise RuntimeError(f"request failed after {tries} tries: {last}")


def fetch_3dep(grid: GridSpec, cache: Path, tile_px: int = 2000) -> np.ndarray:
    """Bare-earth elevation (m) on `grid`, requested tile by tile from the 3DEP ImageServer."""
    import rasterio
    from rasterio.io import MemoryFile

    if cache.exists():
        with rasterio.open(cache) as ds:
            return ds.read(1)
    out = np.full((grid.height, grid.width), np.nan, dtype=np.float32)
    jobs = []
    for r0 in range(0, grid.height, tile_px):
        for c0 in range(0, grid.width, tile_px):
            h, w = min(tile_px, grid.height - r0), min(tile_px, grid.width - c0)
            x0 = grid.x0 + c0 * grid.res
            y1 = grid.y0 - r0 * grid.res
            bbox = (x0, y1 - h * grid.res, x0 + w * grid.res, y1)
            jobs.append((r0, c0, h, w, bbox))

    def run(job):
        r0, c0, h, w, bbox = job
        content = _get(THREEDEP, dict(bbox=",".join(f"{v:.3f}" for v in bbox), bboxSR=grid.crs, imageSR=grid.crs,
                                      size=f"{w},{h}", format="tiff", pixelType="F32",
                                      interpolation="RSP_BilinearInterpolation", f="image"))
        with MemoryFile(content) as mf, mf.open() as ds:
            a = ds.read(1).astype(np.float32)
        a[(a < -100) | (a > 9000)] = np.nan
        return r0, c0, a

    with ThreadPoolExecutor(3) as ex:
        for r0, c0, a in ex.map(run, jobs):
            out[r0:r0 + a.shape[0], c0:c0 + a.shape[1]] = a
    cache.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(cache, "w", driver="GTiff", height=grid.height, width=grid.width, count=1, dtype="float32",
                       crs=f"EPSG:{grid.crs}", transform=grid.transform, nodata=np.nan, compress="deflate") as ds:
        ds.write(out, 1)
    return out


# ------------------------------------------------------------------------------------ NLCD
NLCD_LANDCOVER = "mrlc_download__NLCD_2016_Land_Cover_L48"


def fetch_nlcd_impervious(grid: GridSpec, cache: Path) -> np.ndarray:
    return fetch_nlcd(grid, cache, NLCD_COVERAGE, "imperv")


def fetch_nlcd_water(grid: GridSpec, cache: Path) -> np.ndarray:
    """Fraction of each cell that NLCD 2016 classifies as open water (class 11)."""
    return fetch_nlcd(grid, cache, NLCD_LANDCOVER, "water")


def fetch_nlcd(grid: GridSpec, cache: Path, coverage: str, kind: str) -> np.ndarray:
    """NLCD 2016 layer resampled (area-average) onto `grid`: impervious % (0-100) or open-water fraction."""
    import pyproj
    import rasterio
    from rasterio.io import MemoryFile
    from rasterio.warp import Resampling, reproject

    if cache.exists():
        with rasterio.open(cache) as ds:
            return ds.read(1)
    t = pyproj.Transformer.from_crs(grid.crs, 5070, always_xy=True)
    minx, miny, maxx, maxy = grid.bounds
    xs, ys = t.transform([minx, maxx, minx, maxx], [miny, miny, maxy, maxy])
    pad = 300
    params = [("service", "WCS"), ("version", "2.0.1"), ("request", "GetCoverage"), ("coverageId", coverage),
              ("subset", f"X({min(xs) - pad:.0f},{max(xs) + pad:.0f})"),
              ("subset", f"Y({min(ys) - pad:.0f},{max(ys) + pad:.0f})"), ("format", "image/geotiff")]
    content = _get(MRLC_WCS, params)
    out = np.zeros((grid.height, grid.width), dtype=np.float32)
    with MemoryFile(content) as mf, mf.open() as src:
        a = src.read(1).astype(np.float32)
        if kind == "imperv":  # 0 is a real value (0 %), despite nodata=0 in the header
            a[a > 100] = np.nan  # 127 / 255 fill values
        else:  # land cover: 0 = no data, 11 = open water
            a = np.where(a == 0, np.nan, (a == 11).astype(np.float32))
        reproject(a, out, src_transform=src.transform, src_crs=src.crs, src_nodata=np.nan,
                  dst_transform=grid.transform, dst_crs=f"EPSG:{grid.crs}", dst_nodata=np.nan,
                  resampling=Resampling.average)
    cache.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(cache, "w", driver="GTiff", height=grid.height, width=grid.width, count=1, dtype="float32",
                       crs=f"EPSG:{grid.crs}", transform=grid.transform, nodata=np.nan, compress="deflate") as ds:
        ds.write(out, 1)
    return out


# ------------------------------------------------------------------------------------ terrain
def terrain_features(elev: np.ndarray, grid: GridSpec, stream_threshold_km2: float) -> dict[str, np.ndarray]:
    import pyproj
    from pysheds.grid import Grid
    from pysheds.sview import Raster, ViewFinder
    from scipy import ndimage

    z = elev.astype(np.float64)
    missing = ~np.isfinite(z)
    if missing.any():  # fill gaps (open water / nodata) from nearest valid cell
        idx = ndimage.distance_transform_edt(missing, return_distances=False, return_indices=True)
        z = z[tuple(idx)]
    vf = ViewFinder(affine=grid.transform, shape=z.shape, crs=pyproj.Proj(f"EPSG:{grid.crs}"),
                    nodata=np.float64(-9999.0))
    g = Grid(viewfinder=vf)
    dem = Raster(z, viewfinder=vf)
    filled = g.fill_depressions(g.fill_pits(dem))
    inflated = g.resolve_flats(filled)
    fdir = g.flowdir(inflated)
    acc = np.asarray(g.accumulation(fdir), dtype=np.float64)
    cell_km2 = (grid.res ** 2) / 1e6
    streams = acc * cell_km2 >= stream_threshold_km2
    mask_vf = ViewFinder(affine=grid.transform, shape=z.shape, crs=pyproj.Proj(f"EPSG:{grid.crs}"), nodata=False)
    hand = np.asarray(g.compute_hand(fdir, dem, Raster(streams, viewfinder=mask_vf)), dtype=np.float64)
    hand = np.where(np.isfinite(hand), hand, np.nan)

    dist, (ri, ci) = ndimage.distance_transform_edt(~streams, return_indices=True)
    stream_up = acc[ri, ci] * cell_km2

    smooth = ndimage.gaussian_filter(z, 1.0)
    gy, gx = np.gradient(smooth, grid.res)
    tanb = np.hypot(gx, gy)
    sig = 300.0 / grid.res
    tpi = z - ndimage.gaussian_filter(z, sig)
    twi = np.log((acc * grid.res) / np.maximum(tanb, 0.001))
    out = dict(
        elev=z, slope_pct=100 * tanb, hand=hand, dist_stream=dist * grid.res,
        log_up_km2=np.log10(acc * cell_km2), log_stream_up_km2=np.log10(np.maximum(stream_up, 1e-6)),
        twi=twi, tpi=tpi, sink_depth=np.asarray(filled, dtype=np.float64) - z,
    )
    out = {k: v.astype(np.float32) for k, v in out.items()}
    out["dem_missing"] = missing
    out["streams"] = streams
    return out


# ------------------------------------------------------------------------------------ rainfall
def gauge_sites(nwis_dir: Path) -> pd.DataFrame:
    lines = [ln for ln in (nwis_dir / "sites_expanded.rdb").read_text().splitlines() if not ln.startswith("#")]
    hdr = lines[0].split("\t")
    rows = [dict(zip(hdr, ln.split("\t"))) for ln in lines[2:] if ln.strip()]
    df = pd.DataFrame(rows)
    df["lat"] = pd.to_numeric(df.dec_lat_va, errors="coerce")
    df["lon"] = pd.to_numeric(df.dec_long_va, errors="coerce")
    return df[["site_no", "station_nm", "lat", "lon", "county_cd", "alt_va", "alt_datum_cd", "drain_area_va"]]


def event_rain_totals(nwis_dir: Path, event: str, start: str, end: str, min_coverage: float = 0.8) -> pd.DataFrame:
    """Storm-total rainfall (mm) per USGS rain gauge from 15-min increments (param 00045, inches)."""
    data = json.loads((nwis_dir / f"iv_{event}.json").read_text())
    t0 = pd.Timestamp(start, tz="America/Chicago")
    t1 = pd.Timestamp(end, tz="America/Chicago") + pd.Timedelta(days=1)
    expected = (t1 - t0) / pd.Timedelta(minutes=15)
    rows = []
    for ts in data["value"]["timeSeries"]:
        if ts["variable"]["variableCode"][0]["value"] != "00045":
            continue
        site = ts["sourceInfo"]["siteCode"][0]["value"]
        vals = ts["values"][0]["value"]
        if not vals:
            continue
        s = pd.DataFrame(vals)
        s["t"] = pd.to_datetime(s.dateTime, utc=True)
        s["v"] = pd.to_numeric(s.value, errors="coerce")
        s = s[(s.t >= t0) & (s.t < t1) & (s.v >= 0) & (s.v < 20)]
        cov = len(s) / expected
        rows.append(dict(site_no=site, total_mm=float(s.v.sum() * 25.4), coverage=round(cov, 3),
                         used=cov >= min_coverage))
    tot = pd.DataFrame(rows)
    return tot.merge(gauge_sites(nwis_dir), on="site_no", how="left")


def idw(grid: GridSpec, x: np.ndarray, y: np.ndarray, v: np.ndarray, power: float = 2.0, step: int = 10) -> np.ndarray:
    """Inverse-distance interpolation on a coarse lattice, then bilinear upsampling to the grid."""
    xs, ys = grid.centers()
    xc, yc = xs[::step], ys[::step]
    X, Y = np.meshgrid(xc, yc)
    d2 = (X[..., None] - x) ** 2 + (Y[..., None] - y) ** 2
    w = 1.0 / np.maximum(d2, 1.0) ** (power / 2)
    coarse = (w * v).sum(-1) / w.sum(-1)
    # exact-size separable linear interpolation (ys decrease downward, so flip for np.interp)
    rows = np.stack([np.interp(xs, xc, r) for r in coarse])  # (len(yc), W)
    out = np.empty((grid.height, grid.width), dtype=np.float32)
    for j in range(grid.width):
        out[:, j] = np.interp(ys[::-1], yc[::-1], rows[::-1, j])[::-1]
    return out


def ghcn_storm_totals(ghcn_dir: Path, event: str, start: str, end: str, min_day_frac: float = 0.85) -> pd.DataFrame:
    """Storm-total precipitation (mm) per NOAA GHCN-Daily station; stations missing >15 % of days dropped."""
    d = pd.DataFrame(json.loads((ghcn_dir / f"prcp_{event}.json").read_text()))
    d["PRCP"] = pd.to_numeric(d["PRCP"], errors="coerce")
    d = d[(d.DATE >= start) & (d.DATE <= end)]
    n_days = (pd.Timestamp(end) - pd.Timestamp(start)).days + 1
    g = d.groupby("STATION").agg(days=("PRCP", "count"), total_mm=("PRCP", "sum"), lat=("LATITUDE", "first"),
                                 lon=("LONGITUDE", "first"), name=("NAME", "first")).reset_index()
    g["lat"] = pd.to_numeric(g.lat, errors="coerce")
    g["lon"] = pd.to_numeric(g.lon, errors="coerce")
    g["used"] = (g.days >= min_day_frac * n_days) & g.lat.notna()
    return g
