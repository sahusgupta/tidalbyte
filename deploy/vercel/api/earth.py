"""EarthLab allocation and scenario services for the hosted atlas."""
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(root / "apps/api"), str(root / "packages/contracts/python")]

from app.main import app  # noqa: E402,F401
