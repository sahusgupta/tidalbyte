"""EarthLab's bounded, provider-independent API skeleton."""

import sys
from pathlib import Path

# The monorepo's generated Python package is shared by the API and ML workstreams.
# Keep the documented uvicorn --app-dir command usable without shell-specific env syntax.
_contracts_path = str(Path(__file__).resolve().parents[3] / "packages" / "contracts" / "python")
if _contracts_path not in sys.path:
    sys.path.insert(0, _contracts_path)
