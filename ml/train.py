"""Train the conditional outage-severity model.

    python -I ml/train.py --config ml/config.yaml

Selection protocol (no test data touched until the end):
  1. Candidate training geographies (Gulf Coast / Texas / CONUS) fit on 2015-2019 events,
     compared on Houston-region 2020 events (validation).
  2. Small hyper-parameter grid on the chosen geography, same validation.
  3. Refit on 2015-2020 with the chosen settings (+ 10th/90th percentile models for intervals).
  4. Report once on Houston-region 2021-2022 events (test), against baselines.

Fails closed: without a readable config, the prepared dataset, or the ML packages, it exits with
code 2 and an actionable message before importing heavy libraries, and writes nothing.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import itertools
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_NOTHING_WRITTEN = "No model artifact or metrics were written."


def preflight(argv: list[str] | None = None) -> int:
    """Return 0 if training can run, else print an actionable message and return 2 (stdlib + PyYAML only)."""
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--config", type=Path, default=_ROOT / "ml" / "config.yaml")
    args, _ = ap.parse_known_args(argv)
    try:
        import yaml

        cfg = yaml.safe_load(args.config.read_text(encoding="utf-8"))
        rows = cfg["data"]["processed_rows"]
    except Exception as exc:  # noqa: BLE001
        print(f"Training unavailable: cannot read config {args.config}: {exc}. {_NOTHING_WRITTEN}", file=sys.stderr)
        return 2
    rows_path = Path(rows) if Path(rows).is_absolute() else _ROOT / rows
    if not rows_path.exists():
        print(f"Training unavailable: prepared dataset not found at {rows}. Download the Zenodo archive listed in "
              "data/provenance/zenodo-22651795.md into data/raw/zenodo-22651795/ and run "
              f"`python -I ml/prepare.py --config {args.config}`. {_NOTHING_WRITTEN}", file=sys.stderr)
        return 2
    missing = [m for m in ("numpy", "pandas", "sklearn", "joblib", "pyarrow") if importlib.util.find_spec(m) is None]
    if missing:
        print(f"Training unavailable: missing ML packages {missing}. They are not in the app lock; use a separate "
              f"environment: `python -m pip install -r ml/requirements.txt`. {_NOTHING_WRITTEN}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__" and preflight(sys.argv[1:]):
    raise SystemExit(2)

import joblib  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import sklearn  # noqa: E402
from sklearn.ensemble import HistGradientBoostingRegressor  # noqa: E402
from sklearn.inspection import permutation_importance  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.common import (  # noqa: E402
    FEATURE_LABELS, FEATURES, LEAKAGE_COLUMNS, SCOPE, TARGET, TARGET_UNIT, WARNING_CODES, WARNING_NAMES,
    build_features, county_stats, load_config, metrics, p,
)
from ml.evaluate import detailed_report, drift_by_county_year, fit_baselines, predict_baselines, predict_model  # noqa: E402


def log(msg):
    print(f"[train {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def geo_mask(df: pd.DataFrame, geo: str) -> pd.Series:
    return {"gulf_coast": df.is_gulf_coast, "texas": df.is_texas}.get(geo, pd.Series(True, index=df.index))


def subsample_events(df: pd.DataFrame, max_rows: int, seed: int) -> pd.DataFrame:
    """Keep whole events (never split an event's hours) until ~max_rows. Houston rows always kept."""
    if len(df) <= max_rows:
        return df
    keys = df.loc[~df.is_houston, "event_key"].unique()
    rng = np.random.default_rng(seed)
    frac = (max_rows - df.is_houston.sum()) / (~df.is_houston).sum()
    keep = set(keys[rng.random(len(keys)) < frac])
    return df[df.is_houston | df.event_key.isin(keep)]


def fit(tr: pd.DataFrame, params: dict, seed: int, loss="absolute_error", quantile=None):
    stats = county_stats(tr)
    wfo = sorted(tr.WFO.dropna().astype(str).unique())
    X = build_features(tr, stats, wfo)
    kw = dict(quantile=quantile) if loss == "quantile" else {}
    m = HistGradientBoostingRegressor(loss=loss, categorical_features="from_dtype", early_stopping=False,
                                      random_state=seed, **kw, **params)
    m.fit(X, np.log1p(tr[TARGET].to_numpy()))
    return m, stats, wfo


def score(m, stats, wfo, df):
    pred = np.clip(np.expm1(m.predict(build_features(df, stats, wfo))), 0, None)
    return metrics(df[TARGET], pred)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(cfg_path: str):
    t_start = time.time()
    cfg = load_config(cfg_path)
    seed = cfg["seed"]
    tc = cfg["train"]
    rows = pd.read_parquet(p(cfg["data"]["processed_rows"]))
    rows = rows[rows.split != "embargo"]
    train, val = rows[rows.split == "train"], rows[rows.split == "val"]
    val_h = val[val.is_houston]
    log(f"rows: train {len(train):,}  val {len(val):,} (Houston {len(val_h):,})")

    # 1. training geography ------------------------------------------------------------
    geo_results = {}
    for geo in tc["geographies"]:
        tr = subsample_events(train[geo_mask(train, geo)], tc["conus_max_rows"], seed)
        t0 = time.time()
        m, stats, wfo = fit(tr, tc["base_params"], seed)
        geo_results[geo] = dict(n_train_rows=len(tr), fit_seconds=round(time.time() - t0, 1),
                                val_houston=score(m, stats, wfo, val_h))
        log(f"geography {geo:10s} n={len(tr):>9,}  val MAE(log1p) {geo_results[geo]['val_houston']['mae_log1p']:.4f}"
            f"  MAE {geo_results[geo]['val_houston']['mae']:.1f}  ({geo_results[geo]['fit_seconds']}s)")
    best_geo = min(geo_results, key=lambda g: geo_results[g]["val_houston"]["mae_log1p"])
    log(f"-> training geography: {best_geo}")

    # 2. hyper-parameters ----------------------------------------------------------------
    tr = subsample_events(train[geo_mask(train, best_geo)], tc["conus_max_rows"], seed)
    grid_results = []
    keys = list(tc["grid"])
    for combo in itertools.product(*[tc["grid"][k] for k in keys]):
        params = {**tc["base_params"], **dict(zip(keys, combo))}
        m, stats, wfo = fit(tr, params, seed)
        r = score(m, stats, wfo, val_h)
        grid_results.append(dict(params={k: params[k] for k in keys}, val_houston=r))
        log(f"  {dict(zip(keys, combo))}  val MAE(log1p) {r['mae_log1p']:.4f}  MAE {r['mae']:.1f}")
    best = min(grid_results, key=lambda d: d["val_houston"]["mae_log1p"])
    best_params = {**tc["base_params"], **best["params"]}
    log(f"-> params {best['params']}")

    # 3. refit on train + val ----------------------------------------------------------
    trv = rows[rows.split.isin(["train", "val"])]
    trv = subsample_events(trv[geo_mask(trv, best_geo)], int(tc["conus_max_rows"] * 1.25), seed)
    t0 = time.time()
    m_med, stats, wfo = fit(trv, best_params, seed)
    q_lo, q_hi = tc["interval_quantiles"]
    m_lo, _, _ = fit(trv, best_params, seed, loss="quantile", quantile=q_lo)
    m_hi, _, _ = fit(trv, best_params, seed, loss="quantile", quantile=q_hi)
    fit_s = time.time() - t0
    log(f"final fit on {len(trv):,} rows (2015-2020, {best_geo}) in {fit_s:.1f}s")

    hou_trv = trv[trv.is_houston]
    houston = cfg["regions"]["houston"]
    cs = pd.read_parquet(p(cfg["data"]["processed_counties"]))
    default_wfo = hou_trv.groupby("fips_code").WFO.agg(lambda s: s.mode().iat[0]).to_dict()
    art = dict(
        version=cfg["version"],
        models={"median": m_med, "q10": m_lo, "q90": m_hi},
        features=FEATURES,
        wfo_categories=wfo,
        county_stats=stats,
        county_static=cs.loc[houston],
        county_default_wfo=default_wfo,
        supported_counties=houston,
        warning_codes=WARNING_CODES,
        seen_warning_keys=sorted(hou_trv.warning_key.unique()),
        baselines=fit_baselines(hou_trv),
        trained_geography=best_geo,
        params=best_params,
        interval_quantiles=[q_lo, q_hi],
    )
    model_path = p(cfg["artifacts"]["model"])
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(art, model_path, compress=3)
    digest = sha256(model_path)

    # 4. held-out evaluation -------------------------------------------------------------
    log("evaluating on held-out 2021-2022 Houston-region events ...")
    rep_test = detailed_report(art, rows, "test")
    tx_test = rows[(rows.split == "test") & rows.is_texas & ~rows.is_houston]
    tx_pred = np.clip(np.expm1(m_med.predict(build_features(tx_test, stats, wfo))), 0, None)
    texas_context = metrics(tx_test[TARGET], tx_pred)

    log("rolling-origin check: train on events before 2022, test Houston 2022 ...")
    t22 = pd.Timestamp("2022-01-01", tz="UTC")
    emb = pd.Timedelta(hours=cfg["split"]["embargo_hours"])
    tr22 = rows[(rows.event_start < t22 - emb)]
    tr22 = subsample_events(tr22[geo_mask(tr22, best_geo)], int(tc["conus_max_rows"] * 1.25), seed)
    te22 = rows[(rows.event_start >= t22) & rows.is_houston]
    m22, s22, w22 = fit(tr22, best_params, seed)
    p22 = np.clip(np.expm1(m22.predict(build_features(te22, s22, w22))), 0, None)
    rolling = dict(train_events="start < 2022 (2015-2021)", test="Houston events starting 2022", rows=len(te22),
                   model=metrics(te22[TARGET], p22),
                   model_trained_2015_2020=metrics(te22[TARGET], predict_model(art, te22)),
                   **{k: metrics(te22[TARGET], v) for k, v in
                      predict_baselines(fit_baselines(tr22[tr22.is_houston]), te22).items()})
    drift = drift_by_county_year(rows)

    th = rows[(rows.split == "test") & rows.is_houston]
    samp = th.sample(min(6000, len(th)), random_state=seed)
    pi = permutation_importance(m_med, build_features(samp, stats, wfo), np.log1p(samp[TARGET]),
                                scoring="neg_mean_absolute_error", n_repeats=3, random_state=seed)
    imp = sorted(
        [dict(feature=f, label=FEATURE_LABELS[f], mae_log1p_increase=round(float(v), 4))
         for f, v in zip(FEATURES, pi.importances_mean)],
        key=lambda d: -d["mae_log1p_increase"],
    )

    split_counts = {
        s: dict(rows=int((rows.split == s).sum()), events=int(rows[rows.split == s].event_key.nunique()),
                houston_rows=int(((rows.split == s) & rows.is_houston).sum()),
                houston_events=int(rows[(rows.split == s) & rows.is_houston].event_key.nunique()),
                period=[str(rows[rows.split == s].Hour.min()), str(rows[rows.split == s].Hour.max())])
        for s in ["train", "val", "test"]
    }
    hm = rep_test["houston"]
    beats = {b: hm["model"]["mae_log1p"] < hm[b]["mae_log1p"] for b in hm if b != "model"}
    src = cfg["data"]["source"]
    metadata = dict(
        modelVersion=cfg["version"],
        createdUtc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        dataMode="trained_conditional",
        modelScope="conditional_selected_event",
        scope=SCOPE,
        artifact=dict(path=cfg["artifacts"]["model"], sha256=digest, bytes=model_path.stat().st_size),
        algorithm="scikit-learn HistGradientBoostingRegressor (absolute-error loss on log1p target = conditional "
                  "median); quantile-loss models for the 10th/90th percentile interval",
        dataSource=dict(**src, file=Path(cfg["data"]["raw_csv"]).name,
                        observedPeriod=[split_counts["train"]["period"][0], split_counts["test"]["period"][1]],
                        note="File name says 2024 but the released records end 2023-01-03."),
        target=dict(name=TARGET, unit=TARGET_UNIT, transform="log1p for fitting; expm1 and clamp >= 0 on output",
                    population="county-hours with a positive processed outage metric AND >= 1 matched NWS VTEC "
                               "warning (dataset selection)"),
        featureOrder=FEATURES,
        featureLabels=FEATURE_LABELS,
        excludedColumns=LEAKAGE_COLUMNS,
        split=dict(policy="whole outage events assigned by event start time (UTC); events starting within "
                          f"{cfg['split']['embargo_hours']} h before a boundary dropped",
                   boundaries=dict(train_end=cfg["split"]["train_end"], val_end=cfg["split"]["val_end"]),
                   counts=split_counts),
        selection=dict(geography_candidates=geo_results, chosen_geography=best_geo,
                       grid=grid_results, chosen_params=best_params, criterion="Houston validation MAE on log1p"),
        finalTraining=dict(rows=len(trv), period="2015-2020 events", geography=best_geo,
                           fit_seconds=round(fit_s, 1)),
        metrics=dict(
            test_houston=hm,
            test_houston_excluding_largest_episode=rep_test["houston_excluding_largest_episode"],
            test_houston_full_source_records=rep_test["houston_full_source_records"],
            test_texas_outside_houston_model_only=texas_context,
            model_beats_baseline_on_mae_log1p=beats,
            model_beats_best_baseline_on_mae=hm["model"]["mae"] < min(hm[b]["mae"] for b in hm if b != "model"),
            rolling_origin_2022=rolling,
        ),
        dataDrift=drift,
        permutationImportance=imp,
        supportedGeography=[dict(countyFips=f, county=str(cs.loc[f, "county_name"]), defaultWFO=default_wfo.get(f))
                            for f in houston],
        supportedWarningTypes=[dict(code=c, name=WARNING_NAMES[c]) for c in WARNING_CODES],
        supportedPerturbations={"month": [1, 12], "local_hour": [0, 23]},
        inferenceAssumptions=[
            "source_completeness_pct is set to 100 (estimate under full source-record availability)",
            "WFO is the county's most frequent forecast office in training",
            "solar hour is derived from event time and county centroid longitude",
        ],
        limitations=[
            "Conditional on the archive's selection: only hours that already had a positive outage AND a matched "
            "warning. It does not predict whether an outage happens, nor its probability.",
            "Warning attribution is spatiotemporal co-occurrence (event start-to-peak window), not causation.",
            "EAGLE-I coverage is heterogeneous and grows over time; missing source records were zero-filled by "
            "the dataset authors, biasing low-availability hours downward.",
            "Tree ensembles cannot extrapolate beyond magnitudes seen in training; record events (Winter Storm Uri) "
            "are underestimated by orders of magnitude.",
            "Reporting-regime drift: median outage levels in 12 of 13 Houston counties jump 5-40x in 2021 (Harris "
            "in 2018) while source availability rises above 90%. The step change is consistent with a change in "
            "utility reporting coverage rather than weather; models trained on earlier years underestimate 2021+ "
            "levels. On absolute customer error the model is roughly tied with a per-county median lookup; its "
            "advantage is in relative (log-scale) error.",
            "County-level aggregate; says nothing about individual feeders, substations or buildings.",
            "Not a weather forecast and not for operational dispatch.",
        ],
        seed=seed,
        environment=dict(python=platform.python_version(), sklearn=sklearn.__version__, pandas=pd.__version__),
        trainRuntimeSeconds=round(time.time() - t_start, 1),
    )
    Path(p(cfg["artifacts"]["metadata"])).write_text(json.dumps(metadata, indent=1, default=str))
    Path(p(cfg["artifacts"]["metrics"])).write_text(json.dumps(dict(test=rep_test, selection=metadata["selection"],
                                                                     texas_context=texas_context), indent=1,
                                                                default=str))
    write_report(p(cfg["artifacts"]["report"]), metadata, rep_test, rolling, drift)

    log(f"artifact {model_path.name} sha256 {digest[:12]}…  total {metadata['trainRuntimeSeconds']}s")
    show = ["model", "county_x_warning_median", "county_median", "warning_type_median", "global_median"]
    for k in show:
        r = hm[k]
        log(f"  TEST Houston {k:24s} MAE {r['mae']:>9.1f}  MedAE {r['median_ae']:>7.1f}  P90AE {r['p90_ae']:>8.1f}"
            f"  MAE(log1p) {r['mae_log1p']:.3f}  within x2 {r['within_factor_2']:.3f}")
    ex = rep_test["houston_excluding_largest_episode"]
    log(f"  excluding {ex['excluded_episode']}: model MAE {ex['model']['mae']:.1f} vs county x warning "
        f"{ex['county_x_warning_median']['mae']:.1f}; interval coverage {hm['model'].get('interval_coverage')}")


def write_report(path: Path, md: dict, rep: dict, rolling: dict, drift: dict):
    hm = rep["houston"]
    L = [f"# Outage-severity model evaluation ({md['modelVersion']})", "",
         f"Created {md['createdUtc']}. Artifact sha256 `{md['artifact']['sha256'][:16]}…`.", "",
         "**What it estimates:** " + md["target"]["unit"] + ", for " + md["target"]["population"] + ".", "",
         f"**Training:** {md['finalTraining']['rows']:,} rows, {md['finalTraining']['period']}, geography "
         f"`{md['finalTraining']['geography']}`. **Test:** Houston-region (13 counties) events starting 2021-01-01 "
         "or later, never used for selection.", "",
         "## Held-out test, Houston region", "",
         "| Predictor | MAE (customers) | Median AE | P90 AE | MAE log1p | within ×2 |",
         "|---|---:|---:|---:|---:|---:|"]
    for k in ["model", "county_x_warning_median", "county_median", "warning_type_median", "global_median"]:
        r = hm[k]
        L.append(f"| {k} | {r['mae']:,.1f} | {r['median_ae']:,.1f} | {r['p90_ae']:,.1f} | {r['mae_log1p']:.3f} | "
                 f"{r['within_factor_2']:.3f} |")
    L += ["", f"80% interval coverage (10th-90th pct models): {hm['model'].get('interval_coverage')}", ""]
    ex = rep["houston_excluding_largest_episode"]
    L += [f"Excluding the largest episode (`{ex['excluded_episode']}`): model MAE {ex['model']['mae']:,.1f} "
          f"vs county×warning baseline {ex['county_x_warning_median']['mae']:,.1f}.", "",
          "## Largest held-out storm episodes", "",
          "| Episode | Warnings | Observed peak | Model at that hour | 10-90% interval |", "|---|---|---:|---:|---|"]
    for e in rep["top_episodes"]:
        L.append(f"| {e['episode']} | {e['warnings']} | {e['observed_peak']:,.0f} | {e['predicted_at_peak_hour']:,.0f} |"
                 f" {e['interval_at_peak_hour'][0]:,.0f}-{e['interval_at_peak_hour'][1]:,.0f} |")
    L += ["", "## Worst errors (one per episode)", ""]
    for f in rep["failure_cases"]:
        L.append(f"- {f['hour']} {f['county']} [{f['warnings']}]: observed {f['observed']:,.0f}, "
                 f"predicted {f['predicted']:,.0f} (interval {f['interval'][0]:,.0f}-{f['interval'][1]:,.0f})")
    L += ["", "## Extra forward test: train through 2021, test 2022 (Houston)", "",
          "| Predictor | MAE | Median AE | MAE log1p | within ×2 |", "|---|---:|---:|---:|---:|"]
    for k in ["model", "model_trained_2015_2020", "county_median", "county_x_warning_median", "warning_type_median",
              "global_median"]:
        r = rolling[k]
        L.append(f"| {k} | {r['mae']:,.1f} | {r['median_ae']:,.1f} | {r['mae_log1p']:.3f} | {r['within_factor_2']:.3f} |")
    yrs = sorted(drift["mean_source_availability_by_year"])
    L += ["", "## Data drift: median customers out per county-hour, by year", "",
          "| County | " + " | ".join(str(y) for y in yrs) + " |", "|---|" + "---:|" * len(yrs)]
    for c, r in drift["median_customers_by_county_year"].items():
        L.append(f"| {c} | " + " | ".join("" if r.get(y) is None else f"{r[y]:,.0f}" for y in yrs) + " |")
    L.append("| *mean source availability %* | " + " | ".join(
        f"{drift['mean_source_availability_by_year'][y]:.0f}" for y in yrs) + " |")
    L += ["", "## Limitations", ""] + [f"- {x}" for x in md["limitations"]]
    path.write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(p("ml/config.yaml")))
    main(ap.parse_args().config)
