"""The hosted simulator uses the same FastAPI application as the local map."""
import os
import sys
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "1")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "simulator/backend"))

from aquagrid.api import app  # noqa: E402,F401
