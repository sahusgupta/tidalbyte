"""Inference service for the outage-severity model (backs POST /api/v1/scenarios/evaluate and
GET /api/v1/models/current once the API skeleton exists).

    from ml.inference import OutageSeverityModel
    model = OutageSeverityModel.load()
    model.predict(["48201", "48157"], ["WS"], "2021-02-15T12:00:00Z")

Returns dicts shaped like the `Prediction` contract in docs/06-API-CONTRACTS.md, plus an
80 % interval and an out-of-distribution flag. Invalid input raises `UnsupportedInput`
(map to HTTP 422; unknown county -> 404 per the contract).
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.common import SCOPE, TARGET_UNIT, WARNING_CODES, build_features, load_config, p, warning_key  # noqa: E402

ALLOWED_PERTURBATIONS = {"month": (1, 12), "local_hour": (0, 23)}


class UnsupportedInput(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class OutageSeverityModel:
    def __init__(self, art: dict, metadata: dict | None = None):
        self.art = art
        self.metadata = metadata or {}
        self.version = art["version"]
        self.counties = art["county_static"]
        self.source_id = self.metadata.get("dataSource", {}).get("id", "zenodo-22651795")

    @classmethod
    def load(cls, model_path: str | Path | None = None, metadata_path: str | Path | None = None,
             verify: bool = True) -> "OutageSeverityModel":
        cfg = load_config()
        model_path = Path(model_path or p(cfg["artifacts"]["model"]))
        metadata_path = Path(metadata_path or p(cfg["artifacts"]["metadata"]))
        meta = json.loads(metadata_path.read_text()) if metadata_path.exists() else None
        if verify and meta is not None:
            digest = hashlib.sha256(model_path.read_bytes()).hexdigest()
            if digest != meta["artifact"]["sha256"]:
                raise RuntimeError(f"model artifact sha256 {digest[:12]} does not match metadata")
        return cls(joblib.load(model_path), meta)

    # ------------------------------------------------------------------ validation
    def _validate(self, county_fips, warning_types, perturbations):
        if not county_fips:
            raise UnsupportedInput("empty_selection", "select at least one county")
        bad = [f for f in county_fips if f not in self.art["supported_counties"]]
        if bad:
            raise UnsupportedInput("unsupported_county", f"counties outside the supported region: {bad}")
        if not warning_types:
            raise UnsupportedInput("no_warning", "the model is conditional on at least one NWS warning type")
        unknown = [w for w in warning_types if w not in WARNING_CODES]
        if unknown:
            raise UnsupportedInput("unsupported_warning", f"unknown VTEC phenomenon codes: {unknown}")
        for k, v in (perturbations or {}).items():
            if k not in ALLOWED_PERTURBATIONS:
                raise UnsupportedInput("unsupported_parameter",
                                       f"'{k}' is not a model feature; allowed: {sorted(ALLOWED_PERTURBATIONS)}")
            lo, hi = ALLOWED_PERTURBATIONS[k]
            if not (lo <= float(v) <= hi):
                raise UnsupportedInput("out_of_range", f"{k}={v} outside [{lo}, {hi}]")

    # ------------------------------------------------------------------ prediction
    def predict(self, county_fips: list[str], warning_types: list[str], event_time_utc: str | datetime,
                perturbations: dict | None = None) -> list[dict]:
        county_fips = [str(f).zfill(5) for f in county_fips]
        warning_types = sorted({str(w).upper() for w in warning_types})
        self._validate(county_fips, warning_types, perturbations)
        perturbations = perturbations or {}
        t = pd.Timestamp(event_time_utc)
        t = t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")

        cs = self.counties.loc[county_fips]
        df = pd.DataFrame({"fips_code": county_fips}, index=range(len(county_fips)))
        for c in WARNING_CODES:
            df[f"w_{c}"] = int(c in warning_types)
        df["n_warnings"] = len(warning_types)
        df["WFO"] = [self.art["county_default_wfo"].get(f) for f in county_fips]
        df["month"] = int(perturbations.get("month", t.month))
        lon = cs["lon"].to_numpy()
        df["solar_hour"] = float(perturbations["local_hour"]) if "local_hour" in perturbations else \
            ((t.hour + t.minute / 60 + lon / 15.0) % 24.0)
        df["source_completeness_pct"] = 100.0
        for c in ["log_aland_km2", "awater_share", "lon", "lat"]:
            df[c] = cs[c].to_numpy()

        X = build_features(df, self.art["county_stats"], self.art["wfo_categories"])
        out = {k: np.clip(np.expm1(m.predict(X)), 0, None) for k, m in self.art["models"].items()}
        stack = np.sort(np.vstack([out["q10"], out["median"], out["q90"]]), axis=0)  # guard quantile crossing

        key = warning_key(warning_types)
        b = self.art["baselines"]
        seen = key in set(self.art["seen_warning_keys"])
        mode = "exploratory_what_if" if perturbations else "historical_context"
        res = []
        for i, f in enumerate(county_fips):
            base = b["by_county_warning"].get(f"{f}|{key}", b["by_county"].get(f, b["global_median"]))
            notes = [
                "Conditional estimate: assumes an outage is already occurring under these warnings; "
                "not an outage probability or a weather forecast.",
                "Estimated under full EAGLE-I source-record availability.",
            ]
            if mode == "exploratory_what_if":
                notes.insert(0, "Exploratory: not a real forecast. Parameters changed: " + ", ".join(sorted(perturbations)))
            if not seen:
                notes.append("This warning combination never co-occurred with outages in the Houston training "
                             "data; the estimate is extrapolated.")
            res.append(dict(
                countyFips=f,
                county=str(cs.loc[f, "county_name"]),
                predictedSeverity=round(float(stack[1, i]), 1),
                predictedLow=round(float(stack[0, i]), 1),
                predictedHigh=round(float(stack[2, i]), 1),
                intervalQuantiles=self.art["interval_quantiles"],
                severityUnit=TARGET_UNIT,
                modelVersion=self.version,
                dataMode="trained_conditional",
                modelMode=mode,
                scope=SCOPE,
                baselineSeverity=round(float(base), 1),
                outOfDistribution=not seen,
                notes=notes,
                sourceIds=[self.source_id],
            ))
        return res

    def describe(self) -> dict:
        """Payload for GET /api/v1/models/current."""
        m = self.metadata
        keys = ["modelVersion", "createdUtc", "algorithm", "target", "scope", "split", "dataSource",
                "supportedGeography", "supportedWarningTypes", "supportedPerturbations", "inferenceAssumptions",
                "limitations", "permutationImportance"]
        d = {k: m.get(k) for k in keys}
        d["metrics"] = {k: m.get("metrics", {}).get(k) for k in
                        ["test_houston", "test_houston_excluding_largest_episode", "model_beats_baseline_on_mae_log1p"]}
        return d
