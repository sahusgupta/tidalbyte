import json
from pathlib import Path

import pytest
from earthlab_contracts.validation import validate_contract
from fastapi.testclient import TestClient

from app.main import create_app


def assert_envelope(response, *, status=200):
    assert response.status_code == status
    payload = response.json()
    validate_contract("Envelope", payload)
    assert set(payload) == {"data", "meta", "error"}
    assert payload["meta"]["mode"] == "offline_example"
    assert payload["meta"]["requestId"] == response.headers["x-request-id"]
    assert payload["meta"]["sourceIds"] == ["project:offline-fixture-v1"]
    assert any("OFFLINE EXAMPLE" in warning for warning in payload["meta"]["warnings"])
    if status >= 400:
        assert payload["data"] is None
        assert payload["error"]["code"]
        assert payload["error"]["message"]
    else:
        assert payload["error"] is None
    return payload


def test_liveness_and_offline_readiness(client):
    assert assert_envelope(client.get("/healthz"))["data"]["status"] == "ok"
    ready = assert_envelope(client.get("/readyz"))["data"]
    assert ready == {"status": "ready", "offlineFixture": True, "trainedModel": False}


def test_catalog_and_geo_are_explicitly_examples(client):
    regions = assert_envelope(client.get("/api/v1/catalog/regions"))["data"]
    assert regions[0]["dataMode"] == "offline_example"
    assert "schematic" in regions[0]["attribution"]
    events = assert_envelope(client.get("/api/v1/catalog/events"))["data"]
    assert events[0]["id"] == "example-warning-001"
    assert events[0]["dataMode"] == "offline_example"
    geo = assert_envelope(client.get("/api/v1/geo/counties"))
    assert geo["data"]["type"] == "FeatureCollection"
    assert len(geo["data"]["features"]) == 3
    assert any("not official county boundaries" in text for text in geo["meta"]["warnings"])


def test_model_metadata_does_not_claim_training(client):
    metadata = assert_envelope(client.get("/api/v1/models/current"))["data"]
    validate_contract("ModelMetadata", metadata)
    assert metadata["status"] == "not_trained"
    assert metadata["dataMode"] == "offline_example"
    assert metadata["evaluation"] is None
    assert metadata["featureSchema"] == []
    assert metadata["trainingDatasetIds"] == []


def test_evaluation_returns_selected_counties_and_preserves_request(client, scenario):
    scenario["id"] = "test-selection"
    scenario["scenarioVersion"] = 12
    scenario["selection"]["countyFips"] = ["48039", "48201"]
    result = assert_envelope(client.post("/api/v1/scenarios/evaluate", json=scenario))["data"]
    validate_contract("Evaluation", result)
    assert "perturbations" not in result["scenario"]
    assert all("baselineSeverity" not in prediction for prediction in result["predictions"])
    assert result["modelMetadata"]["evaluation"] is None
    assert result["scenario"]["id"] == "test-selection"
    assert result["scenario"]["scenarioVersion"] == 12
    assert [prediction["countyFips"] for prediction in result["predictions"]] == ["48039", "48201"]
    assert all(prediction["dataMode"] == "offline_example" for prediction in result["predictions"])
    assert all(prediction["severityUnit"] for prediction in result["predictions"])
    assert result["disclaimers"]
    # A filtered evaluation must not mutate the cached fixture for the next request.
    scenario["selection"]["countyFips"] = ["48157"]
    again = assert_envelope(client.post("/api/v1/scenarios/evaluate", json=scenario))["data"]
    validate_contract("Evaluation", again)
    assert [prediction["countyFips"] for prediction in again["predictions"]] == ["48157"]


@pytest.mark.parametrize("path", ["/api/v1/catalog/events", "/api/v1/geo/counties", "/api/v1/network"])
def test_unknown_region_is_404(client, path):
    response = assert_envelope(client.get(path, params={"regionId": "unknown"}), status=404)
    assert response["error"]["code"] == "unknown_region"


def test_unknown_event_is_404(client, scenario):
    scenario["presetEventId"] = "not-catalogued"
    response = assert_envelope(client.post("/api/v1/scenarios/evaluate", json=scenario), status=404)
    assert response["error"]["code"] == "unknown_event"


@pytest.mark.parametrize("counties", [[], ["48201", "48201"], ["99999"], ["not-fips"]])
def test_unsupported_counties_rejected(client, scenario, counties):
    scenario["selection"]["countyFips"] = counties
    assert_envelope(client.post("/api/v1/scenarios/evaluate", json=scenario), status=422)


@pytest.mark.parametrize(
    "change",
    [
        {"perturbations": {"windSpeed": 30}},
        {"modelMode": "exploratory_what_if"},
        {"scenarioVersion": "1"},
        {"scenarioVersion": True},
        {"scenarioVersion": 0},
        {"unrecognized": "value"},
    ],
)
def test_unsupported_features_and_contract_coercion_rejected(client, scenario, change):
    scenario.update(change)
    assert_envelope(client.post("/api/v1/scenarios/evaluate", json=scenario), status=422)


@pytest.mark.parametrize(
    "change",
    [
        {"warningTypes": ["tornado"]},
        {"warningTypes": []},
        {"eventTimeUtc": "2025-01-01T00:00:00Z"},
        {"eventTimeUtc": "2024-01-01T01:00:00+01:00"},
        {"eventTimeUtc": "2024-01-01T00:00:00"},
        {"eventTimeUtc": "not-a-timestamp"},
        {"unrecognized": "value"},
    ],
)
def test_out_of_preset_selections_rejected(client, scenario, change):
    scenario["selection"].update(change)
    assert_envelope(client.post("/api/v1/scenarios/evaluate", json=scenario), status=422)


def test_malformed_json_and_unknown_routes_are_enveloped(client):
    assert_envelope(client.post("/api/v1/scenarios/evaluate", content="{", headers={"content-type": "application/json"}), status=422)
    assert_envelope(client.get("/not-a-route"), status=404)


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/v1/voice/speak"),
    ],
)
def test_unavailable_workstreams_return_503_without_fake_results(client, method, path):
    assert_envelope(client.request(method, path), status=503)


def test_cors_is_an_allowlist(client):
    allowed = client.get("/healthz", headers={"Origin": "http://localhost:5173"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    denied = client.get("/healthz", headers={"Origin": "https://untrusted.example"})
    assert "access-control-allow-origin" not in denied.headers


def test_missing_fixture_fails_startup(tmp_path):
    with pytest.raises(FileNotFoundError), TestClient(create_app(fixture_dir=tmp_path)):
        pass


@pytest.mark.parametrize(
    "path,value",
    [
        (("predictions", 0, "dataMode"), "trained_conditional"),
        (("modelMetadata", "status"), "trained"),
        (("modelMetadata", "trainingDatasetIds"), ["invented-dataset"]),
    ],
)
def test_offline_fixture_cannot_claim_training(tmp_path, path, value):
    fixture_dir = Path(__file__).resolve().parents[3] / "data/fixtures"
    evaluation = json.loads((fixture_dir / "offline-evaluation.json").read_text(encoding="utf-8"))
    target = evaluation
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    (tmp_path / "offline-evaluation.json").write_text(json.dumps(evaluation), encoding="utf-8")
    (tmp_path / "houston-counties.geojson").write_text(
        (fixture_dir / "houston-counties.geojson").read_text(encoding="utf-8"), encoding="utf-8"
    )
    with pytest.raises(ValueError), TestClient(create_app(fixture_dir=tmp_path)):
        pass


def test_unexpected_failure_is_enveloped_without_exception_text():
    application = create_app()

    @application.get("/test-failure", include_in_schema=False)
    def fail():
        raise RuntimeError("private diagnostic")

    with TestClient(application, raise_server_exceptions=False) as test_client:
        response = test_client.get("/test-failure")
    payload = assert_envelope(response, status=500)
    assert "private diagnostic" not in str(payload)


def test_native_openapi_documents_request_and_envelope(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    assert spec["info"]["version"] == "1.1.0"
    operation = spec["paths"]["/api/v1/scenarios/evaluate"]["post"]
    assert "requestBody" in operation
    assert "422" in operation["responses"]
    for path, name in [
        ("/api/v1/network/compare", "NetworkCompareRequest"),
        ("/api/v1/ai/interpret", "InterpretRequest"),
        ("/api/v1/voice/speak", "VoiceSpeakRequest"),
    ]:
        body = spec["paths"][path]["post"]["requestBody"]
        assert body["content"]["application/json"]["schema"]["title"] == name
        assert "$ref" not in json.dumps(body)
    audio = spec["paths"]["/api/v1/voice/transcribe"]["post"]["requestBody"]
    assert audio["content"]["multipart/form-data"]["schema"]["properties"]["audio"]["format"] == "binary"
