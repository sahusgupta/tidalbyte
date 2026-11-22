"""End-to-end data pipeline.

    python -m aquagrid.pipeline.build --region downtown-buffalo-bayou

1. Download Overture Maps (OSM-derived) roads, connectors, buildings, water for the bbox
2. Download USGS 3DEP bare-earth DEM (falls back to AWS Terrain Tiles)
3. Terrain hydrology: fill, flow accumulation, TWI, HAND, sea-connectivity thresholds
4. Routable road graph (edges split at connectors, bridges flagged)
5. Static features for edges / buildings / grid cells
6. Export compact static JSON for the web client
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import warnings
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import orjson
import shapely

import re

from ..config import DEFAULT_REGION, POI, REGIONS
from ..geometry import prepare_geometry
from ..routing import NodeIndex
from . import features as F
from . import hydrology
from .dem import fetch_dem, save_grid
from .network import CLASS_NAMES, build_buildings, build_edges

warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", message=".*geographic CRS.*")

OVERTURE_TYPES = ["segment", "connector", "building", "water", "place", "division"]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def ensure_overture(region):
    region.raw_dir.mkdir(parents=True, exist_ok=True)
    w, s, e, n = region.bbox
    exe = Path(sys.executable).with_name("overturemaps")
    for t in OVERTURE_TYPES:
        out = region.raw_dir / f"{t}.parquet"
        if out.exists():
            continue
        log(f"downloading Overture {t} ...")
        subprocess.run(
            [str(exe), "download", f"--bbox={w},{s},{e},{n}", "-f", "geoparquet", f"--type={t}", "-o", str(out)],
            check=True,
        )


def water_geoms(path):
    w = gpd.read_parquet(path)
    w = w[w["class"] != "swimming_pool"]
    polys = w[w.geom_type.isin(["Polygon", "MultiPolygon"])].geometry.tolist()
    lines = w[w.geom_type.isin(["LineString", "MultiLineString"])].geometry
    polys += [g.buffer(8e-5) for g in lines]  # ~8 m half-width for canals / drains
    return polys


def r6(a):
    return np.round(np.asarray(a, dtype=np.float64), 6).tolist()


HOSPITAL_CATS = {"hospital", "emergency_department", "emergency_room", "specialty_hospital",
                 "emergency_or_urgent_care_facility"}
ER_CATS = {"emergency_department", "emergency_room", "emergency_or_urgent_care_facility"}
# Overture files county/trauma hospitals under these too (e.g. Ben Taub General Hospital is "health_care").
MAJOR_CATS = HOSPITAL_CATS | {"general_hospital", "health_care"}
HOSPITAL_NAME = re.compile(r"hospital|medical center|medical centre|emergency", re.I)
# Major acute-care hospitals (trauma centres, county "general" hospitals) can sit in any health category.
MAJOR_HOSPITAL = re.compile(r"trauma|general hospital", re.I)
ER_NAME = re.compile(r"emergency|\bER\b", re.I)
HOSPITAL_EXCLUDE = re.compile(
    r"clinic|dental|dentist|eye|vision|animal|veterin|imaging|radiolog|lab\b|laborator|rehab|hospice|pharmacy|sleep|"
    r"surgery center|urgent care|wellness|spine|ketamine|orthodont|physical therapy|counsel|behavioral|psychiatr|"
    r"dialysis|fertility|cosmetic|plastic surg|weight|vein|foundation|auxiliary|gift shop|parking|cafeteria|"
    # long-term / post-acute care: no emergency department
    r"kindred|select specialty|long[- ]term|\bltac|nursing|skilled|cancer|medical group|human resources|outpatient|"
    r"resilience|recovery|ortho\b|cleaning",
    re.I,
)
NEIGHBOURHOOD_SUBTYPES = {"neighborhood", "microhood", "macrohood", "locality"}


def _slug(text: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40].rstrip("-") or "poi"
    slug, k = base, 2
    while slug in taken:
        slug, k = f"{base}-{k}", k + 1
    taken.add(slug)
    return slug


def _metres(lon1, lat1, lon2, lat2):
    k = np.cos(np.radians((lat1 + lat2) / 2))
    return float(np.hypot((lon2 - lon1) * k * 111_320, (lat2 - lat1) * 110_570))


# Audited 2026-11-21: this BrightQuery record calls the Holly Hall outpatient site
# "Ben Taub General Hospital". Harris Health places Ben Taub at 1504 Taub Loop,
# and Smith Clinic at 2525-A Holly Hall. Restrict the exclusion to this source
# record near the erroneous point, so a corrected future location remains usable.
# https://www.harrishealth.org/locations-hh/Pages/ben-taub.aspx
# https://www.harrishealth.org/locations-hh/Pages/smith-clinic.aspx
HOSPITAL_SOURCE_EXCLUSIONS = {
    ("brightquery", "388529825"): (-95.38712, 29.68603),
}


def _excluded_hospital_place(row) -> bool:
    sources = row.get("sources")
    if not isinstance(sources, (list, tuple, np.ndarray)):
        return False
    for source in sources:
        if not isinstance(source, dict):
            continue
        provider = str(source.get("provider") or source.get("dataset") or "").casefold()
        point = HOSPITAL_SOURCE_EXCLUSIONS.get((provider, str(source.get("record_id"))))
        if point and _metres(row.geometry.x, row.geometry.y, *point) < 75:
            return True
    return False


def derive_pois(region) -> tuple[list, list, str]:
    """Emergency origins (hospitals; else fire stations; else the zone centre) and destination
    neighbourhoods from Overture places/divisions inside the region box. Returns (hospitals, hoods, note)."""
    w, s, e, n = region.bbox
    cx, cy = (w + e) / 2, (s + n) / 2
    inside = lambda g: g.geom_type == "Point" and w < g.x < e and s < g.y < n  # noqa: E731
    taken: set[str] = set()
    places = gpd.read_parquet(region.raw_dir / "place.parquet")
    places = places[places.geometry.apply(inside)].copy()
    places["name"] = places.names.apply(lambda v: (v or {}).get("primary") if v is not None else None)
    places = places[places.name.notna()]

    def same_name(a: str, b: str) -> bool:
        a, b = a.lower(), b.lower()
        return a in b or b in a

    def pick(df, limit, min_sep_m, by=("confidence",), ascending=(False,)):
        kept = []
        for _, r in df.sort_values(list(by), ascending=list(ascending)).iterrows():
            if all(_metres(r.geometry.x, r.geometry.y, k.geometry.x, k.geometry.y) > min_sep_m
                   and not same_name(r["name"], k["name"]) for k in kept):
                kept.append(r)
            if len(kept) == limit:
                break
        return kept

    cat = places.basic_category.fillna("")
    major = places.name.str.contains(MAJOR_HOSPITAL) & cat.isin(MAJOR_CATS)
    status = places.operating_status if "operating_status" in places else pd.Series("", index=places.index)
    hosp = places[((cat.isin(HOSPITAL_CATS) & places.name.str.contains(HOSPITAL_NAME)) | major)
                  & ~places.name.str.contains(HOSPITAL_EXCLUDE) & (places.confidence >= 0.7)
                  & ~status.fillna("").str.contains("closed")].copy()
    if not hosp.empty:
        hosp = hosp[~hosp.apply(_excluded_hospital_place, axis=1)].copy()
    # rank: trauma / general hospitals, then emergency departments, then other hospitals; confidence within a tier
    hosp["tier"] = np.where(hosp.name.str.contains(MAJOR_HOSPITAL), 0,
                            np.where(hosp.basic_category.isin(ER_CATS) | hosp.name.str.contains(ER_NAME), 1, 2))
    tier_note = {0: "major hospital", 1: "emergency department", 2: "hospital"}
    origins = [POI(_slug(r["name"], taken), r["name"], round(r.geometry.x, 5), round(r.geometry.y, 5),
                   f"Overture place: {tier_note[int(r['tier'])]}")
               for r in pick(hosp, 3, 400, by=("tier", "confidence"), ascending=(True, False))]
    note = "hospitals from Overture places"
    if not origins:
        fire = places[places.basic_category.fillna("").str.contains("fire") & (places.confidence >= 0.6)]
        origins = [POI(_slug(r["name"], taken), r["name"], round(r.geometry.x, 5), round(r.geometry.y, 5),
                       "Overture place: fire station (no hospital in this zone)") for r in pick(fire, 2, 400)]
        note = "no hospital inside the zone; fire stations from Overture places used as response origins"
    if not origins:
        origins = [POI("zone-centre", "Zone centre", round(cx, 5), round(cy, 5), "no hospital or fire station in this zone")]
        note = "no hospital or fire station inside the zone; zone centre used as response origin"

    hoods = []
    div_path = region.raw_dir / "division.parquet"
    if div_path.exists():
        div = gpd.read_parquet(div_path)
        div = div[div.subtype.isin(NEIGHBOURHOOD_SUBTYPES) & div.geometry.apply(inside)].copy()
        div["name"] = div.names.apply(lambda v: (v or {}).get("primary") if v is not None else None)
        div = div[div.name.notna()].drop_duplicates("name")
        o = origins[0]
        div["far"] = [_metres(o.lon, o.lat, g.x, g.y) for g in div.geometry]
        # well-known districts first (Fifth Ward, Third Ward...), then smaller neighbourhoods; farthest first
        div["rank"] = div.subtype.map({"macrohood": 0, "neighborhood": 1, "locality": 2, "microhood": 3})
        for _, r in div.sort_values(["rank", "far"], ascending=[True, False]).iterrows():
            if all(_metres(r.geometry.x, r.geometry.y, h.lon, h.lat) > 600 for h in hoods):
                hoods.append(POI(_slug(r["name"], taken), r["name"], round(r.geometry.x, 5), round(r.geometry.y, 5),
                                 f"Overture division: {r.subtype}"))
            if len(hoods) == 8:
                break
    if len(hoods) < 2:
        for label, x, y in [("North-west of zone", w + (e - w) * 0.2, n - (n - s) * 0.2),
                            ("South-east of zone", e - (e - w) * 0.2, s + (n - s) * 0.2)]:
            hoods.append(POI(_slug(label, taken), label, round(x, 5), round(y, 5), "generic point (no named neighbourhood)"))
    return origins, hoods, note


def export_static(region, grid, edges, node_xy, buildings, bnode, out: Path):
    static = out / "static"
    static.mkdir(parents=True, exist_ok=True)
    roads = dict(
        paths=[r6(np.asarray(g.coords)) for g in edges.geometry],
        cls=edges.cls.astype(int).tolist(),
        bridge=edges.is_bridge.astype(int).tolist(),
        name=[n if isinstance(n, str) else None for n in edges.name],
        len=np.round(edges.length_m.to_numpy(), 1).tolist(),
    )
    (static / "roads.json").write_bytes(orjson.dumps(roads))
    blds = dict(
        polys=[r6(np.asarray(g.exterior.coords)) for g in buildings.geometry],
        h=np.round(buildings.h.to_numpy(), 1).tolist(),
        name=[n if isinstance(n, str) else None for n in buildings.name],
        kind=buildings.kind.astype(str).tolist(),
    )
    (static / "buildings.json").write_bytes(orjson.dumps(blds))
    for name in ("roads.json", "buildings.json"):
        prepare_geometry(static / name)

    meta = dict(
        region=dict(id=region.id, name=region.name, bbox=region.bbox, view=region.view, blurb=region.blurb,
                    base_water_level=region.base_water_level),
        grid=dict(bounds=grid.bounds_lonlat(), width=grid.width, height=grid.height, cell_m=round(grid.cell_m, 2)),
        **resolve_pois(region, node_xy),
        counts=dict(edges=len(edges), nodes=len(node_xy), buildings=len(buildings),
                    road_km=round(float(edges.length_m.sum()) / 1000, 1)),
        road_classes=CLASS_NAMES,
    )
    (static / "meta.json").write_text(json.dumps(meta, indent=1))
    return meta


def resolve_pois(region, node_xy) -> dict:
    """Hospitals and destinations (curated in config.py, else derived from Overture), snapped to road nodes."""
    idx = NodeIndex(node_xy, np.mean(region.bbox[1::2]))
    hospitals, neighborhoods, poi_note = list(region.hospitals), list(region.neighborhoods), "curated in config.py"
    if not hospitals or not neighborhoods:
        h2, n2, poi_note = derive_pois(region)
        hospitals, neighborhoods = hospitals or h2, neighborhoods or n2

    def poi(p):
        i, d = idx.query([p.lon], [p.lat])
        return dict(id=p.id, name=p.name, lon=p.lon, lat=p.lat, note=p.note, node=int(i[0]), snap_m=round(float(d[0]), 1))

    return dict(hospitals=[poi(p) for p in hospitals], neighborhoods=[poi(p) for p in neighborhoods], poi_source=poi_note)


def refresh_pois(region_id: str):
    """Re-derive hospitals/destinations for an already-built region without rerunning the pipeline."""
    region = REGIONS[region_id]
    path = region.out_dir / "static" / "meta.json"
    meta = json.loads(path.read_text())
    meta.update(resolve_pois(region, np.load(region.out_dir / "nodes.npy")))
    path.write_text(json.dumps(meta, indent=1))
    log(f"{region_id}: {[h['name'] for h in meta['hospitals']]}")


def run(region_id: str):
    region = REGIONS[region_id]
    out = region.out_dir
    out.mkdir(parents=True, exist_ok=True)
    ensure_overture(region)

    log("DEM ...")
    elev, nodata, grid = fetch_dem(region.bbox, region.dem_zoom, region.grid_factor, region.raw_dir / "dem")
    log(f"  grid {grid.width}x{grid.height} @ {grid.cell_m:.1f} m")

    log("water mask ...")
    wmask = hydrology.rasterize_polygons(water_geoms(region.raw_dir / "water.parquet"), grid)

    log("hydrology (priority-flood x2, accumulation, TWI, HAND) ...")
    rasters = hydrology.compute(elev, nodata, wmask, grid.cell_m)
    log(f"  water {rasters['water'].mean():.1%}  sea {rasters['sea'].mean():.1%}")

    log("road network ...")
    edges, node_xy = build_edges(region.raw_dir / "segment.parquet", region.raw_dir / "connector.parquet",
                                 region.bbox, region.utm_epsg)
    log(f"  {len(edges)} edges, {len(node_xy)} nodes, {edges.is_bridge.sum()} bridge edges")

    log("buildings ...")
    buildings = build_buildings(region.raw_dir / "building.parquet", region.bbox, region.utm_epsg)
    log(f"  {len(buildings)} buildings")

    log("imperviousness ...")
    eidx, exy, seg_len = F.edge_sample_points(edges)
    rasters["imperv"] = F.imperviousness(grid, buildings, exy, seg_len * F.edge_width(edges, eidx))

    log("features ...")
    fe = F.edge_features(grid, rasters, edges, eidx, exy)
    fb = F.building_features(grid, rasters, buildings)
    fc = F.cell_features(grid, rasters)
    log(f"  edges {len(fe)}, buildings {len(fb)}, land cells {len(fc)}")

    nidx = NodeIndex(node_xy, np.mean(region.bbox[1::2]))
    rp = shapely.get_coordinates(buildings.geometry.representative_point().to_numpy())
    bnode, bdist = nidx.query(rp[:, 0], rp[:, 1])

    log("saving ...")
    save_grid(grid, out / "grid.json")
    np.savez_compressed(out / "rasters.npz", **{k: v for k, v in rasters.items()})
    edges.drop(columns=["u", "v"]).to_parquet(out / "edges.parquet")
    np.save(out / "nodes.npy", node_xy)
    buildings.to_parquet(out / "buildings.parquet")
    fe.to_parquet(out / "feat_edges.parquet")
    fb.to_parquet(out / "feat_buildings.parquet")
    fc.to_parquet(out / "feat_cells.parquet")
    np.save(out / "building_node.npy", np.c_[bnode, bdist])
    meta = export_static(region, grid, edges, node_xy, buildings, bnode, out)
    log(f"done -> {out}  ({meta['counts']})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default=DEFAULT_REGION, choices=list(REGIONS))
    ap.add_argument("--pois-only", action="store_true", help="only re-derive hospitals/destinations of a built region")
    args = ap.parse_args()
    (refresh_pois if args.pois_only else run)(args.region)
