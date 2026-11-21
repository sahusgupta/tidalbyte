"""Ensure bootstrap commands cannot silently manufacture a trained model."""

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
TRAIN = ROOT / "ml" / "train.py"


def run_training(config: Path, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(TRAIN), "--config", str(config)],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )


def test_missing_verified_data_fails_without_writing_artifacts(tmp_path):
    result = run_training(ROOT / "ml" / "config.yaml", tmp_path)

    assert result.returncode == 2
    assert "no verified training dataset and provenance" in result.stderr
    assert "OFFLINE EXAMPLE" in result.stderr
    assert list(tmp_path.iterdir()) == []


def test_populated_config_cannot_bypass_missing_pipeline(tmp_path):
    config = tmp_path / "config.yaml"
    config.write_text(
        json.dumps({"dataset_path": "data.csv", "provenance_path": "source.json"}),
        encoding="utf-8",
    )
    before = set(tmp_path.iterdir())

    result = run_training(config, tmp_path)

    assert result.returncode == 2
    assert "no training implementation" in result.stderr
    assert set(tmp_path.iterdir()) == before


def test_invalid_config_is_actionable_and_writes_nothing(tmp_path):
    config = tmp_path / "config.yaml"
    config.write_text("not valid JSON", encoding="utf-8")

    result = run_training(config, tmp_path)

    assert result.returncode == 2
    assert "cannot read JSON-compatible YAML config" in result.stderr
    assert set(tmp_path.iterdir()) == {config}


def test_bootstrap_configuration_discloses_untrained_state():
    config = json.loads((ROOT / "ml" / "config.yaml").read_text(encoding="utf-8"))

    assert config["status"] == "not_trained"
    assert config["data_mode"] == "offline_example"
    assert config["dataset_path"] is None
    assert config["provenance_path"] is None
    assert config["target"] is None
    assert config["features"] == []
