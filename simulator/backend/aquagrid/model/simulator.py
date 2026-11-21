"""Physics-based "teacher" flood simulator.

There is no labelled ground truth for "depth on every street under every storm", so we do
what operational flood-forecasting surrogates do: run a process-based hydrologic model over
thousands of synthetic storms, then train a fast ML surrogate (XGBoost) on the results.
In a production version the teacher would be replaced or calibrated with observed flood
reports (311 calls, FEMA NFIP claims, Waze/DOT road closures, high-water sensors).

Processes modelled per location (vectorised over a feature table):

1. Coastal storm surge - "connected bathtub": a point floods only if the sea level exceeds
   the lowest overland spill path from the sea (`sea_thresh`), with the water surface
   sloping down inland (urban friction).
2. Storm-drain backflow - gravity outfalls sit ~0.55 m; when the bay rises above them,
   seawater pushes up through the pipes into the lowest nearby streets ("sunny-day" flooding)
   and the drains lose capacity (tailwater).
3. Pluvial (rainfall) flooding - rain exceeding drain capacity (reduced by clogging and
   tailwater) and infiltration (falls as the ground saturates) becomes runoff. Runoff
   concentrates by TWI and local low spots (TPI, HAND), and ponds up to depression storage
   plus a slope-dependent sheet-flow depth.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

DRAIN_DESIGN_MMHR = 38.0  # roughly a 5-yr design storm for urban gravity drainage
OUTFALL_M = 0.55  # typical outfall invert relative to datum
SURGE_GRADIENT_M_PER_KM = 0.12
SEAWALL_M = 0.80  # shoreline features narrower than a DEM cell (seawalls, bulkheads)
MAX_DEPTH_M = 5.0
DRAIN_QUALITY = np.array([1.30, 1.25, 1.15, 1.10, 1.00, 0.90, 0.75, 0.60])  # by road_class 0..7


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def simulate(f: pd.DataFrame, rain, duration, surge, clog, base_wl=0.30) -> np.ndarray:
    """Water depth (m) at each row of `f`. Scenario args can be scalars or per-row arrays."""
    elev = f.elev.to_numpy()
    rc = f.road_class.to_numpy().astype(int)
    bridge = f.is_bridge.to_numpy() > 0
    R = np.asarray(rain, dtype=float)
    D = np.asarray(duration, dtype=float)
    S = np.asarray(surge, dtype=float)
    C = np.asarray(clog, dtype=float)
    WL = base_wl + S

    # 1. coastal surge (connected bathtub with inland water-surface gradient)
    wl_local = WL - SURGE_GRADIENT_M_PER_KM * f.dist_sea.to_numpy() / 1000.0
    connected = WL > np.maximum(f.sea_thresh.to_numpy(), SEAWALL_M)
    surge_depth = np.where(connected, np.clip(wl_local - elev, 0, None), 0.0)

    # 2. drain backflow at high water
    reach = np.exp(-f.dist_sea.to_numpy() / 1200.0)
    backflow = np.where((WL > OUTFALL_M) & ~bridge, np.clip(WL - 0.15 - elev, 0, None) * 0.6 * reach, 0.0)
    tailwater = np.clip((WL - OUTFALL_M) / 1.2, 0, 1)

    # 3. rainfall excess
    cap = DRAIN_DESIGN_MMHR * DRAIN_QUALITY[rc] * (1 - 0.92 * C) * (1 - 0.85 * tailwater)
    imperv = f.imperv.to_numpy()
    infil = (28.0 * (1 - imperv) * np.exp(-D / 5.0) + 3.0) * (1 - 0.6 * tailwater)
    excess = np.clip(R - cap - infil, 0, None)  # mm/h
    runoff = excess * D / 1000.0  # m
    # part of the runoff escapes overland to the bay / canals before it can pond
    escape = 0.5 * np.exp(-f.dist_water.to_numpy() / 250.0) + 0.3 * np.clip(f.slope_pct.to_numpy() / 3.0, 0, 1)
    runoff *= 1 - escape

    conc = np.clip(np.exp(0.4 * (f.twi.to_numpy() - 8.5)), 0.3, 8.0)
    conc *= 0.5 + 1.0 * _sigmoid(-f.tpi.to_numpy() / 0.3)
    conc *= 0.6 + 0.4 * np.exp(-np.clip(f.hand.to_numpy(), 0, None) / 2.5)
    pond = runoff * conc
    sheet = 0.06 + 0.5 * np.exp(-f.slope_pct.to_numpy() / 1.5)
    cap_store = f.sink_depth.to_numpy() + sheet
    rain_depth = cap_store * (1 - np.exp(-pond / cap_store)) + 0.08 * np.clip(pond - cap_store, 0, None)
    rain_depth = np.where(bridge, 0.1 * rain_depth, rain_depth)

    return np.clip(np.maximum(surge_depth, backflow) + rain_depth, 0, MAX_DEPTH_M)


def add_label_noise(depth, rng, sigma=0.12):
    """Observation-style noise so the surrogate learns a smooth expectation, not a lookup table."""
    noisy = depth * rng.lognormal(0, sigma, size=depth.shape) + rng.normal(0, 0.008, size=depth.shape)
    return np.clip(noisy, 0, None)


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


# Training and evaluation use the same Houston scenarios exposed by the API.
PRESETS = HOUSTON_PRESETS

def sample_scenarios(n: int, rng) -> pd.DataFrame:
    u = rng.random((n, 4))
    sc = pd.DataFrame(
        dict(
            rain=200 * u[:, 0] ** 1.3,
            duration=0.25 + 23.75 * u[:, 1] ** 2.2,
            surge=np.where(rng.random(n) < 0.3, 0.0, 3.0 * u[:, 2] ** 1.2),
            clog=u[:, 3],
        )
    )
    # densify around the named presets
    pre = pd.DataFrame([{k: v[k] for k in ("rain", "duration", "surge", "clog")} for v in PRESETS.values()])
    reps = pre.sample(n // 4, replace=True, random_state=int(rng.integers(1 << 31))).reset_index(drop=True)
    jit = rng.normal(1, 0.15, size=(len(reps), 4))
    reps = (reps * jit).clip(lower=0)
    reps["clog"] = reps.clog.clip(0, 1)
    reps["surge"] = reps.surge.clip(0, 3)
    reps["rain"] = reps.rain.clip(0, 200)
    reps["duration"] = reps.duration.clip(0.25, 24)
    return pd.concat([sc, reps], ignore_index=True)
