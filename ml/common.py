"""Shared definitions for the EarthLab outage-severity model.

Everything that must be identical between training and inference lives here:
warning-code vocabulary, leakage exclusions, feature construction, county statistics.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:  # allow `python -I ml/train.py`
    sys.path.insert(0, str(ROOT))

TARGET = "max_rolling_avg"
TARGET_UNIT = "customers without power (max 4-h trailing average within the clock hour)"
SCOPE = "selected_positive_outage_warning_hours"

# NWS VTEC phenomenon codes present in the archive (Saki et al. 2026, Methods)
WARNING_CODES = [
    "SV", "TO", "HU", "TR", "HW", "WI", "IS", "ZR", "WS", "BZ", "WW", "WC", "HZ", "FZ", "EH", "HT", "FW", "EW",
]
WARNING_NAMES = {
    "SV": "Severe Thunderstorm", "TO": "Tornado", "HU": "Hurricane", "TR": "Tropical Storm", "HW": "High Wind",
    "WI": "Wind Advisory", "IS": "Ice Storm", "ZR": "Freezing Rain", "WS": "Winter Storm", "BZ": "Blizzard",
    "WW": "Winter Weather", "WC": "Wind Chill", "HZ": "Hard Freeze", "FZ": "Freeze", "EH": "Excessive Heat",
    "HT": "Heat Advisory", "FW": "Fire Weather / Red Flag", "EW": "Extreme Wind",
}

# Columns that describe the outcome or are computed from the whole record -> never features.
LEAKAGE_COLUMNS = {
    "max_rolling_avg": "target",
    "Max_outage": "event peak outage (outcome over the whole event)",
    "evDur_Hr": "event duration (known only after restoration)",
    "evDur_day": "event duration (known only after restoration)",
    "event_mean_completeness_pct": "event-level aggregate over future hours",
    "event_min_completeness_pct": "event-level aggregate over future hours",
    "new_event_no": "outcome-derived event segmentation id",
    "median_sum": "county 75th-percentile outage over the full 2015-2024 record (includes test-period outcomes); "
                  "replaced by training-period-only county statistics",
}

WARNING_FEATURES = [f"w_{c}" for c in WARNING_CODES]
COUNTY_STATIC = ["log_aland_km2", "awater_share", "lon", "lat"]
COUNTY_STATS = ["county_med_log", "county_p90_log", "county_log_events"]
FEATURES = (
    WARNING_FEATURES
    + ["n_warnings", "wfo", "month", "solar_hour", "source_completeness_pct"]
    + COUNTY_STATIC
    + COUNTY_STATS
)
CATEGORICAL = ["wfo"]
FEATURE_LABELS = {
    **{f"w_{c}": f"Warning: {WARNING_NAMES[c]}" for c in WARNING_CODES},
    "n_warnings": "Number of simultaneous warning types",
    "wfo": "NWS forecast office",
    "month": "Month",
    "solar_hour": "Local solar hour",
    "source_completeness_pct": "Source-record availability",
    "log_aland_km2": "County land area",
    "awater_share": "County water share",
    "lon": "County longitude",
    "lat": "County latitude",
    "county_med_log": "County typical outage (training period)",
    "county_p90_log": "County 90th-pct outage (training period)",
    "county_log_events": "County outage-event count (training period)",
}


def load_config(path: str | Path = ROOT / "ml" / "config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def p(rel: str) -> Path:
    return ROOT / rel


def parse_warnings(s: pd.Series) -> pd.DataFrame:
    """'SV; TO' -> one-hot columns w_SV, w_TO, ... (unknown codes ignored)."""
    norm = s.fillna("").astype(str).str.replace(" ", "", regex=False)
    dummies = norm.str.get_dummies(sep=";")
    out = dummies.reindex(columns=WARNING_CODES, fill_value=0).astype(np.int8)
    out.columns = [f"w_{c}" for c in WARNING_CODES]
    return out


def episodes(events: pd.DataFrame, gap_hours: float = 12.0) -> pd.Series:
    """Group county-level outage events into regional storm episodes.

    `events` has one row per county-event with `start` and `end` (UTC). Events whose start falls
    within `gap_hours` of the running episode end join that episode. Returns an episode id per row.
    """
    ev = events.sort_values("start")
    ids, cur_end, cur_id = [], None, None
    gap = pd.Timedelta(hours=gap_hours)
    for start, end in zip(ev["start"], ev["end"]):
        if cur_end is None or start > cur_end + gap:
            cur_id = start.strftime("ep-%Y%m%d-%H")
            cur_end = end
        else:
            cur_end = max(cur_end, end)
        ids.append(cur_id)
    return pd.Series(ids, index=ev.index).reindex(events.index)


def warning_key(codes) -> str:
    """Canonical sorted combination key, e.g. ['TO','SV'] -> 'SV;TO'."""
    if isinstance(codes, str):
        codes = codes.replace(" ", "").split(";")
    return ";".join(sorted({c for c in codes if c}))


def solar_hour(hour_utc: pd.Series, lon: pd.Series) -> pd.Series:
    h = hour_utc.dt.hour + hour_utc.dt.minute / 60.0
    return ((h + lon / 15.0) % 24.0).astype("float32")


def county_stats(train: pd.DataFrame) -> pd.DataFrame:
    """Training-period-only county outage statistics (log1p customers)."""
    y = np.log1p(train[TARGET])
    g = pd.DataFrame({"fips_code": train.fips_code, "y": y, "ev": train.fips_code + "#" + train.new_event_no.astype(str)})
    stats = g.groupby("fips_code").agg(
        county_med_log=("y", "median"),
        county_p90_log=("y", lambda v: float(np.quantile(v, 0.9))),
        county_log_events=("ev", lambda v: float(np.log1p(v.nunique()))),
    )
    return stats.astype("float32")


def build_features(df: pd.DataFrame, stats: pd.DataFrame, wfo_categories: list[str]) -> pd.DataFrame:
    """Model matrix in FEATURES order. `df` needs: warning one-hots, n_warnings, WFO, month,
    solar_hour, source_completeness_pct, county static columns and fips_code."""
    X = pd.DataFrame(index=df.index)
    for c in WARNING_FEATURES:
        X[c] = df[c].astype(np.int8)
    X["n_warnings"] = df["n_warnings"].astype(np.int8)
    wfo = df["WFO"].astype(object)
    X["wfo"] = pd.Categorical(wfo.where(wfo.isin(wfo_categories)), categories=wfo_categories)  # unseen -> NaN
    X["month"] = df["month"].astype(np.int8)
    X["solar_hour"] = df["solar_hour"].astype("float32")
    X["source_completeness_pct"] = df["source_completeness_pct"].astype("float32")
    for c in COUNTY_STATIC:
        X[c] = df[c].astype("float32")
    s = stats.reindex(df["fips_code"].to_numpy())
    for c in COUNTY_STATS:
        X[c] = s[c].to_numpy(dtype="float32")
    return X[FEATURES]


def metrics(y_true, y_pred, lo=None, hi=None) -> dict:
    """Errors on the original scale (customers) plus log-scale MAE."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    ae = np.abs(y_pred - y_true)
    out = {
        "n": int(len(y_true)),
        "mae": float(ae.mean()) if len(ae) else None,
        "median_ae": float(np.median(ae)) if len(ae) else None,
        "p90_ae": float(np.quantile(ae, 0.9)) if len(ae) else None,
        "mae_log1p": float(np.abs(np.log1p(y_pred) - np.log1p(y_true)).mean()) if len(ae) else None,
        "within_factor_2": float(np.mean(np.abs(np.log((y_pred + 1) / (y_true + 1))) <= np.log(2))) if len(ae) else None,
        "median_signed_error": float(np.median(y_pred - y_true)) if len(ae) else None,
    }
    if lo is not None and hi is not None and len(ae):
        out["interval_coverage"] = float(np.mean((y_true >= np.asarray(lo)) & (y_true <= np.asarray(hi))))
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in out.items()}
