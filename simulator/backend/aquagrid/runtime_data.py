"""Lossless numeric inputs for AquaGrid inference without the geodata build dependencies."""
from pathlib import Path

import numpy as np


def _parquet_inputs(directory):
    import pandas as pd
    import shapely

    from .model.featurize import static_matrix

    edges = pd.read_parquet(directory / "edges.parquet", columns=[
        "length_m", "name", "cls", "ui", "vi", "time_s", "geometry",
    ])
    geometries = shapely.from_wkb(edges.geometry.to_numpy())
    codes, names = pd.factorize(edges.name)
    features = [pd.read_parquet(directory / f"feat_{kind}.parquet") for kind in ("edges", "buildings", "cells")]
    cells = features[2]
    return {
        "static": np.vstack([static_matrix(table) for table in features]),
        "splits": np.cumsum([0, *(len(table) for table in features)]),
        "asset_xy": np.vstack([table[["lon", "lat"]].to_numpy() for table in features[:2]]),
        "cell_row": cells.row.to_numpy(), "cell_col": cells.col.to_numpy(),
        "edge_len": edges.length_m.to_numpy(), "edge_cls": edges.cls.to_numpy(),
        "edge_name_codes": codes.astype(np.int32), "edge_names": names.to_numpy(dtype=str),
        "ui": edges.ui.to_numpy(), "vi": edges.vi.to_numpy(), "time_s": edges.time_s.to_numpy(),
        "coordinates": shapely.get_coordinates(geometries),
        "geometry_stops": np.cumsum(shapely.get_num_coordinates(geometries)),
        "node_xy": np.load(directory / "nodes.npy", allow_pickle=False),
        "building_node": np.load(directory / "building_node.npy", allow_pickle=False),
    }


def load_inputs(directory):
    bundle = directory / "inference.npz"
    if bundle.exists():
        with np.load(bundle, allow_pickle=False) as inputs:
            return {name: inputs[name] for name in inputs.files}
    return _parquet_inputs(directory)


def export_runtime_bundle(source: Path, destination: Path):
    """Stage only the inference columns and the original terrain drainage tree."""
    from .storm import flow_parent

    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve():
        raise ValueError("Export the deployment inputs to a separate directory.")
    destination.mkdir(parents=True, exist_ok=True)
    inputs = _parquet_inputs(source)
    # Adjacent samples of a terrain feature compress well. No values are quantized.
    inputs["static"] = np.asfortranarray(inputs["static"])
    np.savez_compressed(destination / "inference.npz", **inputs)
    path = source / "rasters.npz"
    with np.load(path, allow_pickle=False) as rasters:
        np.savez_compressed(destination / "rasters.npz", flow_parent=flow_parent(path, rasters),
                            acc=rasters["acc"])
