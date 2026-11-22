"""Build the census-tract files behind the simulator's "Relief money" overlay.

For each Houston simulator region this writes simulator/frontend/public/relief/<region>.json:
the 2020 census tracts covering the region's map box, clipped to it, with
  * residents living in the clipped part (tract population x share of tract land area),
  * CDC/ATSDR Social Vulnerability Index 2022 measures (Texas percentile, poverty,
    households without a vehicle, age 65+, disability, uninsured, limited English),
  * a friendly place name from the region's Overture neighbourhood points.
Flood impact is NOT stored here: the simulator computes it live from each storm's modeled
per-building depths and ambulance access, so the overlay follows whatever storm is on screen.

Inputs (downloaded once, kept out of Git):
  --svi      CDC/ATSDR SVI 2022, Texas, census tracts (CSV)
             https://svi.cdc.gov/Documents/Data/2022/csv/states/Texas.csv
  --tracts   Census TIGERweb 2020 tract polygons (GeoJSON pages), Harris + Montgomery counties
             https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/10
Overture neighbourhood points are read from simulator/data/raw/<region>/division.parquet
(downloaded by the simulator pipeline); without them tracts keep their census label.

    python ml/relief/build_relief.py \\
        --svi ../ml-work/data/raw/svi/SVI_2022_Texas.csv \\
        --tracts "../ml-work/data/raw/svi/tracts2020_*.geojson"
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[2]
SIM_BACKEND = ROOT / "simulator/backend"
SIM_RAW = ROOT / "simulator/data/raw"
DEFAULT_OUT = ROOT / "simulator/frontend/public/relief"

MIN_POP = 50  # ignore slivers of tracts that barely enter the map box
NAME_RADIUS_M = 1500  # "X area" only when a named neighbourhood is this close
SUBTYPE_RANK = {"neighborhood": 0, "microhood": 1, "macrohood": 2, "locality": 3}
SVI_FIELDS = {  # SVI column -> output key (percent of residents, except svi = Texas percentile 0-1)
    "RPL_THEMES": "svi",
    "EP_POV150": "poverty",
    "EP_NOVEH": "noVehicle",
    "EP_AGE65": "age65",
    "EP_DISABL": "disability",
    "EP_UNINSUR": "uninsured",
    "EP_LIMENG": "limitedEnglish",
}
SOURCES = [
    dict(name="CDC/ATSDR Social Vulnerability Index 2022",
         detail="Census tracts, Texas. ACS 2018-2022 5-year estimates.",
         url="https://www.atsdr.cdc.gov/place-health/php/svi/"),
    dict(name="U.S. Census Bureau TIGERweb 2020 census tracts",
         detail="Harris and Montgomery counties.",
         url="https://tigerweb.geo.census.gov/"),
    dict(name="Overture Maps divisions",
         detail="Neighbourhood names.",
         url="https://docs.overturemaps.org/"),
]


def tract_label(geoid: str) -> str:
    base, suffix = int(geoid[-6:-2]), geoid[-2:]
    return f"Tract {base}" + ("" if suffix == "00" else f".{suffix}")


def rings(geom, ndigits=5) -> list:
    """Polygon/MultiPolygon -> exterior rings as [[lon, lat], ...] (holes dropped; display only)."""
    polys = [geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))
    return [[[round(x, ndigits), round(y, ndigits)] for x, y in p.exterior.coords]
            for p in polys if p.geom_type == "Polygon" and not p.is_empty]


def load_tracts(pattern: str, svi_csv: str) -> gpd.GeoDataFrame:
    files = sorted(glob.glob(pattern))
    if not files:
        sys.exit(f"no tract files match {pattern}")
    tracts = gpd.GeoDataFrame(pd.concat([gpd.read_file(f) for f in files], ignore_index=True),
                              geometry="geometry", crs="EPSG:4326").drop_duplicates("GEOID")
    svi = pd.read_csv(svi_csv, dtype={"FIPS": str}, encoding="utf-8-sig")
    svi = svi[["FIPS", "E_TOTPOP", *SVI_FIELDS]].rename(columns={"FIPS": "GEOID"})
    merged = tracts.merge(svi, on="GEOID", how="left")
    print(f"tracts: {len(merged)} polygons, {int(merged.E_TOTPOP.isna().sum())} without an SVI row")
    return merged


def neighbourhoods(region_id: str) -> gpd.GeoDataFrame | None:
    path = SIM_RAW / region_id / "division.parquet"
    if not path.exists():
        return None
    d = gpd.read_parquet(path)
    d = d[d.subtype.isin(SUBTYPE_RANK) & (d.geometry.geom_type == "Point")].copy()
    d["name"] = d.names.apply(lambda v: (v or {}).get("primary") if v is not None else None)
    d = d[d.name.notna()]
    d["rank"] = d.subtype.map(SUBTYPE_RANK)
    return d.set_crs(4326, allow_override=True).to_crs(32615)


def place_name(part_m, hoods: gpd.GeoDataFrame | None) -> str | None:
    """A neighbourhood point inside the tract part, else '<closest> area' within NAME_RADIUS_M."""
    if hoods is None or hoods.empty:
        return None
    inside = hoods[hoods.within(part_m)]
    if not inside.empty:
        return str(inside.sort_values("rank").iloc[0]["name"])
    dist = hoods.distance(part_m)
    i = dist.idxmin()
    return f"{hoods.loc[i, 'name']} area" if dist[i] <= NAME_RADIUS_M else None


def build(svi_csv: str, tract_glob: str, out_dir: Path):
    sys.path.insert(0, str(SIM_BACKEND))
    from aquagrid.config import REGIONS

    tracts = load_tracts(tract_glob, svi_csv)
    tracts["area_m2"] = tracts.to_crs(32615).area
    out_dir.mkdir(parents=True, exist_ok=True)
    for region in REGIONS.values():
        frame = box(*region.bbox)
        near = tracts[tracts.intersects(frame) & tracts.E_TOTPOP.notna()].copy()
        parts = gpd.GeoSeries(near.geometry.intersection(frame), crs=4326)
        parts_m = parts.to_crs(32615)
        near["frac"] = (parts_m.area / near.area_m2).clip(0, 1).to_numpy()
        hoods = neighbourhoods(region.id)
        rows = []
        for (idx, t), part, part_m in zip(near.iterrows(), parts, parts_m):
            population = int(round(t.E_TOTPOP * t.frac))
            if population < MIN_POP or part.is_empty:
                continue
            vuln = {key: (None if pd.isna(t[col]) or t[col] < 0 else round(float(t[col]), 4 if key == "svi" else 1))
                    for col, key in SVI_FIELDS.items()}
            anchor = part.representative_point()
            rows.append(dict(
                geoid=t.GEOID, label=tract_label(t.GEOID), name=place_name(part_m, hoods),
                population=population, **vuln,
                anchor=[round(anchor.x, 5), round(anchor.y, 5)],
                outline=rings(part.simplify(0.0002, preserve_topology=True)),
            ))
        rows.sort(key=lambda r: r["geoid"])
        path = out_dir / f"{region.id}.json"
        path.write_text(json.dumps(dict(version=1, region=region.id, generated=date.today().isoformat(),
                                        sources=SOURCES, tracts=rows), separators=(",", ":")))
        named = sum(r["name"] is not None for r in rows)
        print(f"{region.id}: {len(rows)} tracts ({named} named), {sum(r['population'] for r in rows):,} residents, "
              f"{path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--svi", required=True)
    ap.add_argument("--tracts", required=True, help="glob of TIGERweb GeoJSON pages")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    build(args.svi, args.tracts, args.out)
