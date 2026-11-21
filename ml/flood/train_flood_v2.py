"""v2 flood-depth model: fixes v1's shallow false alarms.

    python -I ml/flood/train_flood_v2.py

Changes vs v1 (train_flood.py):
  1. Two-part ("hurdle") model: HGB classifier for wet (> 15 cm) + HGB regressor for depth given wet,
     instead of one regressor whose hedged small depths became false alarms.
  2. Wet-probability threshold chosen by leave-one-basin-out CV (non-holdout basins only).
  3. River-connectivity filter: predicted water must connect to a river of a CV-chosen minimum size.
Scoring uses every labeled land cell (not a sample), so v1 is re-scored the same way for comparison.

Outputs: flood_model_v2.joblib / flood_model_metadata_v2.json. v1 (flood_model.joblib) is the default
for emergency routing (higher recall); v2 is the alternative for flood-map display.

Disclosure: these changes were motivated by v1's San Jacinto hold-out result, so that hold-out is no
longer fully untouched. All choices among v2 variants use only the three non-holdout basins.
"""
from __future__ import annotations

import hashlib
import itertools
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
from scipy import ndimage
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ml.flood.common import FEATURE_LABELS, FEATURES, load_cfg, load_grid, log, p  # noqa: E402
from ml.flood.train_flood import PARAMS, hand_baseline_fit, load_unit, scores  # noqa: E402

FEATURE_SETS = {"all": FEATURES, "no_abs_elev": [f for f in FEATURES if f != "elev"]}
TAUS = [round(t, 2) for t in np.arange(0.30, 0.86, 0.05)]
CONNECT = {"none": None, "river>=10km2": 1.0, "river>=100km2": 2.0}  # log10 km2 of the river reached
WET = 0.15


# ------------------------------------------------------------------------------------ models
def fit_two_part(train: pd.DataFrame, feats, seed):
    y = (train.depth > WET).astype(int)
    clf = HistGradientBoostingClassifier(early_stopping=False, random_state=seed, **PARAMS)
    clf.fit(train[feats], y, sample_weight=train.w)
    wet = train[train.depth > WET]
    reg = HistGradientBoostingRegressor(loss="squared_error", early_stopping=False, random_state=seed, **PARAMS)
    reg.fit(wet[feats], wet.depth)
    return clf, reg


class UnitMaps:
    """Full-grid arrays for one reach (features, labels, masks)."""

    def __init__(self, cfg, u):
        out = p(cfg["paths"]["out"])
        self.name, self.group = u["name"], u["group"]
        self.grid = load_grid(out / f"grid_{u['name']}.json")
        self.fea = np.load(out / f"features_{u['name']}.npz")
        lab = np.load(out / f"labels_{u['name']}.npz")
        self.depth = lab["depth"]
        self.hwm = lab["hwm"]
        self.eval_mask = lab["labeled"] & (self.fea["water_frac"] < 0.5) & ~self.fea["dem_missing"]
        self.streams = self.fea["streams"]
        self.log_up = self.fea["log_up_km2"]

    def predict(self, models, feats, chunk=2_000_000):
        clf, reg = models
        n = self.grid.width * self.grid.height
        prob = np.empty(n, np.float32)
        dgw = np.empty(n, np.float32)
        cols = {f: self.fea[f].ravel() for f in feats}
        for s in range(0, n, chunk):
            X = pd.DataFrame({f: cols[f][s:s + chunk] for f in feats})
            prob[s:s + chunk] = clf.predict_proba(X)[:, 1]
            dgw[s:s + chunk] = np.clip(reg.predict(X), WET, None)
        shape = (self.grid.height, self.grid.width)
        return prob.reshape(shape), dgw.reshape(shape)

    def predict_v1(self, model, feats, chunk=2_000_000):
        n = self.grid.width * self.grid.height
        out = np.empty(n, np.float32)
        cols = {f: self.fea[f].ravel() for f in feats}
        for s in range(0, n, chunk):
            out[s:s + chunk] = np.clip(model.predict(pd.DataFrame({f: cols[f][s:s + chunk] for f in feats})), 0, None)
        return out.reshape(self.grid.height, self.grid.width)


def gate(prob, dgw, tau, conn, streams, log_up):
    wet = prob > tau
    if conn is not None:
        seeds = streams & (log_up >= conn)
        lab, _ = ndimage.label(wet | seeds, structure=np.ones((3, 3)))
        keep = np.zeros(lab.max() + 1, bool)
        keep[np.unique(lab[seeds])] = True
        keep[0] = False
        wet &= keep[lab]
    return np.where(wet, dgw, 0.0).astype(np.float32)


def score_unit(um: UnitMaps, pred):
    m = um.eval_mask
    return um.depth[m], pred[m]


def hwm_scores(um: UnitMaps, pred, hand_pred=None):
    if not len(um.hwm):
        return None
    r, c, obs = um.hwm[:, 0].astype(int), um.hwm[:, 1].astype(int), um.hwm[:, 2]
    out = dict(n=int(len(obs)), mae=round(float(np.mean(np.abs(pred[r, c] - obs))), 3),
               bias=round(float(np.mean(pred[r, c] - obs)), 3),
               map_mae=round(float(np.nanmean(np.abs(um.depth[r, c] - obs))), 3))
    if hand_pred is not None:
        out["hand_threshold_mae"] = round(float(np.mean(np.abs(hand_pred[r, c] - obs))), 3)
    return out


def hand_maps(um: UnitMaps, bp):
    hand = np.nan_to_num(um.fea["hand"], nan=1e3)
    s = np.clip(um.fea["log_stream_up_km2"], 0, None)
    return {"hand_threshold": np.maximum(0, bp["h"] - hand), "hand_river_size": np.maximum(0, bp["a"] + bp["b"] * s - hand)}


# ------------------------------------------------------------------------------------ main
def main():
    t_start = time.time()
    cfg = load_cfg()
    seed = cfg["seed"]
    rng = np.random.default_rng(seed)
    hold = cfg["holdout_group"]
    tr_parts, ev_parts = [], []
    for u in cfg["units"]:
        t_tr, t_ev, _, _, _ = load_unit(cfg, u, rng)
        tr_parts.append(t_tr), ev_parts.append(t_ev)
    TR, EV = pd.concat(tr_parts, ignore_index=True), pd.concat(ev_parts, ignore_index=True)
    groups = [g for g in dict.fromkeys(u["group"] for u in cfg["units"]) if g != hold]
    units = {u["name"]: u for u in cfg["units"]}

    # 1. leave-one-basin-out: out-of-fold probability maps for every non-holdout reach
    cv, best = {}, None
    for fs_name, feats in FEATURE_SETS.items():
        oof = {}
        for g in groups:
            models = fit_two_part(TR[TR.group.isin([x for x in groups if x != g])], feats, seed)
            for name, u in units.items():
                if u["group"] == g:
                    um = UnitMaps(cfg, u)
                    prob, dgw = um.predict(models, feats)
                    oof[name] = (um, prob, dgw)
        log(f"CV {fs_name}: out-of-fold maps ready ({time.time() - t_start:.0f}s)")
        for tau, (cname, conn) in itertools.product(TAUS, CONNECT.items()):
            per_group = {}
            for g in groups:
                obs, pred = [], []
                for name, (um, prob, dgw) in oof.items():
                    if um.group == g:
                        o, pr = score_unit(um, gate(prob, dgw, tau, conn, um.streams, um.log_up))
                        obs.append(o), pred.append(pr)
                per_group[g] = scores(np.concatenate(obs), np.concatenate(pred))
            key = f"{fs_name}|tau={tau}|{cname}"
            mean_csi = float(np.mean([s["csi_15cm"] for s in per_group.values()]))
            mean_mae = float(np.mean([s["mae"] for s in per_group.values()]))
            cv[key] = dict(feature_set=fs_name, tau=tau, connectivity=cname, mean_csi_15cm=round(mean_csi, 4),
                           mean_mae=round(mean_mae, 4), folds=per_group)
            if best is None or (mean_csi, -mean_mae) > (cv[best]["mean_csi_15cm"], -cv[best]["mean_mae"]):
                best = key
        top = sorted((k for k in cv if cv[k]["feature_set"] == fs_name), key=lambda k: -cv[k]["mean_csi_15cm"])[:3]
        for k in top:
            log(f"   {k:40s} mean CSI {cv[k]['mean_csi_15cm']:.3f}  MAE {cv[k]['mean_mae']:.3f}  "
                + "  ".join(f"{g}:{cv[k]['folds'][g]['csi_15cm']:.2f}" for g in groups))
        del oof
    sel = cv[best]
    feats = FEATURE_SETS[sel["feature_set"]]
    tau, conn = sel["tau"], CONNECT[sel["connectivity"]]
    log(f"-> chosen: {best}")

    # 2. hold-out reach, scored on every labeled land cell; v1 and baselines re-scored identically
    models = fit_two_part(TR[TR.group.isin(groups)], feats, seed)
    bp = hand_baseline_fit(EV[EV.group.isin(groups)])
    v1 = joblib.load(p(cfg["paths"]["artifacts"]) / "flood_model.joblib")
    hu = next(u for u in cfg["units"] if u["group"] == hold)
    um = UnitMaps(cfg, hu)
    prob, dgw = um.predict(models, feats)
    pred_v2 = gate(prob, dgw, tau, conn, um.streams, um.log_up)
    pred_v1 = um.predict_v1(v1["holdout_model"], v1["features"])
    hm = hand_maps(um, bp)
    test = {}
    for k, pr in [("model_v2", pred_v2), ("model_v1", pred_v1), *hm.items()]:
        test[k] = scores(*score_unit(um, pr))
    test["hwm"] = {"model_v2": hwm_scores(um, pred_v2, hm["hand_threshold"]), "model_v1": hwm_scores(um, pred_v1)}
    for k in ["model_v2", "model_v1", "hand_river_size", "hand_threshold"]:
        r = test[k]
        log(f"HOLDOUT {k:16s} CSI15 {r['csi_15cm']:.3f}  POD {r['pod_15cm']:.3f}  FAR {r['far_15cm']:.3f}  "
            f"CSI30 {r['csi_30cm']:.3f}  MAE {r['mae']:.3f}  MAE-wet {r.get('mae_wet_cells', float('nan')):.3f}  bias {r['bias']:+.3f}")
    log(f"HOLDOUT high-water marks: {test['hwm']}")
    write_maps(cfg, um, pred_v1, pred_v2)

    # 3. deployable: all four basin groups, chosen settings
    models_all = fit_two_part(TR, feats, seed)
    art_dir = p(cfg["paths"]["artifacts"])
    art_path = art_dir / "flood_model_v2.joblib"
    joblib.dump(dict(version="harvey-flood-depth-v2", classifier=models_all[0], regressor=models_all[1],
                     features=feats, tau=tau, connectivity_log10_km2=conn, wet_threshold_m=WET,
                     holdout_models=models, hand_baseline=hand_baseline_fit(EV), params=PARAMS,
                     crs_epsg=cfg["crs_epsg"], res_m=cfg["res_m"], stream_threshold_km2=cfg["stream_threshold_km2"]),
                art_path, compress=3)
    digest = hashlib.sha256(art_path.read_bytes()).hexdigest()
    v1_meta = json.loads((art_dir / "flood_model_metadata.json").read_text())
    meta = dict(
        modelVersion="harvey-flood-depth-v2", createdUtc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        dataMode="trained_observed_event", target=v1_meta["target"],
        algorithm=("Two-part model: scikit-learn HistGradientBoostingClassifier (wet > 15 cm) + "
                   "HistGradientBoostingRegressor (depth given wet); CV-chosen probability threshold and "
                   "river-connectivity filter"),
        features=feats, featureLabels={f: FEATURE_LABELS[f] for f in feats},
        artifact=dict(path=str(art_path.relative_to(p("."))), sha256=digest),
        units=v1_meta["units"],
        evaluation=dict(
            policy=("leave-one-basin-out CV over non-holdout basins selects feature set, threshold and connectivity; "
                    f"hold-out '{hold}' scored on every labeled land cell"),
            disclosure=("v2 was developed after seeing v1's hold-out false alarms, so the hold-out reach is no "
                        "longer fully untouched; v2's settings were selected only on the other basins."),
            chosen=dict(feature_set=sel["feature_set"], tau=tau, connectivity=sel["connectivity"]),
            cv_chosen=sel, cv_all={k: {kk: v[kk] for kk in ("mean_csi_15cm", "mean_mae")} for k, v in cv.items()},
            holdout_group=hold, holdout=test, hand_baseline_params=bp,
            cv=dict(folds={g: sel["folds"][g] for g in groups}),
            chosen_feature_set=sel["feature_set"],
        ),
        limitations=v1_meta["limitations"],
        environment=dict(python=platform.python_version(), sklearn=sklearn.__version__, numpy=np.__version__),
        seed=seed, runtimeSeconds=round(time.time() - t_start, 1),
    )
    (art_dir / "flood_model_metadata_v2.json").write_text(json.dumps(meta, indent=1))
    log(f"artifact sha256 {digest[:12]}…  total {meta['runtimeSeconds']}s")


def write_maps(cfg, um: UnitMaps, pred_v1, pred_v2):
    import rasterio
    from PIL import Image

    art = p(cfg["paths"]["artifacts"])
    art.mkdir(parents=True, exist_ok=True)
    g = um.grid
    land = (um.fea["water_frac"] < 0.5) & ~um.fea["dem_missing"]
    out = np.where(land, pred_v2, np.nan).astype(np.float32)
    with rasterio.open(art / f"pred_depth_{um.name}_v2.tif", "w", driver="GTiff", height=g.height, width=g.width, count=1,
                       dtype="float32", crs=f"EPSG:{g.crs}", transform=g.transform, nodata=np.nan,
                       compress="deflate") as ds:
        ds.write(out, 1)

    m = um.eval_mask

    def rgb(d):
        img = np.full(d.shape + (3,), 200, np.uint8)
        img[m] = 238
        t = np.clip(np.nan_to_num(d) / 3.0, 0, 1)
        wet = m & (np.nan_to_num(d) > WET)
        img[wet] = np.stack([30 + 0 * t, 90 + 120 * (1 - t), 160 + 95 * (1 - t)], -1)[wet].astype(np.uint8)
        return img

    k = max(1, g.width // 600)
    panels = [rgb(np.where(m, um.depth, np.nan)), rgb(pred_v1), rgb(pred_v2)]
    sep = np.full((panels[0][::k, ::k].shape[0], 8, 3), 255, np.uint8)
    Image.fromarray(np.concatenate([panels[0][::k, ::k], sep, panels[1][::k, ::k], sep, panels[2][::k, ::k]], 1)).save(
        art / f"holdout_{um.name}_observed_v1_v2.png")


if __name__ == "__main__":
    main()
