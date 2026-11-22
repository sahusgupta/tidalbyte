"""Build a Vercel release from source and the five prepared regional data sets.

Run with the simulator Python environment and an empty destination outside the repo.
Only tracked runtime sources, production static output and listed derived inputs ship.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "simulator/backend"))
from aquagrid.config import DEFAULT_REGION, HOUSTON_ZONES  # noqa: E402
from aquagrid.catalog import public_meta  # noqa: E402
from aquagrid.runtime_data import export_runtime_bundle  # noqa: E402


def stage(out):
    if out.is_relative_to(ROOT) or (out.exists() and any(out.iterdir())):
        raise ValueError("Choose a new or empty release directory outside the repository.")
    out.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / "deploy/vercel", out, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("__pycache__"))
    for directory in ("apps/api/app", "packages/contracts/python", "data/fixtures",
                      "contracts", "simulator/backend/aquagrid"):
        files = subprocess.check_output(["git", "ls-files", "-z", directory], cwd=ROOT)
        for name in files.decode().split("\0"):
            if name:
                (out / name).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / name, out / name)

    catalog = []
    for region in HOUSTON_ZONES:
        model = out / "simulator/data/processed" / region.id
        for name in ("grid.json", "static/meta.json", "model/metrics.json", "model/flood_xgb.ubj"):
            (model / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(region.out_dir / name, model / name)
        export_runtime_bundle(region.out_dir, model)
        geometry = out / "public/geometry" / region.id
        geometry.mkdir(parents=True)
        for name in ("roads.json", "buildings.json"):
            shutil.copy2(region.out_dir / "static" / name, geometry / name)
        catalog.append(dict(id=region.id, name=region.name, bbox=region.bbox, default=region.id == DEFAULT_REGION, built=True))
        (geometry / "meta.json").write_text(json.dumps(public_meta(region)))
    (out / "public/geometry/regions.json").write_text(json.dumps(catalog))

    env = {**os.environ, "VITE_SIMULATOR_URL": "/simulator/", "VITE_API_BASE_URL": "/"}
    for source, destination, base in (("apps/web", "public", "/"),
                                      ("simulator/frontend", "public/simulator", "/simulator/")):
        subprocess.run(["node", "node_modules/vite/bin/vite.js", "build", "--base", base,
                        "--outDir", str(out / destination)], env=env, cwd=ROOT / source, check=True)
    # MapLibre's worker URL is shared between dev and the bundled map.
    shutil.copytree(out / "public/simulator/maplibre", out / "public/maplibre")
    print(f"Release directory: {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    stage(parser.parse_args().directory.resolve())
