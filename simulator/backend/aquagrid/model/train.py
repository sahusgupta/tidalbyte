"""Train the XGBoost flood-depth surrogate.

    python -m aquagrid.model.train --region downtown-buffalo-bayou

Generates synthetic storms, labels sampled roads/buildings/ground cells with the physics
simulator, trains XGBoost on (static terrain features + storm parameters) -> water depth,
and evaluates on held-out storms.
"""
from __future__ import annotations

import argparse
import json
import time

import numpy as np
import pandas as pd
import xgboost as xgb

from ..config import DEFAULT_REGION, REGIONS
from ..pipeline.features import STATIC_FEATURES
from .featurize import FEATURE_LABELS, FEATURES, assemble, static_matrix
from .simulator import PRESETS, add_label_noise, sample_scenarios, simulate


def load_tables(out):
    fe = pd.read_parquet(out / "feat_edges.parquet")
    fb = pd.read_parquet(out / "feat_buildings.parquet")
    fc = pd.read_parquet(out / "feat_cells.parquet")
    return fe, fb, fc


def build_dataset(pool: pd.DataFrame, scenarios: pd.DataFrame, per_scenario: int, weights, rng, base_wl):
    n = len(scenarios)
    loc = rng.choice(len(pool), size=(n, per_scenario), p=weights).ravel()
    sc = scenarios.loc[np.repeat(np.arange(n), per_scenario)].reset_index(drop=True)
    f = pool.iloc[loc].reset_index(drop=True)
    y = simulate(f, sc.rain.to_numpy(), sc.duration.to_numpy(), sc.surge.to_numpy(), sc.clog.to_numpy(), base_wl)
    X = assemble(static_matrix(f), sc.rain.to_numpy(), sc.duration.to_numpy(), sc.surge.to_numpy(),
                 sc.clog.to_numpy(), base_wl)
    return X, y


def main(region_id: str, n_scenarios: int, per_scenario: int, seed: int = 7):
    region = REGIONS[region_id]
    out = region.out_dir
    rng = np.random.default_rng(seed)
    fe, fb, fc = load_tables(out)
    cols = STATIC_FEATURES
    pool = pd.concat([fe[cols], fb[cols], fc[cols]], ignore_index=True)
    # sample roads 45 %, buildings 20 %, open ground 35 %
    w = np.concatenate([
        np.full(len(fe), 0.45 / len(fe)), np.full(len(fb), 0.20 / len(fb)), np.full(len(fc), 0.35 / len(fc))
    ])

    scen = sample_scenarios(n_scenarios, rng)
    is_val = rng.random(len(scen)) < 0.15
    t0 = time.time()
    Xtr, ytr = build_dataset(pool, scen[~is_val].reset_index(drop=True), per_scenario, w, rng, region.base_water_level)
    Xva, yva = build_dataset(pool, scen[is_val].reset_index(drop=True), per_scenario, w, rng, region.base_water_level)
    ytr_noisy = add_label_noise(ytr, rng)
    print(f"dataset: train {len(ytr):,} rows ({(~is_val).sum()} storms), val {len(yva):,} rows "
          f"({is_val.sum()} storms) in {time.time() - t0:.1f}s", flush=True)

    dtr = xgb.DMatrix(Xtr, label=ytr_noisy, feature_names=FEATURES)
    dva = xgb.DMatrix(Xva, label=yva, feature_names=FEATURES)
    params = dict(
        objective="reg:squarederror", eval_metric="mae", tree_method="hist", max_depth=9, eta=0.08,
        subsample=0.8, colsample_bytree=0.9, min_child_weight=4, max_bin=256, nthread=-1, seed=seed,
    )
    t0 = time.time()
    booster = xgb.train(params, dtr, num_boost_round=600, evals=[(dva, "val")], early_stopping_rounds=40,
                        verbose_eval=100)
    train_s = time.time() - t0

    pred = np.clip(booster.predict(dva, iteration_range=(0, booster.best_iteration + 1)), 0, None)
    err = pred - yva
    ss_res, ss_tot = float((err**2).sum()), float(((yva - yva.mean()) ** 2).sum())

    def cls_metrics(th):
        t, p = yva > th, pred > th
        tp, fp, fn = (t & p).sum(), (~t & p).sum(), (t & ~p).sum()
        prec, rec = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
        return dict(threshold_m=th, accuracy=float((t == p).mean()), precision=float(prec), recall=float(rec),
                    f1=float(2 * prec * rec / max(prec + rec, 1e-9)))

    gain = booster.get_score(importance_type="total_gain")
    tot = sum(gain.values())
    importance = sorted(
        [dict(feature=k, label=FEATURE_LABELS.get(k, k), share=round(v / tot, 4)) for k, v in gain.items()],
        key=lambda d: -d["share"],
    )

    # preset fidelity: share of road length > 15 cm, teacher vs surrogate
    edges = pd.read_parquet(out / "edges.parquet")
    L = edges.length_m.to_numpy()
    Se = static_matrix(fe)
    preset_check = {}
    for k, p in PRESETS.items():
        truth = simulate(fe, p["rain"], p["duration"], p["surge"], p["clog"], region.base_water_level)
        X = assemble(Se, p["rain"], p["duration"], p["surge"], p["clog"], region.base_water_level)
        sur = np.clip(booster.inplace_predict(X, iteration_range=(0, booster.best_iteration + 1)), 0, None)
        preset_check[k] = dict(
            sim_pct_roads_15cm=round(100 * L[truth > 0.15].sum() / L.sum(), 1),
            ml_pct_roads_15cm=round(100 * L[sur > 0.15].sum() / L.sum(), 1),
        )

    metrics = dict(
        model="XGBoost gradient-boosted trees (hist)",
        target="water depth (m) at the lowest point of each road edge / building footprint / 17 m cell",
        teacher="process-based surge + drain-backflow + pluvial ponding simulator",
        n_train_rows=int(len(ytr)), n_val_rows=int(len(yva)),
        n_train_storms=int((~is_val).sum()), n_val_storms=int(is_val.sum()),
        n_trees=int(booster.best_iteration + 1), max_depth=params["max_depth"],
        train_seconds=round(train_s, 1),
        r2=round(1 - ss_res / ss_tot, 4), mae_cm=round(100 * float(np.abs(err).mean()), 2),
        rmse_cm=round(100 * float(np.sqrt((err**2).mean())), 2),
        classification=[cls_metrics(0.15), cls_metrics(0.30)],
        importance=importance,
        presets=preset_check,
        features=FEATURES,
    )
    mdir = out / "model"
    mdir.mkdir(exist_ok=True)
    booster.save_model(mdir / "flood_xgb.ubj")
    (mdir / "metrics.json").write_text(json.dumps(metrics, indent=1))
    print(json.dumps({k: metrics[k] for k in ("r2", "mae_cm", "rmse_cm", "n_trees", "train_seconds")}))
    for c in metrics["classification"]:
        print(c)
    for k, v in preset_check.items():
        print(f"  {k:13s} sim {v['sim_pct_roads_15cm']:5.1f}%  ml {v['ml_pct_roads_15cm']:5.1f}%")
    print("top features:", [(d["feature"], d["share"]) for d in importance[:8]])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default=DEFAULT_REGION, choices=list(REGIONS))
    ap.add_argument("--storms", type=int, default=800)
    ap.add_argument("--per-storm", type=int, default=2500)
    a = ap.parse_args()
    main(a.region, a.storms, a.per_storm)
