import pytest
from earthlab_contracts.validation import validate_contract


REGION = "houston-gulf-coast"
COMPARE = "/api/v1/network/compare"


@pytest.fixture
def plan():
    return {
        "regionId": REGION,
        "disabledNodeIds": [],
        "disabledEdgeIds": ["north-link"],
        "interventions": [],
    }


def intervention(action, edges=(), nodes=()):
    return {
        "id": action,
        "action": action,
        "graphEdgeIds": list(edges),
        "graphNodeIds": list(nodes),
    }


def data(response):
    assert response.status_code == 200, response.text
    payload = response.json()
    validate_contract("Envelope", payload)
    assert payload["meta"]["mode"] == "offline_example"
    assert payload["meta"]["sourceIds"] == ["project:houston-illustrative-network-v1"]
    return payload["data"]


def test_fixture_is_sourced_and_geojson(client):
    fixture = data(client.get("/api/v1/network"))
    assert fixture["type"] == "FeatureCollection"
    assert fixture["license"] == "CC0-1.0"
    assert "fictional" in fixture["attribution"]
    assert len({feature["id"] for feature in fixture["features"]}) == len(fixture["features"])


def test_disconnect_and_edge_protection(client, plan):
    result = data(client.post(COMPARE, json=plan))
    validate_contract("PlanComparison", result)
    assert result["baseline"] == result["proposal"] == {
        "reachableFacilities": 1, "connectedComponents": 2, "weightedAccessScore": 3,
    }

    plan["interventions"] = [intervention("protect", ["north-link"])]
    result = data(client.post(COMPARE, json=plan))
    assert result["baseline"]["weightedAccessScore"] == 3
    assert result["proposal"] == {
        "reachableFacilities": 2, "connectedComponents": 1, "weightedAccessScore": 12,
    }


def test_inspection_and_disable(client, plan):
    plan["interventions"] = [
        intervention("inspect", ["north-link"]),
        intervention("disable", ["south-link"]),
    ]
    result = data(client.post(COMPARE, json=plan))
    assert result["baseline"]["reachableFacilities"] == 1
    assert result["proposal"]["reachableFacilities"] == 0
    assert result["proposal"]["connectedComponents"] == 3


def test_node_protection_restores_adjacent_edges(client, plan):
    plan["disabledNodeIds"] = ["junction"]
    plan["interventions"] = [intervention("protect", nodes=["junction"])]
    result = data(client.post(COMPARE, json=plan))
    assert result["baseline"]["reachableFacilities"] == 0
    assert result["proposal"]["reachableFacilities"] == 1


def test_preview_reports_changed_edges_and_weighted_paths(client, plan):
    plan["disabledEdgeIds"] = ["north-link", "main-link"]
    plan["interventions"] = [intervention("protect", ["north-link", "main-link"])]
    overlay = data(client.post("/api/v1/network/preview", json=plan))
    links = {feature["id"]: feature["properties"] for feature in overlay["features"]}
    assert not links["north-link"]["baselineActive"]
    assert links["north-link"]["proposalActive"]
    assert links["north-link"]["proposalBridge"]
    assert overlay["paths"]["baseline"]["shelter"] == {
        "edgeIds": ["bypass-west", "bypass-east", "south-link"], "travelCost": 9,
    }
    assert overlay["paths"]["proposal"]["clinic"] == {
        "edgeIds": ["main-link", "north-link"], "travelCost": 5,
    }


@pytest.mark.parametrize("interventions", [
    [intervention("protect", ["missing"])],
    [intervention("protect", ["clinic"])],
    [intervention("protect")],
    [intervention("protect", ["main-link", "north-link"], ["clinic", "shelter"])],
    [intervention("protect", ["north-link"]), intervention("disable", ["north-link"])],
])
def test_invalid_assets_and_conflicts(client, plan, interventions):
    plan["interventions"] = interventions
    assert client.post(COMPARE, json=plan).status_code == 422


def test_invalid_json_and_missing_graph_dependency(client, plan, monkeypatch):
    assert client.post(COMPARE, content="{").status_code == 422

    def missing():
        raise ModuleNotFoundError(name="networkx")

    monkeypatch.setattr("app.routes.network.load_network", missing)
    assert client.post(COMPARE, json=plan).status_code == 503


def test_two_agency_game_reports_nash_equilibria_and_coordination(client):
    game = data(client.get("/api/v1/network/strategy"))
    table = {tuple(row["actions"]): row["payoffs"] for row in game["payoffTable"]}
    assert len(table) == 9
    assert table["north-link", "north-link"] == [2.5, 1.5]
    assert table["north-link", "south-link"] == [3.5, 3.5]
    assert [row["actions"] for row in game["independentEquilibria"]] == [
        ["pass", "north-link"], ["north-link", "pass"],
    ]
    assert all(row["totalPayoff"] == 6.5 for row in game["independentEquilibria"])
    assert [row["actions"] for row in game["coordinatedOptima"]] == [
        ["north-link", "south-link"], ["south-link", "north-link"],
    ]
    assert all(row["totalPayoff"] == 7 for row in game["coordinatedOptima"])


def test_disabled_staging_and_sequential_requests_are_isolated(client, plan):
    plan["disabledNodeIds"] = ["staging"]
    assert data(client.post(COMPARE, json=plan))["baseline"]["reachableFacilities"] == 0
    plan["disabledNodeIds"] = []
    plan["disabledEdgeIds"] = []
    assert data(client.post(COMPARE, json=plan))["baseline"]["reachableFacilities"] == 2
