"""Train + evaluate the Harvey flood-depth model.

    python -I ml/flood/train_flood.py

Protocol (spatial hold-out; all labels are from ONE storm, Hurricane Harvey 2017):
  1. Feature-set selection by leave-one-basin-out CV over the three non-holdout basin groups
     (Brazos, San Bernard, coastal creeks).
  2. Train on those three groups, test ONCE on the San Jacinto reach (Harris County).
  3. Compare against HAND-threshold baselines (the standard terrain-only inundation method).
  4. Check predicted depth at USGS surveyed high-water marks in the held-out reach.
  5. Refit on all four groups for the deployable artifact.
"""
from __future__ import annotations

import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ml.flood.common import FEATURE_LABELS, FEATURES, load_cfg, load_grid, log, p  # noqa: E402

PARAMS = dict(learning_rate=0.06, max_iter=400, max_leaf_nodes=63, min_samples_leaf=100, l2_regularization=1.0)
FEATURE_SETS = {
    "all": FEATURES,
    "no_abs_elev": [f for f in FEATURES if f != "elev"],
    "no_abs_elev_no_rain": [f for f in FEATURES if f not in ("elev", "rain_mm")],
}
EVAL_PER_UNIT = 300_000


# ------------------------------------------------------------------------------------ data
def load_unit(cfg, u, rng):
    out = p(cfg["paths"]["out"])
    lab = np.load(out / f"labels_{u['name']}.npz")
    fea = np.load(out / f"features_{u['name']}.npz")
    ok = lab["labeled"] & (fea["water_frac"] < 0.5) & ~fea["dem_missing"]
    idx = np.flatnonzero(ok.ravel())
    depth = lab["depth"].ravel()[idx]
    wet = depth > 0.15
    n = cfg["sample_per_unit"]
    wi, di = idx[wet], idx[~wet]
    tr = np.concatenate([rng.choice(wi, min(n // 2, len(wi)), replace=False),
                         rng.choice(di, min(n - min(n // 2, len(wi)), len(di)), replace=False)])
    ev = rng.choice(idx, min(EVAL_PER_UNIT, len(idx)), replace=False)

    def table(cells, role):
        df = pd.DataFrame({f: fea[f].ravel()[cells] for f in FEATURES})
        df["depth"] = lab["depth"].ravel()[cells]
        df["cell"] = cells
        df["unit"], df["group"], df["role"] = u["name"], u["group"], role
        return df

    t_tr, t_ev = table(tr, "train"), table(ev, "eval")
    share = wet.mean()
    w_wet = share * len(tr) / max((t_tr.depth > 0.15).sum(), 1)
    w_dry = (1 - share) * len(tr) / max((t_tr.depth <= 0.15).sum(), 1)
    t_tr["w"] = np.where(t_tr.depth > 0.15, w_wet, w_dry)
    t_ev["w"] = 1.0
    hwm = lab["hwm"]
    grid = load_grid(out / f"grid_{u['name']}.json")
    hw = None
    if len(hwm):
        r, c = hwm[:, 0].astype(int), hwm[:, 1].astype(int)
        cells = r * grid.width + c
        hw = pd.DataFrame({f: fea[f].ravel()[cells] for f in FEATURES})
        hw["hwm_m"], hw["cell_depth"] = hwm[:, 2], lab["depth"].ravel()[cells]
        hw["unit"], hw["group"] = u["name"], u["group"]
    return t_tr, t_ev, hw, int(len(idx)), float(share)


# ------------------------------------------------------------------------------------ metrics
def scores(obs, pred, w=None) -> dict:
    obs, pred = np.asarray(obs, float), np.asarray(pred, float)
    err = pred - obs
    out = dict(n=int(len(obs)), mae=float(np.mean(np.abs(err))), rmse=float(np.sqrt(np.mean(err ** 2))),
               bias=float(np.mean(err)))
    wet = obs > 0.15
    if wet.any():
        out["mae_wet_cells"] = float(np.mean(np.abs(err[wet])))
    for t in (0.15, 0.30):
        o, pr = obs > t, pred > t
        hit, miss, fa = int((o & pr).sum()), int((o & ~pr).sum()), int((~o & pr).sum())
        out[f"csi_{int(t * 100)}cm"] = hit / max(hit + miss + fa, 1)
        out[f"pod_{int(t * 100)}cm"] = hit / max(hit + miss, 1)
        out[f"far_{int(t * 100)}cm"] = fa / max(hit + fa, 1)
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in out.items()}


def hand_baseline_fit(df):
    """h maximising CSI@15cm for depth = max(0, h - HAND); and h = a + b*log10(river km2)."""
    hand = df.hand.fillna(1e3).to_numpy()
    s = df.log_stream_up_km2.to_numpy()
    obs = df.depth.to_numpy()
    best1 = max(np.arange(0.25, 12.01, 0.25), key=lambda h: scores(obs, np.maximum(0, h - hand))["csi_15cm"])
    best2, bv = (best1, 0.0), -1
    for a in np.arange(0.0, 10.01, 0.5):
        for b in np.arange(0.0, 3.01, 0.25):
            v = scores(obs, np.maximum(0, a + b * np.clip(s, 0, None) - hand))["csi_15cm"]
            if v > bv:
                best2, bv = (a, b), v
    return dict(h=float(best1), a=float(best2[0]), b=float(best2[1]))


def hand_baseline_predict(bp, df):
    hand = df.hand.fillna(1e3).to_numpy()
    s = np.clip(df.log_stream_up_km2.to_numpy(), 0, None)
    return {"hand_threshold": np.maximum(0, bp["h"] - hand),
            "hand_river_size": np.maximum(0, bp["a"] + bp["b"] * s - hand)}


def fit_model(train, feats, seed):
    m = HistGradientBoostingRegressor(loss="squared_error", early_stopping=False, random_state=seed, **PARAMS)
    m.fit(train[feats], train.depth, sample_weight=train.w)
    return m


def evaluate(m, feats, bp, ev, hw):
    pred = np.clip(m.predict(ev[feats]), 0, None)
    res = {"model": scores(ev.depth, pred)}
    for k, v in hand_baseline_predict(bp, ev).items():
        res[k] = scores(ev.depth, v)
    if hw is not None and len(hw):
        hp = np.clip(m.predict(hw[feats]), 0, None)
        res["hwm"] = dict(n=int(len(hw)), model_mae=round(float(np.mean(np.abs(hp - hw.hwm_m))), 3),
                          model_bias=round(float(np.mean(hp - hw.hwm_m)), 3),
                          map_mae=round(float(np.mean(np.abs(hw.cell_depth - hw.hwm_m))), 3),
                          hand_threshold_mae=round(float(np.mean(np.abs(
                              hand_baseline_predict(bp, hw)["hand_threshold"] - hw.hwm_m))), 3))
    return res


def main():
    t_start = time.time()
    cfg = load_cfg()
    seed = cfg["seed"]
    rng = np.random.default_rng(seed)
    tr_parts, ev_parts, hw_parts, unit_info = [], [], [], {}
    for u in cfg["units"]:
        t_tr, t_ev, hw, n_land, share = load_unit(cfg, u, rng)
        tr_parts.append(t_tr), ev_parts.append(t_ev)
        if hw is not None:
            hw_parts.append(hw)
        unit_info[u["name"]] = dict(group=u["group"], labeled_land_cells=n_land, wet_share_15cm=round(share, 4),
                                    hwm=0 if hw is None else len(hw))
        log(f"{u['name']:18s} land cells {n_land:>9,}  wet {share:.1%}  train {len(t_tr):,}  eval {len(t_ev):,}")
    TR, EV = pd.concat(tr_parts, ignore_index=True), pd.concat(ev_parts, ignore_index=True)
    HW = pd.concat(hw_parts, ignore_index=True)
    hold = cfg["holdout_group"]
    groups = [g for g in dict.fromkeys(u["group"] for u in cfg["units"]) if g != hold]

    # 1. feature-set selection: leave-one-basin-out among non-holdout groups
    cv = {}
    for name, feats in FEATURE_SETS.items():
        folds = {}
        for g in groups:
            trn = TR[TR.group.isin([x for x in groups if x != g])]
            bp = hand_baseline_fit(EV[EV.group.isin([x for x in groups if x != g])])
            m = fit_model(trn, feats, seed)
            folds[g] = evaluate(m, feats, bp, EV[EV.group == g], HW[HW.group == g])
        cv[name] = dict(folds=folds,
                        mean_csi_15cm=round(float(np.mean([f["model"]["csi_15cm"] for f in folds.values()])), 4),
                        mean_mae=round(float(np.mean([f["model"]["mae"] for f in folds.values()])), 4))
        log(f"CV feature set {name:22s} mean CSI@15cm {cv[name]['mean_csi_15cm']:.3f}  mean MAE {cv[name]['mean_mae']:.3f} m  "
            + "  ".join(f"{g}:{f['model']['csi_15cm']:.2f}/{f['hand_threshold']['csi_15cm']:.2f}" for g, f in folds.items()))
    chosen = max(cv, key=lambda k: (cv[k]["mean_csi_15cm"], -cv[k]["mean_mae"]))
    feats = FEATURE_SETS[chosen]
    log(f"-> feature set: {chosen}")

    # 2. train on non-holdout groups, test once on the holdout reach
    trn = TR[TR.group.isin(groups)]
    bp = hand_baseline_fit(EV[EV.group.isin(groups)])
    m_hold = fit_model(trn, feats, seed)
    test = evaluate(m_hold, feats, bp, EV[EV.group == hold], HW[HW.group == hold])
    log(f"HOLDOUT {hold}: model CSI@15cm {test['model']['csi_15cm']:.3f} MAE {test['model']['mae']:.3f} m "
        f"MAE(wet) {test['model'].get('mae_wet_cells')}  | HAND-threshold CSI {test['hand_threshold']['csi_15cm']:.3f} "
        f"MAE {test['hand_threshold']['mae']:.3f}  | HAND+river CSI {test['hand_river_size']['csi_15cm']:.3f}")
    if "hwm" in test:
        log(f"HOLDOUT high-water marks: {test['hwm']}")
    samp = EV[EV.group == hold].sample(min(20000, (EV.group == hold).sum()), random_state=seed)
    pi = permutation_importance(m_hold, samp[feats], samp.depth, scoring="neg_mean_absolute_error",
                                n_repeats=3, random_state=seed)
    importance = sorted([dict(feature=f, label=FEATURE_LABELS[f], mae_increase_m=round(float(v), 4))
                         for f, v in zip(feats, pi.importances_mean)], key=lambda d: -d["mae_increase_m"])

    # holdout prediction map for visual QA
    hu = next(u for u in cfg["units"] if u["group"] == hold)
    write_maps(cfg, hu, m_hold, feats)

    # 3. deployable model on all groups
    m_all = fit_model(TR, feats, seed)
    bp_all = hand_baseline_fit(EV)
    art_dir = p(cfg["paths"]["artifacts"])
    art_dir.mkdir(parents=True, exist_ok=True)
    art_path = art_dir / "flood_model.joblib"
    joblib.dump(dict(version=cfg["version"], model=m_all, features=feats, hand_baseline=bp_all,
                     holdout_model=m_hold, holdout_baseline=bp, params=PARAMS, crs_epsg=cfg["crs_epsg"],
                     res_m=cfg["res_m"], stream_threshold_km2=cfg["stream_threshold_km2"]), art_path, compress=3)
    digest = hashlib.sha256(art_path.read_bytes()).hexdigest()

    meta = dict(
        modelVersion=cfg["version"], createdUtc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        dataMode="trained_observed_event",
        target=dict(name="depth", unit="m", definition="mean water depth over a 20 m cell during the Hurricane Harvey "
                    "peak (Aug-Sep 2017), dry ground inside the USGS mapped area counted as 0; open water excluded",
                    source_units_note="USGS depth rasters are stored in feet; converted to metres (verified against "
                                      "surveyed high-water-mark heights above ground)."),
        algorithm="scikit-learn HistGradientBoostingRegressor (squared error), wet/dry-balanced sampling with "
                  "weights restoring the true wet share per reach",
        features=feats, featureLabels={f: FEATURE_LABELS[f] for f in feats},
        artifact=dict(path=str(art_path.relative_to(p("."))), sha256=digest),
        units=unit_info,
        evaluation=dict(
            policy="spatial hold-out by basin; feature set chosen by leave-one-basin-out CV on non-holdout basins; "
                   f"'{hold}' (Harris County reach) tested once",
            cv=cv, chosen_feature_set=chosen, holdout_group=hold, holdout=test, hand_baseline_params=bp,
        ),
        permutationImportance=importance,
        deployable=dict(trained_on="all four basin groups", hand_baseline_params=bp_all),
        limitations=[
            "All labels come from one storm (Hurricane Harvey). Validation is across places, not across storms; "
            "skill for other storms (or for slider-driven what-ifs) is unvalidated.",
            "Rainfall varies only spatially within Harvey (roughly 40-1250 mm storm totals). The model has never seen "
            "a modest storm, so low-rain scenarios are extrapolations and should not be shown as predictions.",
            "Labels are USGS riverine flood documentation along mapped reaches, derived by interpolating surveyed "
            "high-water marks over a DEM; they are not observations of street-level ponding in central Houston.",
            "Central Houston bayous (Buffalo, Brays, White Oak) are outside the USGS Harvey mapped reaches; "
            "predictions there are untested transfer.",
            "20 m cells average out sub-cell terrain (curbs, underpasses); not a substitute for engineering models.",
        ],
        environment=dict(python=platform.python_version(), sklearn=sklearn.__version__, numpy=np.__version__),
        seed=seed, runtimeSeconds=round(time.time() - t_start, 1),
    )
    (art_dir / "flood_model_metadata.json").write_text(json.dumps(meta, indent=1))
    log(f"artifact sha256 {digest[:12]}…  total {meta['runtimeSeconds']}s")


def write_maps(cfg, u, model, feats):
    """Observed vs predicted depth for the holdout reach: GeoTIFF + quick-look PNG."""
    import rasterio
    from PIL import Image

    out = p(cfg["paths"]["out"])
    grid = load_grid(out / f"grid_{u['name']}.json")
    lab = np.load(out / f"labels_{u['name']}.npz")
    fea = np.load(out / f"features_{u['name']}.npz")
    X = pd.DataFrame({f: fea[f].ravel() for f in feats})
    pred = np.clip(model.predict(X), 0, None).reshape(grid.height, grid.width).astype(np.float32)
    land = (fea["water_frac"] < 0.5) & ~fea["dem_missing"]
    pred[~land] = np.nan
    art = p(cfg["paths"]["artifacts"])
    art.mkdir(parents=True, exist_ok=True)
    with rasterio.open(art / f"pred_depth_{u['name']}.tif", "w", driver="GTiff", height=grid.height, width=grid.width,
                       count=1, dtype="float32", crs=f"EPSG:{grid.crs}", transform=grid.transform, nodata=np.nan,
                       compress="deflate") as ds:
        ds.write(pred, 1)

    def rgb(d, mask):
        img = np.full(d.shape + (3,), 235, np.uint8)
        img[~mask] = 200
        t = np.clip(np.nan_to_num(d) / 3.0, 0, 1)
        wet = mask & (np.nan_to_num(d) > 0.15)
        img[wet] = np.stack([(30 + 0 * t), (90 + 120 * (1 - t)), (160 + 95 * (1 - t))], -1)[wet].astype(np.uint8)
        return img

    obs = np.where(lab["labeled"] & land, lab["depth"], np.nan)
    m = lab["labeled"] & land
    k = max(1, grid.width // 900)
    a, b = rgb(obs, m)[::k, ::k], rgb(np.where(m, pred, np.nan), m)[::k, ::k]
    Image.fromarray(np.concatenate([a, np.full((a.shape[0], 8, 3), 255, np.uint8), b], 1)).save(
        art / f"holdout_{u['name']}_observed_vs_predicted.png")


if __name__ == "__main__":
    main()
