"""Training must fail closed: no readable config, prepared data or ML packages -> exit 2, nothing written.

Replaces the bootstrap guard (which refused all training) now that a real pipeline exists. Runs with
the standard library + PyYAML only, so it also runs in the app's CI environment.
"""
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
TRAIN = ROOT / "ml" / "train.py"
ARTIFACTS = ROOT / "ml" / "artifacts"


def run_training(config: Path, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(TRAIN), "--config", str(config)], cwd=cwd,
                          capture_output=True, text=True, check=False)


def _snapshot():
    return {p.name: p.stat().st_mtime_ns for p in ARTIFACTS.iterdir()} if ARTIFACTS.exists() else {}


def test_missing_prepared_data_fails_without_writing_artifacts(tmp_path):
    cfg = yaml.safe_load((ROOT / "ml" / "config.yaml").read_text(encoding="utf-8"))
    cfg["data"]["processed_rows"] = str(tmp_path / "does-not-exist.parquet")
    config = tmp_path / "config.yaml"
    config.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    before, before_tmp = _snapshot(), set(tmp_path.iterdir())

    result = run_training(config, tmp_path)

    assert result.returncode == 2
    assert "prepared dataset not found" in result.stderr
    assert "No model artifact or metrics were written" in result.stderr
    assert _snapshot() == before and set(tmp_path.iterdir()) == before_tmp


def test_invalid_config_is_actionable_and_writes_nothing(tmp_path):
    config = tmp_path / "config.yaml"
    config.write_text("data: [unclosed", encoding="utf-8")
    before = _snapshot()

    result = run_training(config, tmp_path)

    assert result.returncode == 2
    assert "cannot read config" in result.stderr
    assert _snapshot() == before and set(tmp_path.iterdir()) == {config}


def test_config_declares_verified_source_target_and_event_holdout():
    cfg = yaml.safe_load((ROOT / "ml" / "config.yaml").read_text(encoding="utf-8"))
    src = cfg["data"]["source"]
    assert src["doi"] == "10.5281/zenodo.22651795" and src["license"] == "CC-BY-4.0" and len(src["md5"]) == 32
    assert (ROOT / "data" / "provenance" / "zenodo-22651795.md").exists()
    assert set(cfg["split"]) >= {"train_end", "val_end", "embargo_hours"}
    assert cfg["data"]["raw_csv"].startswith("data/raw/")  # raw data stays in the ignored directory
