"""Prepare reusable HTTP representations beside the regional street and building data."""
from __future__ import annotations

import gzip
import os
from pathlib import Path
from tempfile import NamedTemporaryFile


def compressed_geometry(path: Path) -> Path | None:
    sidecar = path.with_suffix(".json.gz")
    if sidecar.is_file() and sidecar.stat().st_mtime_ns == path.stat().st_mtime_ns:
        return sidecar
    return None


def prepare_geometry(path: Path) -> None:
    if compressed_geometry(path):
        return
    source_time = path.stat().st_mtime_ns
    payload = gzip.compress(path.read_bytes(), compresslevel=4, mtime=0)
    output = NamedTemporaryFile(dir=path.parent, delete=False)
    temp = Path(output.name)
    try:
        with output:
            output.write(payload)
        os.utime(temp, ns=(source_time, source_time))
        temp.replace(path.with_suffix(".json.gz"))
    finally:
        temp.unlink(missing_ok=True)
