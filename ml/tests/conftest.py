"""Shared fixtures. Imports stay lazy so the stdlib-only guard tests still run in the app's CI
environment (requirements.lock has no pandas / scikit-learn); model tests skip there."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def cfg():
    pytest.importorskip("pandas")
    from ml.common import load_config

    return load_config()


@pytest.fixture(scope="session")
def rows(cfg):
    import pandas as pd

    from ml.common import p

    path = p(cfg["data"]["processed_rows"])
    if not path.exists():
        pytest.skip("processed data missing: run `python -I ml/prepare.py` first")
    return pd.read_parquet(path, columns=["event_key", "event_start", "split", "is_houston", "Hour"])


@pytest.fixture(scope="session")
def model(cfg):
    pytest.importorskip("sklearn")
    from ml.common import p

    if not p(cfg["artifacts"]["model"]).exists():
        pytest.skip("model artifact missing: run `python -I ml/train.py` or copy the trained artifact")
    from ml.inference import OutageSeverityModel

    return OutageSeverityModel.load()
