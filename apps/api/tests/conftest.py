import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def scenario():
    evaluation = json.loads((REPO_ROOT / "data/fixtures/offline-evaluation.json").read_text(encoding="utf-8"))
    return deepcopy(evaluation["scenario"])


@pytest.fixture
def client():
    with TestClient(create_app()) as test_client:
        yield test_client
