from copy import deepcopy

import pytest
from app.services.storm_planning import StormPlanRequest, StormPortfolioGame

PATH = "/api/v1/allocation/storm/compare"


def scenario():
    def outcome(delay, blocked, cut_off):
        return dict(delay_minutes=delay, cut_off=cut_off, blocked_km=blocked, impaired_km=blocked)

    return {
        "measurements": {
            "phase": "response", "offset_cm": 10,
            "corridors": [
                {"name": "North Street", "length_m": 350, "center": [-95.2, 29.7]},
                {"name": "East Street", "length_m": 350, "center": [-95.21, 29.71]},
            ],
            "outcomes": [outcome(300, 2, 4), outcome(50, 1.9, 1), outcome(275, 1.2, 3), outcome(0, 1, 0)],
        }, "budget": 12, "crews": 1, "health_budget": 12, "works_budget": 12,
    }


def test_existing_game_reacts_to_preferences_and_caps(client):
    req = scenario()
    for preferences, index in [(100, 0), (0, 1)]:
        req.update(health_access_priority=preferences, works_access_priority=preferences)
        response = client.post(PATH, json=req)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["meta"]["mode"] == "exploratory_what_if"
        plans = body["data"]["strategies"]
        assert [plan["id"] for plan in plans] == ["independent", "coordinated", "bargaining"]
        assert plans[1]["funded"][0]["corridor"] == index
        for plan in plans:
            assert plan["crews"] == 1 and plan["spend"] == 8
            assert plan["outcome"] == req["measurements"]["outcomes"][1 << plan["funded"][0]["corridor"]]
    for constraint in [{"budget": 0}, {"crews": 0}, {"health_budget": 4, "works_budget": 4}]:
        result = client.post(PATH, json={**req, **constraint}).json()["data"]
        assert all(not plan["funded"] and plan["outcome"] == req["measurements"]["outcomes"][0] for plan in result["strategies"])


def test_observation_precision_changes_game_but_keeps_full_precision_outcomes():
    req = scenario()
    req["measurements"]["corridors"] = req["measurements"]["corridors"][:1]
    req["measurements"]["outcomes"] = [
        dict(delay_minutes=300, cut_off=0, blocked_km=1, impaired_km=1),
        dict(delay_minutes=299, cut_off=0, blocked_km=.99, impaired_km=.99),
    ]
    def solve(info):
        game = StormPortfolioGame(StormPlanRequest.model_validate({**req, "information": info}))
        return game.compare()["strategies"][1]

    assert not solve("field_reports")["funded"]
    assert solve("full_model")["outcome"]["delay_minutes"] == 299


@pytest.mark.parametrize("bad", ["missing_mask", "worsened_outcome", "wrong_offset", "too_many_corridors", "negative_budget"])
def test_invalid_comparisons(client, bad):
    req = deepcopy(scenario())
    measurements = req["measurements"]
    if bad == "missing_mask":
        measurements["outcomes"].pop()
    elif bad == "worsened_outcome":
        measurements["outcomes"][-1]["cut_off"] = 1000
    elif bad == "wrong_offset":
        measurements["offset_cm"] = 20
    elif bad == "too_many_corridors":
        measurements["corridors"] *= 2
    else:
        req["budget"] = -1
    assert client.post(PATH, json=req).status_code == 422
