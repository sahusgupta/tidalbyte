"""Evaluate the trained outage-severity model on held-out storms.

    python -I ml/evaluate.py --config ml/config.yaml [--split test]

Recomputes held-out metrics from the saved artifact (so numbers in model_metadata.json can be
re-verified), compares against the baselines stored in the artifact, and breaks errors down by
county and storm episode.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.common import TARGET, build_features, episodes, load_config, metrics, p, warning_key  # noqa: E402


# ---------------------------------------------------------------- baselines
def fit_baselines(train: pd.DataFrame) -> dict:
    """Medians from the training period (customers). `train` = Houston-region training rows."""
    y = train[TARGET]
    return dict(
        global_median=float(y.median()),
        by_warning=train.groupby("warning_key")[TARGET].median().to_dict(),
        by_county=train.groupby("fips_code")[TARGET].median().to_dict(),
        by_county_warning={f"{a}|{b}": v for (a, b), v in
                           train.groupby(["fips_code", "warning_key"])[TARGET].median().items()},
    )


def predict_baselines(b: dict, df: pd.DataFrame) -> dict[str, np.ndarray]:
    g = b["global_median"]
    by_w = df.warning_key.map(b["by_warning"]).fillna(g).to_numpy()
    by_c = df.fips_code.map(b["by_county"]).fillna(g).to_numpy()
    cw = (df.fips_code + "|" + df.warning_key).map(b["by_county_warning"])
    by_cw = cw.fillna(pd.Series(by_c, index=df.index)).to_numpy()
    return {
        "global_median": np.full(len(df), g),
        "warning_type_median": by_w,
        "county_median": by_c,
        "county_x_warning_median": by_cw,
    }


# ---------------------------------------------------------------- drift
def drift_by_county_year(rows: pd.DataFrame) -> dict:
    """Median outage per Houston county and year + mean source availability per year (descriptive)."""
    h = rows[rows.is_houston]
    yr = h.Hour.dt.year
    t = h.pivot_table(index="county", columns=yr, values=TARGET, aggfunc="median")
    comp = h.groupby(yr).source_completeness_pct.mean()
    return dict(
        median_customers_by_county_year={
            str(c): {int(y): (None if pd.isna(v) else round(float(v), 1)) for y, v in r.items()} for c, r in t.iterrows()
        },
        mean_source_availability_by_year={int(y): round(float(v), 1) for y, v in comp.items()},
    )


# ---------------------------------------------------------------- model
def predict_model(art: dict, df: pd.DataFrame, which: str = "median") -> np.ndarray:
    X = build_features(df, art["county_stats"], art["wfo_categories"])
    return np.clip(np.expm1(art["models"][which].predict(X)), 0, None)


def evaluate_frame(art: dict, df: pd.DataFrame) -> dict:
    y = df[TARGET].to_numpy()
    pred = predict_model(art, df)
    lo = predict_model(art, df, "q10")
    hi = predict_model(art, df, "q90")
    res = {"model": metrics(y, pred, lo, hi)}
    for name, b in predict_baselines(art["baselines"], df).items():
        res[name] = metrics(y, b)
    return res


def detailed_report(art: dict, rows: pd.DataFrame, split: str) -> dict:
    h = rows[rows.is_houston & (rows.split == split)].copy()
    if h.empty:
        return {"split": split, "n": 0}
    h["pred"] = predict_model(art, h)
    h["lo"] = predict_model(art, h, "q10")
    h["hi"] = predict_model(art, h, "q90")
    base = predict_baselines(art["baselines"], h)
    h["base_cw"] = base["county_x_warning_median"]

    ev = h.groupby(["fips_code", "new_event_no"]).agg(start=("event_start", "first"), end=("event_end", "first"))
    ev["episode"] = episodes(ev.reset_index()).to_numpy()
    h = h.join(ev["episode"], on=["fips_code", "new_event_no"])

    out = {"split": split, "houston": evaluate_frame(art, h)}
    biggest = h.groupby("episode")[TARGET].sum().idxmax()
    rest = h[h.episode != biggest]
    out["houston_excluding_largest_episode"] = {"excluded_episode": biggest, **evaluate_frame(art, rest)}
    full = h[h.source_completeness_pct >= 100]
    out["houston_full_source_records"] = evaluate_frame(art, full) if len(full) else {}

    by_c = []
    for f, g in h.groupby("fips_code"):
        m = metrics(g[TARGET], g.pred)
        bm = metrics(g[TARGET], g.base_cw)
        by_c.append(dict(countyFips=f, county=str(g.county.iloc[0]), n=m["n"], model_mae=m["mae"],
                         model_mae_log1p=m["mae_log1p"], baseline_mae=bm["mae"], baseline_mae_log1p=bm["mae_log1p"]))
    out["by_county"] = sorted(by_c, key=lambda d: -d["n"])

    eps = []
    for e, g in h.groupby("episode"):
        eps.append(dict(
            episode=e, start=str(g.Hour.min()), warnings=warning_key(";".join(g.warning_key)), n=len(g),
            observed_peak=float(g[TARGET].max()), predicted_at_peak_hour=float(g.loc[g[TARGET].idxmax(), "pred"]),
            interval_at_peak_hour=[float(g.loc[g[TARGET].idxmax(), "lo"]), float(g.loc[g[TARGET].idxmax(), "hi"])],
            model_mae=metrics(g[TARGET], g.pred)["mae"], baseline_mae=metrics(g[TARGET], g.base_cw)["mae"],
        ))
    out["top_episodes"] = sorted(eps, key=lambda d: -d["observed_peak"])[:8]

    h["abs_err"] = (h.pred - h[TARGET]).abs()
    worst = h.sort_values("abs_err", ascending=False).drop_duplicates("episode").head(5)
    out["failure_cases"] = [
        dict(hour=str(r.Hour), county=str(r.county), warnings=r.warning_key, observed=round(float(r[TARGET]), 1),
             predicted=round(float(r.pred), 1), interval=[round(float(r.lo), 1), round(float(r.hi), 1)],
             source_completeness_pct=float(r.source_completeness_pct))
        for _, r in worst.iterrows()
    ]
    return out


def main(cfg_path: str, split: str):
    cfg = load_config(cfg_path)
    art = joblib.load(p(cfg["artifacts"]["model"]))
    rows = pd.read_parquet(p(cfg["data"]["processed_rows"]))
    rep = detailed_report(art, rows, split)
    print(json.dumps(rep["houston"], indent=1))
    print("excluding largest episode:", json.dumps(rep["houston_excluding_largest_episode"]["model"]))
    for e in rep["top_episodes"]:
        print(f"  {e['episode']:16s} {e['warnings']:12s} observed peak {e['observed_peak']:>10,.0f}  "
              f"model {e['predicted_at_peak_hour']:>9,.0f}  [{e['interval_at_peak_hour'][0]:,.0f}-"
              f"{e['interval_at_peak_hour'][1]:,.0f}]")
    return rep


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(p("ml/config.yaml")))
    ap.add_argument("--split", default="test", choices=["val", "test"])
    a = ap.parse_args()
    main(a.config, a.split)
