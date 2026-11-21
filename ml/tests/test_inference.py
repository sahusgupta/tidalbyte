import pytest

for _mod in ("numpy", "pandas", "sklearn", "pyarrow"):
    pytest.importorskip(_mod)  # ML environment only (not in the app's requirements.lock)

import hashlib


from ml.common import FEATURES, p
from ml.inference import UnsupportedInput

HOU = ["48201", "48157", "48167"]


def test_metadata_matches_artifact(model, cfg):
    digest = hashlib.sha256(p(cfg["artifacts"]["model"]).read_bytes()).hexdigest()
    assert model.metadata["artifact"]["sha256"] == digest
    assert model.metadata["featureOrder"] == FEATURES == model.art["features"]
    assert model.metadata["dataMode"] == "trained_conditional"


def test_predict_contract_fields(model):
    res = model.predict(HOU, ["SV", "TO"], "2022-05-01T20:00:00Z")
    assert [r["countyFips"] for r in res] == HOU
    for r in res:
        for k in ["predictedSeverity", "severityUnit", "modelVersion", "dataMode", "scope", "baselineSeverity",
                  "notes", "sourceIds"]:
            assert k in r
        assert 0 <= r["predictedLow"] <= r["predictedSeverity"] <= r["predictedHigh"]
        assert r["scope"] == "selected_positive_outage_warning_hours"
        assert r["modelMode"] == "historical_context"


@pytest.mark.parametrize("counties,warnings,pert,code", [
    (["06037"], ["SV"], None, "unsupported_county"),
    ([], ["SV"], None, "empty_selection"),
    (["48201"], [], None, "no_warning"),
    (["48201"], ["XX"], None, "unsupported_warning"),
    (["48201"], ["SV"], {"wind_speed": 40}, "unsupported_parameter"),
    (["48201"], ["SV"], {"month": 13}, "out_of_range"),
])
def test_rejects_unsupported_inputs(model, counties, warnings, pert, code):
    with pytest.raises(UnsupportedInput) as e:
        model.predict(counties, warnings, "2022-05-01T20:00:00Z", pert)
    assert e.value.code == code


def test_perturbation_is_labelled_exploratory(model):
    r = model.predict(["48201"], ["SV"], "2022-05-01T20:00:00Z", {"month": 8})[0]
    assert r["modelMode"] == "exploratory_what_if"
    assert r["notes"][0].startswith("Exploratory: not a real forecast")
