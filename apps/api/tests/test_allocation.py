import json
from copy import deepcopy
from fractions import Fraction
from itertools import product
from pathlib import Path
from time import perf_counter

import pytest
from earthlab_contracts.validation import validate_contract

from app.services.allocation import AllocationEngine, Portfolio, Profile, demo_request
from app.services.network import load_network

COMPARE = "/api/v1/allocation/plans/compare"
EVALUATE = "/api/v1/allocation/scenarios/evaluate"
FIXTURES = Path(__file__).resolve().parents[3] / "data/fixtures/allocation"


@pytest.fixture
def allocation_request():
    return demo_request()


def payload(response, contract="AllocationResult"):
    assert response.status_code == 200, response.text
    result = response.json()
    validate_contract("Envelope", result)
    validate_contract(contract, result["data"])
    assert result["meta"]["mode"] == "offline_example"
    assert set(result["meta"]["sourceIds"]) == {
        "project:houston-illustrative-network-v1",
        "project:houston-allocation-assumptions-v1",
    }
    return result["data"]


def check_resources(request, result):
    candidates = {
        candidate["actionId"]: candidate for candidate in result["candidates"]
    }
    for strategy in result["strategies"]:
        actions = [candidates[item["actionId"]] for item in strategy["interventions"]]
        assert len({action["assetId"] for action in actions}) == len(
            actions
        ), "No double funding"
        for agency in ("health", "shelter"):
            own = [action for action in actions if action["agency"] == agency]
            assert (
                strategy["spend"][agency]
                == sum(action["cost"] for action in own)
                <= request["agencies"][agency]["budget"]
            )
            assert (
                sum(action["crews"] for action in own)
                <= request["agencies"][agency]["crewCapacity"]
            )
        assert sum(strategy["spend"].values()) <= request["totalBudget"]
        assert (
            strategy["crewsUsed"]
            == sum(action["crews"] for action in actions)
            <= request["crewCapacity"]
        )
        assert (
            strategy["equipmentUsed"]
            == sum(action["equipment"] for action in actions)
            <= request["equipmentCapacity"]
        )
        assert (
            strategy["completionHours"]
            == max((action["hours"] for action in actions), default=0)
            <= request["horizonHours"]
        )
        assert 0 <= strategy["weightedAccess"] <= 1


def test_demo_and_evaluation_routes_use_shared_graph(client, allocation_request):
    demo = payload(client.get("/api/v1/allocation/demo"), "AllocationRequest")
    assert demo == allocation_request
    result = payload(client.post(EVALUATE, json=demo), "AllocationEvaluation")
    assert len(result["candidates"]) == 10
    assert len({item["actionId"] for item in result["candidates"]}) == 10
    assert {item["assetId"] for item in result["candidates"]} == set(
        load_network().edges
    )
    assert "strategies" not in result and "payoffMatrix" not in result
    assert result["dataMode"] == "illustrative"


@pytest.mark.parametrize("phase", ["response", "mitigation"])
def test_reproducible_offline_fixtures_match_actual_api(client, phase):
    request = json.loads((FIXTURES / f"{phase}-request.json").read_text())
    expected = json.loads((FIXTURES / f"{phase}-result.json").read_text())
    first = payload(client.post(COMPARE, json=request))
    second = payload(client.post(COMPARE, json=request))
    assert first == second == expected
    assert payload(client.post(EVALUATE, json=request), "AllocationEvaluation") == {
        key: value
        for key, value in first.items()
        if key not in {"strategies", "payoffMatrix", "equilibriumVerified", "agreement"}
    }
    check_resources(request, first)
    independent, coordinated, bargaining = first["strategies"]
    assert independent["id"] == "independent" and not independent["interventions"]
    assert first["equilibriumVerified"] is True and first["agreement"] is True
    assert coordinated["jointUtility"] > independent["jointUtility"]
    assert bargaining["gains"]["health"] > 0 and bargaining["gains"]["shelter"] > 0
    assert coordinated["interventions"] != bargaining["interventions"]
    assert all(row["feasible"] for row in first["payoffMatrix"])
    for strategy in first["strategies"]:
        row = next(
            row
            for row in first["payoffMatrix"]
            if row["healthActions"]
            == [
                a["actionId"]
                for a in strategy["interventions"]
                if a["agency"] == "health"
            ]
            and row["shelterActions"]
            == [
                a["actionId"]
                for a in strategy["interventions"]
                if a["agency"] == "shelter"
            ]
        )
        assert row["utilities"] == strategy["utilities"]


def test_graph_costs_and_partial_restoration_are_computed(allocation_request):
    request = {
        **allocation_request,
        "phase": "response",
        "blockedEdgeIds": ["north-link"],
        "impairedEdgeIds": [],
    }
    engine = AllocationEngine(load_network(), request)
    north = 1 << engine.edges.index("north-link")
    assert engine.access(0) == (0, 1)
    assert engine.access(north) == (1, 1)
    request["effectPercent"] = 50
    assert AllocationEngine(load_network(), request).access(north) == (
        Fraction(5, 8),
        1,
    )
    request["effectPercent"] = 0
    assert AllocationEngine(load_network(), request).access(north) == (0, 1)
    request.update(blockedEdgeIds=[], impairedEdgeIds=["north-link"])
    assert AllocationEngine(load_network(), request).access(0) == (Fraction(5, 11), 1)


def test_footprint_only_changes_exposure_not_road_status_or_utility(allocation_request):
    request = {
        **allocation_request,
        "blockedEdgeIds": [],
        "impairedEdgeIds": [],
        "footprint": None,
    }
    before = AllocationEngine(load_network(), request).solve()
    request["footprint"] = {"longitude": -95.38, "latitude": 29.76, "radiusKm": 15}
    after = AllocationEngine(load_network(), request).solve()
    assert all(not action["exposed"] for action in before["candidates"])
    assert any(action["exposed"] for action in after["candidates"])
    assert all(action["status"] == "available" for action in after["candidates"])
    assert (
        before["baselineAccess"]
        == after["baselineAccess"]
        == {"clinic": 1, "shelter": 1}
    )
    assert before["strategies"] == after["strategies"]
    assert not after["agreement"]


@pytest.mark.parametrize(
    "limit,value",
    [
        ("totalBudget", 0),
        ("crewCapacity", 0),
        ("equipmentCapacity", 0),
        ("horizonHours", 1),
        ("effectPercent", 0),
    ],
)
def test_zero_or_insufficient_capacity_returns_honest_no_agreement(
    allocation_request, limit, value
):
    allocation_request[limit] = value
    result = AllocationEngine(load_network(), allocation_request).solve()
    check_resources(allocation_request, result)
    assert not result["agreement"]
    assert all(not strategy["interventions"] for strategy in result["strategies"])
    assert result["strategies"][2]["utilities"] == result["strategies"][0]["utilities"]
    assert "No mutually beneficial agreement" in result["strategies"][2]["explanation"]


def test_each_agency_obeys_its_own_capacity_and_budget(allocation_request):
    request = deepcopy(allocation_request)
    request.update(phase="response", blockedEdgeIds=["south-link"])
    request["agencies"]["health"].update(budget=0, crewCapacity=0)
    result = AllocationEngine(load_network(), request).solve()
    check_resources(request, result)
    assert any(strategy["interventions"] for strategy in result["strategies"])
    assert all(
        intervention["agency"] == "shelter"
        for strategy in result["strategies"]
        for intervention in strategy["interventions"]
    )


@pytest.mark.parametrize(
    "phase,weight,effect", product(("mitigation", "response"), (1, 5, 9), (50, 100))
)
def test_exact_optimality_equilibrium_and_individual_rationality(
    allocation_request, phase, weight, effect
):
    request = deepcopy(allocation_request)
    request.update(phase=phase, bargainingWeight=weight, effectPercent=effect)
    engine = AllocationEngine(load_network(), request)
    profiles = engine.profiles()
    assert all(profile.health.mask & profile.shelter.mask == 0 for profile in profiles)
    result = engine.solve()
    check_resources(request, result)
    independent, coordinated, bargaining = result["strategies"]
    d_health, d_shelter = independent["utilities"].values()
    assert coordinated["jointUtility"] == pytest.approx(
        float(max(sum(profile.utilities) for profile in profiles))
    )
    h_mask = sum(
        1 << engine.edges.index(item["assetId"])
        for item in independent["interventions"]
        if item["agency"] == "health"
    )
    s_mask = sum(
        1 << engine.edges.index(item["assetId"])
        for item in independent["interventions"]
        if item["agency"] == "shelter"
    )
    if result["equilibriumVerified"]:
        assert all(
            float(p.utilities[0]) <= d_health + 1e-9
            for p in profiles
            if p.shelter.mask == s_mask
        )
        assert all(
            float(p.utilities[1]) <= d_shelter + 1e-9
            for p in profiles
            if p.health.mask == h_mask
        )
    gains = [
        (float(p.utilities[0]) - d_health, float(p.utilities[1]) - d_shelter)
        for p in profiles
    ]
    products = [
        a ** (weight / 10) * b ** (1 - weight / 10)
        for a, b in gains
        if a > 1e-9 and b > 1e-9
    ]
    assert bargaining["utilities"]["health"] >= d_health - 1e-9
    assert bargaining["utilities"]["shelter"] >= d_shelter - 1e-9
    assert bargaining["nashProduct"] == pytest.approx(
        max(products, default=0), abs=1e-8
    )
    assert result["agreement"] == bool(products)


def test_bargaining_weight_is_a_real_sensitivity_control(allocation_request):
    request = {**allocation_request, "phase": "response", "bargainingWeight": 1}
    low = AllocationEngine(load_network(), request).solve()["strategies"][2]
    request["bargainingWeight"] = 9
    high = AllocationEngine(load_network(), request).solve()["strategies"][2]
    assert high["utilities"]["health"] > low["utilities"]["health"]
    assert high["utilities"]["shelter"] < low["utilities"]["shelter"]


def test_no_equilibrium_is_not_labeled_verified():
    empty = Portfolio(0, (), 0, 0, 0, 0)
    health = Portfolio(1, (0,), 1, 1, 1, 1)
    shelter = Portfolio(2, (1,), 1, 1, 1, 1)
    # Matching pennies is a finite counterexample with no pure equilibrium.
    profiles = [
        Profile(empty, empty, (0, 0), (1, 0)),
        Profile(health, empty, (0, 0), (0, 1)),
        Profile(empty, shelter, (0, 0), (0, 1)),
        Profile(health, shelter, (0, 0), (1, 0)),
    ]
    _, verified, regret = AllocationEngine.independent(profiles)
    assert not verified and regret == 1


def test_json_integral_numbers_are_supported_without_internal_error(
    client, allocation_request
):
    allocation_request["effectPercent"] = 50.0
    result = payload(client.post(COMPARE, json=allocation_request))
    assert all(strategy["nashProduct"] >= 0 for strategy in result["strategies"])


def test_selected_action_explanations_recompute_access_without_it(allocation_request):
    engine = AllocationEngine(load_network(), allocation_request)
    result = engine.solve()
    for strategy in result["strategies"]:
        for omitted in strategy["interventions"]:
            remaining = [
                action
                for action in strategy["interventions"]
                if action["actionId"] != omitted["actionId"]
            ]
            mask = sum(
                1 << engine.edges.index(action["assetId"]) for action in remaining
            )
            expected = dict(zip(("clinic", "shelter"), map(float, engine.access(mask))))
            assert omitted["accessWithout"] == pytest.approx(expected, abs=1e-9)
            assert any(
                strategy["access"][facility] > omitted["accessWithout"][facility]
                for facility in ("clinic", "shelter")
            )


@pytest.mark.parametrize(
    "changes",
    [
        {"scenarioVersion": 2},
        {"regionId": "elsewhere"},
        {"crewCapacity": 7},
        {"equipmentCapacity": 11},
        {"horizonHours": 0},
        {"totalBudget": 201},
        {"effectPercent": 101},
        {"bargainingWeight": 0},
        {"phase": "forecast"},
        {"blockedEdgeIds": ["missing"]},
        {"blockedEdgeIds": ["clinic"]},
        {"blockedEdgeIds": ["north-link", "north-link"]},
        {"impairedEdgeIds": ["south-link", "south-link"]},
        {"blockedEdgeIds": ["north-link"], "impairedEdgeIds": ["north-link"]},
        {"footprint": {"longitude": 0, "latitude": 0, "radiusKm": 1}},
        {"unexpected": "not allowed"},
    ],
)
def test_bad_revision_ids_limits_and_conflicts_are_enveloped(
    client, allocation_request, changes
):
    allocation_request.update(changes)
    for path in (COMPARE, EVALUATE):
        response = client.post(path, json=allocation_request)
        assert response.status_code == 422, response.text
        validate_contract("Envelope", response.json())
        assert response.json()["data"] is None


def test_non_json_numbers_body_limit_and_missing_graph_dependency(
    client, allocation_request, monkeypatch
):
    response = client.post(
        COMPARE,
        content=json.dumps(allocation_request).replace(
            '"radiusKm": 12', '"radiusKm": NaN'
        ),
    )
    assert response.status_code == 422
    assert client.post(COMPARE, content=b" " * (32 * 1024 + 1)).status_code == 413

    def missing():
        raise ModuleNotFoundError(name="networkx")

    monkeypatch.setattr("app.routes.network.load_network", missing)
    assert client.post(COMPARE, json=allocation_request).status_code == 503


def test_exact_solver_is_bounded_fast_and_does_not_mutate_requests_or_graph(
    allocation_request,
):
    graph = load_network()
    original_request, original_fixture = deepcopy(allocation_request), deepcopy(
        graph.fixture
    )
    allocation_request.update(totalBudget=200, crewCapacity=6, equipmentCapacity=10)
    for agency in allocation_request["agencies"].values():
        agency.update(budget=100, crewCapacity=6)
    before = deepcopy(allocation_request)
    started = perf_counter()
    engine = AllocationEngine(graph, allocation_request)
    assert len(engine.profiles()) <= 3**5
    first = engine.solve()
    assert perf_counter() - started < 2
    assert allocation_request == before and graph.fixture == original_fixture
    assert first == AllocationEngine(graph, allocation_request).solve()
    assert demo_request() == original_request
