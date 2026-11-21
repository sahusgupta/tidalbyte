"""Prepare the harmonized outage-warning archive for modelling.

    python -I ml/prepare.py --config ml/config.yaml

Reads the Zenodo primary CSV + Census county shapefile from data/raw/ (never committed),
writes data/processed/outage_rows.parquet, county_static.parquet and the Houston storm-episode
catalog used for scenario presets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # repo root, works under `python -I`
from ml.common import (  # noqa: E402
    TARGET, WARNING_CODES, WARNING_NAMES, episodes, load_config, p, parse_warnings, solar_hour, warning_key,
)


def log(msg):
    print(f"[prepare {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def county_static(shp: Path) -> pd.DataFrame:
    import geopandas as gpd

    g = gpd.read_file(shp)
    cent = g.to_crs(5070).geometry.centroid.to_crs(4326)
    out = pd.DataFrame({
        "fips_code": g.GEOID.astype(str).str.zfill(5),
        "county_name": g.NAME.astype(str),
        "log_aland_km2": np.log1p(g.ALAND.astype(float) / 1e6),
        "awater_share": g.AWATER.astype(float) / (g.ALAND.astype(float) + g.AWATER.astype(float)),
        "lon": cent.x.to_numpy(),
        "lat": cent.y.to_numpy(),
    })
    return out.drop_duplicates("fips_code").set_index("fips_code")


def assign_splits(ev: pd.DataFrame, cfg: dict) -> pd.Series:
    t1 = pd.Timestamp(cfg["split"]["train_end"])
    t2 = pd.Timestamp(cfg["split"]["val_end"])
    emb = pd.Timedelta(hours=cfg["split"]["embargo_hours"])
    s = np.where(ev.start < t1, "train", np.where(ev.start < t2, "val", "test"))
    s = pd.Series(s, index=ev.index, dtype=object)
    near = ((ev.start >= t1 - emb) & (ev.start < t1)) | ((ev.start >= t2 - emb) & (ev.start < t2))
    s[near] = "embargo"
    return s


def build_catalog(rows: pd.DataFrame, houston: list[str], names: pd.Series, top: int = 15) -> list[dict]:
    h = rows[rows.fips_code.isin(houston)]
    ev = h.groupby(["fips_code", "new_event_no"]).agg(
        start=("event_start", "first"), end=("event_end", "first"), split=("split", "first"),
        peak=(TARGET, "max"), cust_hours=(TARGET, "sum"), hours=(TARGET, "size"),
        codes=("warning_key", lambda s: warning_key(";".join(s))),
    ).reset_index()
    ev["episode"] = episodes(ev)
    out = []
    for ep_id, g in ev.groupby("episode"):
        codes = sorted(set(";".join(g.codes).split(";")) - {""})
        start, end = g.start.min(), g.end.max()
        known = None  # only name storms whose dates AND warning types match unambiguously
        if pd.Timestamp("2021-02-10", tz="UTC") <= start <= pd.Timestamp("2021-02-22", tz="UTC") and \
                {"WS", "HZ", "WC"} & set(codes):
            known = "Winter Storm Uri (Feb 2021)"
        elif pd.Timestamp("2017-08-24", tz="UTC") <= start <= pd.Timestamp("2017-09-02", tz="UTC") and \
                {"HU", "TR"} & set(codes):
            known = "Hurricane Harvey (Aug 2017)"
        counties = (
            g.groupby("fips_code").agg(peak=("peak", "max"), cust_hours=("cust_hours", "sum"))
            .sort_values("peak", ascending=False)
        )
        out.append(dict(
            id=ep_id,
            known_as=known,
            label=known or f"{start:%Y-%m-%d}: " + " + ".join(WARNING_NAMES.get(c, c) for c in codes),
            start_utc=start.isoformat(), end_utc=end.isoformat(),
            split=sorted(set(g.split)),
            warning_types=codes,
            customer_hours=round(float(g.cust_hours.sum()), 1),
            counties=[
                dict(countyFips=f, county=str(names.get(f, f)), observed_peak=round(float(r.peak), 1),
                     customer_hours=round(float(r.cust_hours), 1))
                for f, r in counties.iterrows()
            ],
        ))
    out.sort(key=lambda d: -d["customer_hours"])
    return out[:top]


def main(cfg_path: str):
    cfg = load_config(cfg_path)
    d = cfg["data"]
    raw = p(d["raw_csv"])
    if not raw.exists():
        print(f"Preparation unavailable: {d['raw_csv']} not found. Download it from https://doi.org/{d['source']['doi']} "
              "(see data/provenance/zenodo-22651795.md). Nothing was written.", file=sys.stderr)
        raise SystemExit(2)
    log(f"verifying {raw.name} md5 ...")
    got = md5(raw)
    if got != d["source"]["md5"]:
        raise SystemExit(f"md5 mismatch for {raw}: {got} != {d['source']['md5']}")

    log("reading CSV ...")
    df = pd.read_csv(raw, dtype={"fips_code": str, "WFO": str, "Matched_Events": str})
    n_raw = len(df)
    df["fips_code"] = df.fips_code.str.zfill(5)
    df["Hour"] = pd.to_datetime(df.Hour, utc=True)
    df = df[df[TARGET].notna() & (df[TARGET] > 0)]

    log("county static features from Census shapefile ...")
    cs = county_static(p(d["county_shapefile"]))
    df = df.join(cs[["log_aland_km2", "awater_share", "lon", "lat"]], on="fips_code")
    n_nocounty = int(df.lon.isna().sum())

    log("warning one-hots, time features ...")
    oh = parse_warnings(df.Matched_Events)
    df = pd.concat([df, oh], axis=1)
    df["warning_key"] = df.Matched_Events.fillna("").map(warning_key)
    df["n_warnings"] = df.Matched_Count.astype(np.int8)
    df["month"] = df.Hour.dt.month.astype(np.int8)
    df["solar_hour"] = solar_hour(df.Hour, df.lon.fillna(-95.0))
    df["year"] = df.Hour.dt.year.astype(np.int16)

    log("event boundaries + time splits ...")
    key = df.fips_code + "#" + df.new_event_no.astype(str)
    ev = df.groupby(key).Hour.agg(start="min", end="max")
    ev["split"] = assign_splits(ev, cfg)
    df["event_key"] = key
    df["event_start"] = ev.start.reindex(key).to_numpy()
    df["event_end"] = ev.end.reindex(key).to_numpy()
    df["split"] = ev.split.reindex(key).to_numpy()

    houston = cfg["regions"]["houston"]
    gulf = houston + cfg["regions"]["gulf_coast_extra"]
    df["is_houston"] = df.fips_code.isin(houston)
    df["is_gulf_coast"] = df.fips_code.isin(gulf)
    df["is_texas"] = df.state.eq("Texas")

    keep = [
        "fips_code", "state", "county", "Hour", TARGET, "new_event_no", "event_key", "event_start", "event_end",
        "split", "WFO", "Matched_Events", "warning_key", "n_warnings", "month", "solar_hour", "year",
        "source_completeness_pct", "log_aland_km2", "awater_share", "lon", "lat",
        "is_houston", "is_gulf_coast", "is_texas",
    ] + [f"w_{c}" for c in WARNING_CODES]
    out = df[keep].reset_index(drop=True)
    out_path = p(d["processed_rows"])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(out_path, index=False)
    cs.to_parquet(p(d["processed_counties"]))

    log("Houston storm-episode catalog ...")
    catalog = build_catalog(out, houston, cs.county_name)
    Path(p(d["events_catalog"])).write_text(json.dumps(dict(
        regionId="houston-gulf-coast", source=d["source"]["id"], note=(
            "Observed values are max_rolling_avg (customers without power, 4-h trailing average) from the "
            "positive-outage + matched-warning archive. Episodes group county outage events within 12 h."),
        episodes=catalog), indent=1))

    summary = dict(
        raw_rows=n_raw, kept_rows=len(out), rows_without_county_geometry=n_nocounty,
        time_span=[str(out.Hour.min()), str(out.Hour.max())],
        split_rows=out.split.value_counts().to_dict(),
        houston_split_rows=out[out.is_houston].split.value_counts().to_dict(),
        houston_events=int(out[out.is_houston].event_key.nunique()),
    )
    log(json.dumps(summary))
    for e in catalog[:8]:
        log(f"  {e['id']:18s} {e['split']} {e['label'][:60]:60s} cust-h {e['customer_hours']:>12,.0f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(p("ml/config.yaml")))
    main(ap.parse_args().config)
