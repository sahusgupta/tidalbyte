"""Region configuration for AquaGrid AI.

Each region is a bounding box plus curated points of interest (emergency hospitals and
neighborhoods). Add a new city by adding an entry here and running the pipeline:

    python -m aquagrid.pipeline.build --region <id>
    python -m aquagrid.model.train --region <id>
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"


@dataclass(frozen=True)
class POI:
    id: str
    name: str
    lon: float
    lat: float
    note: str = ""


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    bbox: tuple[float, float, float, float]  # west, south, east, north (WGS84)
    utm_epsg: int
    dem_zoom: int  # Terrarium tile zoom; z14 is ~8.6 m/px at 26°N
    grid_factor: int  # analysis grid = DEM pixels aggregated by this factor
    base_water_level: float  # m above datum, typical high tide (sea level reference for surge)
    hospitals: tuple[POI, ...]
    neighborhoods: tuple[POI, ...]
    view: dict
    blurb: str

    @property
    def raw_dir(self) -> Path:
        return DATA_DIR / "raw" / self.id

    @property
    def out_dir(self) -> Path:
        return DATA_DIR / "processed" / self.id


def _houston_zone(zone_id: str, name: str, bbox: tuple[float, float, float, float], blurb: str, pad: float = 0.008) -> Region:
    """A Houston simulation region matching an EarthLab zone (same id). Hospitals and destination
    neighbourhoods are derived from Overture places/divisions at build time (see pipeline/build.py)."""
    import math

    w, s, e, n = bbox
    padded = (w - pad, s - pad, e + pad, n + pad)
    lat = (s + n) / 2
    extent_km = max((e - w) * 111.32 * math.cos(math.radians(lat)), (n - s) * 110.57)
    return Region(
        id=zone_id,
        name=f"Houston: {name}",
        bbox=padded,
        utm_epsg=32615,
        dem_zoom=14,
        grid_factor=2,
        base_water_level=0.30,
        hospitals=(),
        neighborhoods=(),
        view=dict(longitude=(w + e) / 2, latitude=lat, zoom=round(13.3 + math.log2(9 / extent_km), 2), pitch=52, bearing=-18),
        blurb=blurb,
    )


HOUSTON_ZONES = [
    _houston_zone("downtown-buffalo-bayou", "Downtown & Buffalo Bayou", (-95.43, 29.735, -95.335, 29.79),
                  "Downtown core and the Buffalo Bayou corridor. Inland: flooding here is rain- and bayou-driven, not surge."),
    _houston_zone("medical-center-brays", "Medical Center & Brays Bayou", (-95.435, 29.68, -95.37, 29.725),
                  "Texas Medical Center, Hermann Park and Brays Bayou. Rain- and bayou-driven flooding."),
    _houston_zone("meyerland", "Meyerland", (-95.49, 29.665, -95.435, 29.705),
                  "Residential neighbourhood along Brays Bayou. Rain- and bayou-driven flooding."),
    _houston_zone("ship-channel", "Ship Channel & Pasadena", (-95.25, 29.69, -95.1, 29.765),
                  "Industrial corridor on the Houston Ship Channel; low ground connected to Galveston Bay."),
    _houston_zone("kingwood-lake-houston", "Kingwood & Lake Houston", (-95.3, 29.98, -95.13, 30.09),
                  "San Jacinto River and Lake Houston; the reach USGS mapped after Hurricane Harvey."),
]

REGIONS: dict[str, Region] = {r.id: r for r in HOUSTON_ZONES}
DEFAULT_REGION = "downtown-buffalo-bayou"
