"""Build missing regional geography and fit the standard regional flood models."""

import argparse
import subprocess
import sys

from .config import REGIONS


BUILD_OUTPUTS = (
    "grid.json", "rasters.npz", "nodes.npy", "building_node.npy", "edges.parquet",
    "buildings.parquet", "feat_edges.parquet", "feat_buildings.parquet", "feat_cells.parquet",
    "static/meta.json", "static/roads.json", "static/buildings.json",
)
MODEL_OUTPUTS = ("model/flood_xgb.ubj", "model/metrics.json")


def prepare(region_id):
    out = REGIONS[region_id].out_dir
    out.mkdir(parents=True, exist_ok=True)
    needs_model = out / ".retrain-required"
    built = all((out / file).is_file() for file in BUILD_OUTPUTS)
    if not built:
        needs_model.touch()
        subprocess.run([sys.executable, "-m", "aquagrid.pipeline.build", "--region", region_id], check=True)
    if needs_model.exists() or not all((out / file).is_file() for file in MODEL_OUTPUTS):
        needs_model.touch()
        subprocess.run([sys.executable, "-m", "aquagrid.model.train", "--region", region_id], check=True)
        needs_model.unlink()
    print(f"{region_id} ready at {out}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", choices=REGIONS, action="append", help="Repeat for a subset. Defaults to all regions.")
    args = parser.parse_args()
    for region_id in dict.fromkeys(args.region or REGIONS):
        prepare(region_id)
