"""Fail closed until the ML workstream supplies a verified training pipeline.

The bootstrap config is JSON-compatible YAML so this guard needs no ML or YAML
dependencies. It deliberately never writes an artifact or claims model metrics.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args(argv)

    try:
        config = json.loads(args.config.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"Training unavailable: cannot read JSON-compatible YAML config: {exc}", file=sys.stderr)
        return 2

    if not isinstance(config, dict):
        print("Training unavailable: configuration must be an object.", file=sys.stderr)
        return 2

    if not config.get("dataset_path") or not config.get("provenance_path"):
        print(
            "Training unavailable: no verified training dataset and provenance are configured. "
            "Follow docs/03-ML-DATA.md to inspect source columns, target units, selection bias, "
            "and event/time holdouts. Then implement the ML pipeline. "
            "The app remains OFFLINE EXAMPLE; no model artifact or metrics were written.",
            file=sys.stderr,
        )
        return 2

    print(
        "Training unavailable: the bootstrap has no training implementation. "
        "The ML owner must verify data/provenance and implement event/time-held-out "
        "baseline and model evaluation before exporting an artifact. "
        "No model artifact or metrics were written.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
