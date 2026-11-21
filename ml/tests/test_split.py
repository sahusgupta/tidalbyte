import pytest

for _mod in ("numpy", "pandas", "sklearn", "pyarrow"):
    pytest.importorskip(_mod)  # ML environment only (not in the app's requirements.lock)

import pandas as pd


def test_each_event_in_exactly_one_split(rows):
    assert (rows.groupby("event_key").split.nunique() == 1).all()


def test_splits_are_time_ordered(rows, cfg):
    t1, t2 = pd.Timestamp(cfg["split"]["train_end"]), pd.Timestamp(cfg["split"]["val_end"])
    st = rows.groupby("split").event_start.agg(["min", "max"])
    assert st.loc["train", "max"] < t1 <= st.loc["val", "min"]
    assert st.loc["val", "max"] < t2 <= st.loc["test", "min"]


def test_houston_has_rows_in_every_split(rows):
    h = rows[rows.is_houston]
    assert set(h.split) >= {"train", "val", "test"}
