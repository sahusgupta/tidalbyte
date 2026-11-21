import pytest

for _mod in ("numpy", "pandas", "sklearn", "pyarrow"):
    pytest.importorskip(_mod)  # ML environment only (not in the app's requirements.lock)

import numpy as np
import pandas as pd

from ml.common import (
    COUNTY_STATS, FEATURES, LEAKAGE_COLUMNS, build_features, episodes, metrics, parse_warnings, solar_hour,
    warning_key,
)
from ml.prepare import assign_splits


def test_no_outcome_or_future_columns_are_features():
    assert not set(LEAKAGE_COLUMNS) & set(FEATURES)
    for banned in ["median_sum", "Max_outage", "evDur_Hr", "year", "new_event_no", "event_mean_completeness_pct"]:
        assert banned not in FEATURES


def test_parse_warnings_one_hot_and_ignores_unknown():
    oh = parse_warnings(pd.Series(["SV; TO", "WS", "ZZ", None]))
    assert oh.loc[0, "w_SV"] == 1 and oh.loc[0, "w_TO"] == 1 and oh.loc[0].sum() == 2
    assert oh.loc[1, "w_WS"] == 1 and oh.loc[1].sum() == 1
    assert oh.loc[2].sum() == 0 and oh.loc[3].sum() == 0


def test_warning_key_is_canonical():
    assert warning_key("TO; SV") == warning_key(["SV", "TO"]) == "SV;TO"


def test_solar_hour_uses_longitude():
    t = pd.Series(pd.to_datetime(["2021-02-15T12:00:00Z"]))
    assert solar_hour(t, pd.Series([-90.0])).iloc[0] == 6.0


def test_build_features_order_and_unknown_category():
    df = pd.DataFrame({
        **{f"w_{c}": [0] for c in ["SV", "TO", "HU", "TR", "HW", "WI", "IS", "ZR", "WS", "BZ", "WW", "WC", "HZ",
                                   "FZ", "EH", "HT", "FW", "EW"]},
        "n_warnings": [1], "WFO": ["XXX"], "month": [2], "solar_hour": [6.0], "source_completeness_pct": [100.0],
        "log_aland_km2": [8.0], "awater_share": [0.1], "lon": [-95.4], "lat": [29.8], "fips_code": ["48201"],
    })
    stats = pd.DataFrame({c: [1.0] for c in COUNTY_STATS}, index=["48201"])
    X = build_features(df, stats, ["HGX", "LCH"])
    assert list(X.columns) == FEATURES
    assert pd.isna(X.loc[0, "wfo"])  # unseen office -> missing, not an error
    X2 = build_features(df.assign(fips_code="99999"), stats, ["HGX"])
    assert np.isnan(X2.loc[0, "county_med_log"])  # unseen county -> missing stats


def test_episodes_merge_within_gap():
    ts = lambda s: pd.Timestamp(s, tz="UTC")  # noqa: E731
    ev = pd.DataFrame({"start": [ts("2021-02-14 00:00"), ts("2021-02-14 20:00"), ts("2021-03-01 00:00")],
                       "end": [ts("2021-02-14 10:00"), ts("2021-02-15 00:00"), ts("2021-03-01 02:00")]})
    ids = episodes(ev)
    assert ids.iloc[0] == ids.iloc[1] != ids.iloc[2]


def test_assign_splits_embargo():
    cfg = {"split": {"train_end": "2020-01-01T00:00:00Z", "val_end": "2021-01-01T00:00:00Z", "embargo_hours": 48}}
    starts = pd.to_datetime(["2019-06-01T00:00:00Z", "2019-12-31T12:00:00Z", "2020-06-01T00:00:00Z",
                             "2020-12-30T01:00:00Z", "2021-02-15T00:00:00Z"], utc=True)
    s = assign_splits(pd.DataFrame({"start": starts}), cfg)
    assert list(s) == ["train", "embargo", "val", "embargo", "test"]


def test_metrics_basic():
    m = metrics([10, 100], [10, 50], lo=[5, 60], hi=[20, 200])
    assert m["mae"] == 25 and m["interval_coverage"] == 1.0 and m["within_factor_2"] == 1.0
