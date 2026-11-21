"""Road network + buildings from Overture Maps (OSM-derived), normalised into plain tables.

Overture splits roads into `segment`s whose topology lives in a list of `connectors` with
linear-referenced positions (`at` in 0..1). We cut every segment at its connectors to get
routable edges u -> v, and carry bridge/tunnel flags (also linear-referenced) onto the
pieces they cover.
"""
from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import LineString
from shapely.ops import substring

DRIVABLE = {
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "residential", "unclassified", "living_street", "service", "unknown",
}
EXCLUDED_SUBCLASS = {"parking_aisle", "driveway", "drive_through", "sidewalk", "crosswalk", "cycle_crossing"}

# 0 = motorway ... 6 = service. 7 = not a road (buildings / open ground).
CLASS_CODE = {
    "motorway": 0, "trunk": 1, "primary": 2, "secondary": 3, "tertiary": 4,
    "residential": 5, "unclassified": 5, "unknown": 5, "living_street": 6, "service": 6,
}
CLASS_NAMES = ["motorway", "trunk", "primary", "secondary", "tertiary", "residential", "service", "offroad"]
DEFAULT_MPH = {0: 55, 1: 45, 2: 35, 3: 30, 4: 30, 5: 25, 6: 12}
WIDTH_M = {0: 22, 1: 18, 2: 15, 3: 12, 4: 10, 5: 8, 6: 5}


def _ranges(rules, wanted: set[str], key="values"):
    """Linear-referenced ranges [(a, b)] where any flag in `wanted` applies."""
    out = []
    if rules is None:
        return out
    for rule in rules:
        vals = rule.get(key)
        if vals is None:
            continue
        vals = [vals] if isinstance(vals, (str, int, float)) else list(vals)
        if not any(v in wanted for v in vals):
            continue
        btw = rule.get("between")
        out.append((0.0, 1.0) if btw is None else (float(btw[0]), float(btw[1])))
    return out


def _level_ranges(rules):
    out = []
    if rules is None:
        return out
    for rule in rules:
        if rule.get("value", 0) and rule["value"] > 0:
            btw = rule.get("between")
            out.append((0.0, 1.0) if btw is None else (float(btw[0]), float(btw[1])))
    return out


def _overlap(a, b, ranges):
    if b <= a:
        return 0.0
    tot = sum(max(0.0, min(b, r1) - max(a, r0)) for r0, r1 in ranges)
    return tot / (b - a)


def _speed_mph(limits, cls_code):
    if limits is not None:
        for lim in limits:
            mx = lim.get("max_speed")
            if mx and mx.get("value"):
                v = float(mx["value"])
                return v if mx.get("unit", "mph") == "mph" else v * 0.621371
    return DEFAULT_MPH[cls_code]


def build_edges(seg_path, conn_path, bbox, utm_epsg: int):
    seg = gpd.read_parquet(seg_path)
    seg = seg[(seg.subtype == "road") & seg["class"].isin(DRIVABLE)]
    seg = seg[~seg["subclass"].isin(EXCLUDED_SUBCLASS)].rename(columns={"class": "rclass"})
    conn = gpd.read_parquet(conn_path)
    conn_xy = dict(zip(conn["id"], zip(conn.geometry.x, conn.geometry.y)))

    rows = []
    for rec in seg.itertuples(index=False):
        geom: LineString = rec.geometry
        cons = sorted(
            [(float(c["at"]), c["connector_id"]) for c in (rec.connectors if rec.connectors is not None else [])],
            key=lambda t: t[0],
        )
        if len(cons) < 2:
            continue
        code = CLASS_CODE[rec.rclass]
        bridges = _ranges(rec.road_flags, {"is_bridge"}) + _level_ranges(rec.level_rules)
        tunnels = _ranges(rec.road_flags, {"is_tunnel"})
        mph = _speed_mph(rec.speed_limits, code)
        name = (rec.names or {}).get("primary") if rec.names is not None else None
        for (a, ca), (b, cb) in zip(cons[:-1], cons[1:]):
            if ca == cb or b - a < 1e-9 or ca not in conn_xy or cb not in conn_xy:
                continue
            if _overlap(a, b, tunnels) > 0.5:
                continue  # sealed tunnels are pumped/gated; leave them out of the surface network
            piece = substring(geom, a, b, normalized=True)
            coords = list(piece.coords) if piece.geom_type == "LineString" else [piece.coords[0]] * 2
            coords[0], coords[-1] = conn_xy[ca], conn_xy[cb]
            rows.append(
                dict(
                    u=ca, v=cb, cls=code, mph=mph, name=name,
                    is_bridge=int(_overlap(a, b, bridges) > 0.5),
                    geometry=LineString(coords),
                )
            )
    edges = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    west, south, east, north = bbox
    mid = gpd.GeoSeries(shapely.line_interpolate_point(edges.geometry.to_numpy(), 0.5, normalized=True))
    inside = ((mid.x > west) & (mid.x < east) & (mid.y > south) & (mid.y < north)).to_numpy()
    edges = edges[inside].copy()
    edges["length_m"] = edges.to_crs(utm_epsg).length.to_numpy()
    edges = edges[edges.length_m > 0.5]
    edges["time_s"] = edges.length_m / (edges.mph * 0.44704)

    # node table + keep the largest connected component
    ids = pd.Index(pd.unique(pd.concat([edges.u, edges.v])))
    edges["ui"] = ids.get_indexer(edges.u)
    edges["vi"] = ids.get_indexer(edges.v)
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components

    n = len(ids)
    A = coo_matrix((np.ones(len(edges)), (edges.ui, edges.vi)), shape=(n, n))
    _, lab = connected_components(A, directed=False)
    main = np.bincount(lab).argmax()
    keep_nodes = np.flatnonzero(lab == main)
    edges = edges[np.isin(edges.ui, keep_nodes)].copy()
    ids = pd.Index(pd.unique(pd.concat([edges.u, edges.v])))
    edges["ui"] = ids.get_indexer(edges.u)
    edges["vi"] = ids.get_indexer(edges.v)
    node_xy = np.array([conn_xy[i] for i in ids])
    edges = edges.reset_index(drop=True)
    return edges, node_xy


def build_buildings(path, bbox, utm_epsg: int) -> gpd.GeoDataFrame:
    b = gpd.read_parquet(path)
    b = b[b.geometry.notna()].copy()
    b["geometry"] = b.geometry.apply(
        lambda g: max(g.geoms, key=lambda p: p.area) if g.geom_type == "MultiPolygon" else g
    )
    b = b[b.geometry.geom_type == "Polygon"]
    rp = b.geometry.representative_point()
    west, south, east, north = bbox
    b = b[(rp.x > west) & (rp.x < east) & (rp.y > south) & (rp.y < north)].copy()
    b["area_m2"] = b.to_crs(utm_epsg).area.to_numpy()
    b = b[b.area_m2 > 15]
    default_h = np.where(b.subtype.isin(["commercial", "civic", "education", "medical"]), 10.0, 6.5)
    h = b.height.to_numpy(dtype=float)
    floors = b.num_floors.to_numpy(dtype=float) * 3.4
    h = np.where(np.isfinite(h), h, np.where(np.isfinite(floors), floors, default_h))
    b["h"] = np.clip(h, 2.5, 400)
    b["name"] = b.names.apply(lambda n: (n or {}).get("primary") if n is not None else None)
    b["kind"] = b.subtype.fillna(b["class"]).fillna("building")
    b["geometry"] = shapely.simplify(b.geometry.to_numpy(), 2e-6, preserve_topology=True)
    return b[["h", "name", "kind", "area_m2", "geometry"]].reset_index(drop=True)
