"""Apply EarthLab's allocation game to paired network measurements for a selected Houston storm."""
from fractions import Fraction
from math import ceil
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.services.portfolio_game import AGENCIES, PortfolioGame


class BoundedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Corridor(BoundedModel):
    name: str = Field(min_length=1, max_length=240)
    length_m: int = Field(ge=1, le=200_000)
    center: tuple[float, float]
    nearby: str | None = Field(default=None, max_length=240)


class Outcome(BoundedModel):
    delay_minutes: float = Field(ge=0, le=1e10)
    cut_off: int = Field(ge=0, le=10_000_000)
    blocked_km: float = Field(ge=0, le=1e6)
    impaired_km: float = Field(ge=0, le=1e6)


class Measurements(BoundedModel):
    phase: Literal["mitigation", "response"]
    offset_cm: Literal[10, 20]
    corridors: list[Corridor] = Field(max_length=3)
    outcomes: list[Outcome] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def validate_masks(self):
        if len(self.outcomes) != 1 << len(self.corridors):
            raise ValueError("Supply one measured outcome for every corridor combination, starting with no work.")
        if len({site.name for site in self.corridors}) != len(self.corridors):
            raise ValueError("Corridor names must be distinct.")
        if self.offset_cm != {"mitigation": 20, "response": 10}[self.phase]:
            raise ValueError("The treatment offset must match the phase.")
        for mask, outcome in enumerate(self.outcomes):
            for i in range(len(self.corridors)):
                if mask & (1 << i):
                    without = self.outcomes[mask ^ (1 << i)]
                    if any(getattr(outcome, key) > getattr(without, key) for key in Outcome.model_fields):
                        raise ValueError("Reducing travel resistance cannot worsen a modeled outcome.")
        return self


class StormPlanRequest(BoundedModel):
    measurements: Measurements
    budget: int = Field(default=36, ge=0, le=100)
    crews: int = Field(default=2, ge=0, le=3)
    health_budget: int = Field(default=24, ge=0, le=100)
    works_budget: int = Field(default=24, ge=0, le=100)
    health_access_priority: int = Field(default=85, ge=0, le=100)
    works_access_priority: int = Field(default=20, ge=0, le=100)
    information: Literal["field_reports", "full_model"] = "field_reports"


class StormPortfolioGame(PortfolioGame):
    """One funded action per corridor. Both agencies value hospital access and road mobility."""

    def __init__(self, spec: StormPlanRequest):
        self.spec = spec
        measures = spec.measurements
        self.edges = tuple(site.name for site in measures.corridors)
        self.candidates = []
        self.request = {
            "totalBudget": spec.budget, "crewCapacity": spec.crews, "equipmentCapacity": spec.crews,
            "horizonHours": 24, "bargainingWeight": 5, "agencies": {},
        }
        # The shared game uses fixed two-agency and two-service slots from its original clinic/shelter case.
        for agency, budget, priority in zip(AGENCIES, (spec.health_budget, spec.works_budget),
                                           (spec.health_access_priority, spec.works_access_priority)):
            self.request["agencies"][agency] = {
                "budget": budget, "crewCapacity": spec.crews,
                "clinicWeight": priority, "shelterWeight": 100 - priority,
            }
            for site in measures.corridors:
                cost = (6 if measures.phase == "mitigation" else 4) + ceil(site.length_m / 100)
                self.candidates.append({"cost": cost, "hours": 8 if measures.phase == "mitigation" else 4,
                                        "crews": 1, "equipment": 1})
        # Field teams report cumulative delay to 50 building-minutes, impaired distance to 0.1 km.
        # Use the same information for each strategy and disclose the unrounded paired outcomes afterward.
        def observe(outcome):
            units = (50, Fraction(1, 10)) if spec.information == "field_reports" else (None, None)
            raw = (outcome.delay_minutes, outcome.impaired_km)
            return tuple(round(Fraction(str(value)) / unit) * unit if unit else Fraction(str(value))
                         for value, unit in zip(raw, units))

        readings = [observe(outcome) for outcome in measures.outcomes]
        # Normalize reductions to what these three sites can jointly recover. A metric without headroom earns zero.
        best_gain = tuple(before - best for before, best in zip(readings[0], readings[-1]))
        self.scores = [tuple((before - after) / full if full > 0 else Fraction(0)
                             for before, after, full in zip(readings[0], reading, best_gain))
                       for reading in readings]

    def access(self, mask):
        return self.scores[mask]

    def compare(self):
        independent, coordinated, negotiated, verified, regret, agreement = self.choose_plans(self.profiles())
        strategies = []
        for name, profile in zip(("independent", "coordinated", "bargaining"), (independent, coordinated, negotiated)):
            funded = []
            for agency, portfolio in (("Health", profile.health), ("Public works", profile.shelter)):
                for action in portfolio.actions:
                    index = action % len(self.edges)
                    funded.append({"agency": agency, "corridor": index, "cost": self.candidates[action]["cost"]})
            mask = profile.health.mask | profile.shelter.mask
            strategies.append({
                "id": name, "funded": funded, "spend": profile.health.spend + profile.shelter.spend,
                "crews": profile.health.crews + profile.shelter.crews,
                "outcome": self.spec.measurements.outcomes[mask].model_dump(),
                "utilities": [float(value) for value in profile.utilities],
            })
        return {"strategies": strategies, "agreement": agreement, "equilibrium_verified": verified,
                "maximum_regret": float(regret)}
