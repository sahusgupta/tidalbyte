"""Public region metadata that can be served before loading the numerical engine."""
from __future__ import annotations

import json

from .config import Region


HOUSTON_PRESETS = {
    "clear": dict(label="Clear Skies", rain=0, duration=1, surge=0.0, clog=0.1,
                  blurb="Dry day; normal bayou water levels."),
    "shower": dict(label="Afternoon Downpour", rain=25, duration=1.2, surge=0.0, clog=0.15,
                   blurb="1 in/hr typical Gulf downpour. Streets pond briefly, drains keep up."),
    "memorial": dict(label="Memorial Day (2015)", rain=65, duration=3, surge=0.0, clog=0.35,
                     blurb="~8 in cloudburst over Brays Bayou; rapid flash ponding on feeder roads."),
    "taxday": dict(label="Tax Day (2016)", rain=75, duration=4, surge=0.0, clog=0.45,
                   blurb="12-16 in storm; Buffalo and Brays bayous overtop banks."),
    "100yr": dict(label="100-Yr NOAA Atlas", rain=85, duration=3, surge=0.1, clog=0.5,
                  blurb="NOAA Atlas 14 100-year recurrence: severe road network severance."),
    "harvey": dict(label="Harvey Deluge (2017)", rain=125, duration=8, surge=0.3, clog=0.75,
                   blurb="Catastrophic 500-year stall: 40+ in total; medical & highway corridors submerged."),
}

VEHICLES = {
    "sedan": dict(label="Passenger car", clearance_m=0.15),
    "ambulance": dict(label="Ambulance", clearance_m=0.30),
    "truck": dict(label="High-water rescue truck", clearance_m=0.75),
}

MODEL_FIELDS = (
    "model", "target", "teacher", "r2", "mae_cm", "rmse_cm", "n_trees", "n_train_rows",
    "n_train_storms", "n_val_storms", "classification", "importance", "presets",
)


def public_meta(region: Region) -> dict:
    out = region.out_dir
    meta = json.loads((out / "static" / "meta.json").read_bytes())
    metrics = json.loads((out / "model" / "metrics.json").read_bytes())
    return {
        **meta,
        "presets": HOUSTON_PRESETS,
        "vehicles": VEHICLES,
        "model": {key: metrics[key] for key in MODEL_FIELDS},
    }
