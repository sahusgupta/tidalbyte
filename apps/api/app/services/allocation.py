"""Exact, bounded allocation on the existing fictional Houston graph.

The graph, costs, disruption mixture and effects are teaching assumptions. This
module computes plans; it neither estimates flood depth nor directs real crews.
"""

import json
import math
from dataclasses import dataclass
from fractions import Fraction
from itertools import product

from earthlab_contracts.validation import validate_contract

from app.config import FIXTURE_DIR, REGION_ID

AGENCIES = ("health", "shelter")
FACILITIES = ("clinic", "shelter")
ASSUMPTION_SET = "project:houston-allocation-assumptions-v1"
GRAPH_VERSION = "houston-illustrative-network-v1"
TIMESTAMP = "2026-11-21T00:00:00Z"  # Assumption-set revision, not an observation.
EXPENDITURE_PENALTY = Fraction(1, 10)
# Health cost, completion hours. Shelter has an assumed two-unit cost premium.
WORK = {
    "main-link": (18, 8),
    "north-link": (20, 10),
    "south-link": (12, 6),
    "bypass-west": (16, 8),
    "bypass-east": (14, 6),
}
LIMITATIONS = [
    "ILLUSTRATIVE: fictional links, facilities, costs, resources and disruption scenarios; requires verification.",
    "No flood depths, road safety, real restoration schedule or operational dispatch recommendations are established.",
    "County outage estimates and aerial imagery are not used to infer road-level disruption probabilities.",
    "Actions run in parallel with resources reserved throughout; travel, logistics, uncertainty calibration and crew scheduling are not modeled.",
]


class InvalidAllocation(ValueError):
    """A supported request has inconsistent or unknown graph references."""


class AllocationUnavailable(ValueError):
    """The versioned graph no longer supports this assumption set."""


def _number(value):
    return round(float(value), 10)


def _exposed(points, footprint):
    if footprint is None:
        return False
    longitude, latitude = footprint["longitude"], footprint["latitude"]
    cosine = math.cos(math.radians(latitude))
    offsets = [
        ((p[0] - longitude) * 111.32 * cosine, (p[1] - latitude) * 111.32)
        for p in points
    ]
    for a, b in zip(offsets, offsets[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = dx * dx + dy * dy
        fraction = min(1, max(0, -(a[0] * dx + a[1] * dy) / length)) if length else 0
        if (
            math.hypot(a[0] + fraction * dx, a[1] + fraction * dy)
            <= footprint["radiusKm"]
        ):
            return True
    return False


@dataclass(frozen=True)
class Portfolio:
    mask: int
    actions: tuple[int, ...]
    spend: int
    crews: int
    equipment: int
    hours: int


@dataclass(frozen=True)
class Profile:
    health: Portfolio
    shelter: Portfolio
    access: tuple[Fraction, Fraction]
    utilities: tuple[Fraction, Fraction]

    @property
    def key(self):
        return self.health.mask, self.shelter.mask

    @property
    def tie_key(self):
        return (
            self.health.spend + self.shelter.spend,
            self.health.crews + self.shelter.crews,
            self.health.equipment + self.shelter.equipment,
            max(self.health.hours, self.shelter.hours),
            self.health.actions,
            self.shelter.actions,
        )


class AllocationEngine:
    """At most 32 portfolios per agency and 1,024 joint profiles, no heuristics."""

    def __init__(self, graph, request):
        validate_contract("AllocationRequest", request)
        if (
            set(graph.edges) != set(WORK)
            or set(graph.facilities) != set(FACILITIES)
            or graph.fixture["sourceId"] != f"project:{GRAPH_VERSION}"
        ):
            raise AllocationUnavailable(
                "This graph revision is unsupported by allocation assumption set v1."
            )
        self.graph, self.request = graph, request
        self.edges = tuple(sorted(graph.edges))
        blocked, impaired = request["blockedEdgeIds"], request["impairedEdgeIds"]
        if len(blocked) != len(set(blocked)) or len(impaired) != len(set(impaired)):
            raise InvalidAllocation("Disruption lists must contain distinct edge IDs.")
        if set(blocked) & set(impaired):
            raise InvalidAllocation("An edge cannot be both blocked and impaired.")
        unknown = (set(blocked) | set(impaired)) - set(self.edges)
        if unknown:
            raise InvalidAllocation(
                f"Unknown graph edge IDs: {', '.join(sorted(unknown))}."
            )
        self.effect = Fraction(request["effectPercent"]) / 100
        self.blocked, self.impaired = set(blocked), set(impaired)
        self.scenarios = [(Fraction(1), self.blocked, self.impaired)]
        if request["phase"] == "mitigation":
            self.scenarios = [
                (Fraction(1, 10), set(), set()),
                (Fraction(1, 10), set(), self.blocked | self.impaired),
                (Fraction(8, 10), self.blocked, self.impaired),
            ]
        self.reference = graph.nx.single_source_dijkstra_path_length(
            graph.graph, graph.origin, weight="weight"
        )
        if any(
            facility not in self.reference or self.reference[facility] <= 0
            for facility in FACILITIES
        ):
            raise AllocationUnavailable(
                "The intact fixture must connect both facilities at positive travel cost."
            )
        self.candidates = self._candidates()
        self._access_cache = {}

    def _candidates(self):
        features = {
            feature["id"]: feature for feature in self.graph.fixture["features"]
        }
        candidates = []
        mode = self.request["phase"]
        for agency in AGENCIES:
            for edge in self.edges:
                cost, hours = WORK[edge]
                cost += 2 if agency == "shelter" else 0
                if mode == "mitigation":
                    cost, hours = cost - 2, hours - 2
                candidates.append(
                    {
                        "actionId": f"{mode}:{agency}:{edge}",
                        "agency": agency,
                        "assetId": edge,
                        "label": f"{'Hypothetical reinforcement' if mode == 'mitigation' else 'Hypothetical inspection/clearance'} · {edge} · {agency}",
                        "cost": cost,
                        "crews": 1,
                        "equipment": 1,
                        "hours": hours,
                        "effectAssumption": (
                            f"Assumed {self.request['effectPercent']}% modeled restoration: blocked links get base travel cost / effect; "
                            "impaired links get base cost × (3 − 2 × effect). Zero effect restores nothing. Not verified field performance."
                        ),
                        "source": ASSUMPTION_SET,
                        "exposed": _exposed(
                            features[edge]["geometry"]["coordinates"],
                            self.request["footprint"],
                        ),
                        "status": (
                            "blocked"
                            if edge in self.blocked
                            else "impaired" if edge in self.impaired else "available"
                        ),
                    }
                )
        return candidates

    def access(self, mask):
        """Expected intact-cost/current-cost access, capped at one, per facility."""
        if mask in self._access_cache:
            return self._access_cache[mask]
        selected = {
            edge for index, edge in enumerate(self.edges) if mask & (1 << index)
        }
        access = [Fraction(0), Fraction(0)]
        for probability, blocked, impaired in self.scenarios:
            network = self.graph.graph.copy()
            for edge in self.edges:
                a, b = self.graph.edges[edge]
                base = Fraction(str(network.edges[a, b]["weight"]))
                effect = self.effect if edge in selected else Fraction(0)
                if edge in blocked:
                    if effect == 0:
                        network.remove_edge(a, b)
                        continue
                    weight = base / effect
                elif edge in impaired:
                    weight = base * (3 - 2 * effect)
                else:
                    weight = base
                network.edges[a, b]["weight"] = weight
            costs = self.graph.nx.single_source_dijkstra_path_length(
                network, self.graph.origin, weight="weight"
            )
            for index, facility in enumerate(FACILITIES):
                if facility in costs:
                    access[index] += probability * min(
                        Fraction(1),
                        Fraction(str(self.reference[facility])) / costs[facility],
                    )
        result = tuple(access)
        self._access_cache[mask] = result
        return result

    def portfolios(self, agency):
        settings = self.request["agencies"][agency]
        offset = AGENCIES.index(agency) * len(self.edges)
        portfolios = []
        for mask in range(1 << len(self.edges)):
            indices = tuple(
                offset + i for i in range(len(self.edges)) if mask & (1 << i)
            )
            actions = [self.candidates[i] for i in indices]
            portfolio = Portfolio(
                mask,
                indices,
                sum(a["cost"] for a in actions),
                sum(a["crews"] for a in actions),
                sum(a["equipment"] for a in actions),
                max((a["hours"] for a in actions), default=0),
            )
            if (
                portfolio.spend <= settings["budget"]
                and portfolio.spend <= self.request["totalBudget"]
                and portfolio.crews
                <= min(settings["crewCapacity"], self.request["crewCapacity"])
                and portfolio.equipment <= self.request["equipmentCapacity"]
                and portfolio.hours <= self.request["horizonHours"]
            ):
                portfolios.append(portfolio)
        return portfolios

    def profiles(self):
        profiles = []
        for health, shelter in product(
            self.portfolios("health"), self.portfolios("shelter")
        ):
            if (
                health.mask & shelter.mask
                or health.spend + shelter.spend > self.request["totalBudget"]
                or health.crews + shelter.crews > self.request["crewCapacity"]
                or health.equipment + shelter.equipment
                > self.request["equipmentCapacity"]
            ):
                continue
            access = self.access(health.mask | shelter.mask)
            utilities = []
            for agency, portfolio in zip(AGENCIES, (health, shelter)):
                weights = self.request["agencies"][agency]
                utilities.append(
                    weights["clinicWeight"] * access[0]
                    + weights["shelterWeight"] * access[1]
                    - EXPENDITURE_PENALTY * portfolio.spend
                )
            profiles.append(Profile(health, shelter, access, tuple(utilities)))
        return profiles

    @staticmethod
    def independent(profiles):
        """Best responses start at no work; verify all feasible unilateral moves.

        Shared caps make this a constrained/generalized game, not an assertion
        about unconstrained Nash equilibria. Exact enumeration certifies the
        returned point, including a bounded least-regret fallback on cycling.
        """
        by_key = {profile.key: profile for profile in profiles}
        best_health, best_shelter = {}, {}
        for profile in profiles:
            for agency, fixed, best in (
                (0, profile.shelter.mask, best_health),
                (1, profile.health.mask, best_shelter),
            ):
                previous = best.get(fixed)
                if previous is None or (-profile.utilities[agency], profile.tie_key) < (
                    -previous.utilities[agency],
                    previous.tie_key,
                ):
                    best[fixed] = profile
        current = by_key[0, 0]
        seen = set()
        while current.key not in seen:
            seen.add(current.key)
            next_health = best_health[current.shelter.mask]
            next_profile = best_shelter[next_health.health.mask]
            if next_profile.key == current.key:
                break
            current = next_profile

        def regrets(profile):
            return (
                best_health[profile.shelter.mask].utilities[0] - profile.utilities[0],
                best_shelter[profile.health.mask].utilities[1] - profile.utilities[1],
            )

        if max(regrets(current)) > 0:
            current = min(
                profiles, key=lambda p: (max(regrets(p)), sum(regrets(p)), p.tie_key)
            )
        regret = max(regrets(current))
        return current, regret == 0, regret

    def evaluation(self):
        baseline = self.access(0)
        phase = self.request["phase"]
        assumptions = [
            "Only explicitly listed edge IDs are assumed blocked or impaired. Other fixture links are assumed available, not verified open roads.",
            "A drawn footprint marks geometric exposure only. Exposure never creates a closure, probability, depth or safety claim.",
            (
                "Response uses one declared disruption scenario."
                if phase == "response"
                else "Mitigation uses a teaching mixture: 10% intact, 10% all declared disruptions impaired, 80% declared blocked/impaired scenario. These are not weather probabilities."
            ),
            "Untreated impaired links cost three times their fixture travel cost; untreated blocked links are removed from the modeled graph.",
            "Action effect is hypothetical: blocked links get base cost / effect; impaired links get base cost × (3 − 2 × effect). At zero effect nothing is restored. 100% is not flood-proofing.",
            "One action class per phase, with one option for each agency on each of five links. At most one agency may fund an action on a physical link; duplicate funding is infeasible.",
            "All work is parallel; crews and equipment are reserved throughout. Completion time is the maximum selected action time, not a real restoration schedule.",
            "Access per facility is min(1, intact shortest travel cost / scenario shortest travel cost), or zero if unreachable; mitigation averages over its three declared scenarios.",
            f"Weighted access normalizes the fixture facility service weights (clinic {self.graph.facilities['clinic']}, shelter {self.graph.facilities['shelter']}) to a score from zero to one; no population is counted.",
            "Agency utility points = clinicWeight × clinic access + shelterWeight × shelter access − 0.1 × that agency's budget-unit spend. Preferences and the cost conversion are editable/illustrative assumptions.",
            "Independent best responses start at no work, health then shelter. Ties prefer lower spend, crews, equipment, completion time, then stable action order. Verification tests every feasible unilateral deviation under the same shared caps.",
            "Coordinated planning maximizes the sum of agency utilities. Bargaining requires positive gains for both and maximizes the weighted Nash product relative to independent utilities.",
            f"Health bargaining exponent is {self.request['bargainingWeight']}/10; shelter exponent is {10 - self.request['bargainingWeight']}/10. All methods share candidates and resource constraints.",
            "Timestamp identifies the fixed assumption-set revision, not live conditions or the time of an observed flood.",
        ]
        return {
            "regionId": REGION_ID,
            "graphSource": self.graph.fixture["sourceId"],
            "phase": phase,
            "scenarioLabel": (
                "Before-event hypothetical mitigation mixture"
                if phase == "mitigation"
                else "After-event assumed disruption and clearance"
            ),
            "assumptions": assumptions,
            "scenarioVersion": 1,
            "graphVersion": GRAPH_VERSION,
            "assumptionSetId": ASSUMPTION_SET,
            "dataMode": "illustrative",
            "sourceIds": [self.graph.fixture["sourceId"], ASSUMPTION_SET],
            "limitations": LIMITATIONS,
            "timestampUtc": TIMESTAMP,
            "candidates": self.candidates,
            "baselineAccess": dict(zip(FACILITIES, map(_number, baseline))),
        }

    def solve(self):
        profiles = self.profiles()
        independent, verified, regret = self.independent(profiles)
        coordinated = min(profiles, key=lambda p: (-sum(p.utilities), p.tie_key))
        disagreement = independent.utilities
        weight = self.request["bargainingWeight"] / 10

        def nash_log(profile):
            gains = tuple(u - d for u, d in zip(profile.utilities, disagreement))
            if min(gains) <= 0:
                return None
            return weight * math.log(float(gains[0])) + (1 - weight) * math.log(
                float(gains[1])
            )

        positive = [
            (profile, nash_log(profile))
            for profile in profiles
            if nash_log(profile) is not None
        ]
        bargaining = independent
        if positive:
            best = max(value for _, value in positive)
            bargaining = min(
                (profile for profile, value in positive if abs(value - best) < 1e-12),
                key=lambda p: p.tie_key,
            )
        reasons = [
            (
                "Independent outcome: verified no feasible unilateral deviation improves either agency's utility under the shared-capacity constraints. "
                if verified
                else f"Independent approximate outcome: no verified equilibrium; best available maximum unilateral gain is {_number(regret)} utility points. "
            )
            + "Best responses start at no work in health/shelter order; exact enumeration verifies the result and resolves any cycle by least regret.",
            "Coordinated optimum: greatest summed agency utility among every feasible joint portfolio; this is constrained optimization, not a Nash equilibrium claim.",
            (
                f"Nash bargaining agreement: maximizes gains to powers {weight:g} (health) and {1 - weight:g} (shelter), with strictly positive gains to both."
                if positive
                else "No mutually beneficial agreement in modeled action set. Returning the feasible independent outcome; neither agency is assigned a loss by bargaining."
            ),
        ]
        strategies = []
        for identifier, profile, reason in zip(
            ("independent", "coordinated", "bargaining"),
            (independent, coordinated, bargaining),
            reasons,
        ):
            weighted = sum(
                Fraction(self.graph.facilities[facility]) * access
                for facility, access in zip(FACILITIES, profile.access)
            ) / sum(self.graph.facilities.values())
            logarithm = nash_log(profile)
            interventions = []
            for index in profile.health.actions + profile.shelter.actions:
                candidate = self.candidates[index]
                without = self.access(
                    (profile.health.mask | profile.shelter.mask)
                    & ~(1 << (index % len(self.edges)))
                )
                interventions.append(
                    {
                        **{
                            key: candidate[key]
                            for key in (
                                "actionId",
                                "agency",
                                "assetId",
                                "label",
                                "cost",
                                "crews",
                            )
                        },
                        "accessWithout": dict(zip(FACILITIES, map(_number, without))),
                    }
                )
            strategies.append(
                {
                    "id": identifier,
                    "utilities": dict(zip(AGENCIES, map(_number, profile.utilities))),
                    "spend": {
                        "health": profile.health.spend,
                        "shelter": profile.shelter.spend,
                    },
                    "crewsUsed": profile.health.crews + profile.shelter.crews,
                    "equipmentUsed": profile.health.equipment
                    + profile.shelter.equipment,
                    "completionHours": max(profile.health.hours, profile.shelter.hours),
                    "access": dict(zip(FACILITIES, map(_number, profile.access))),
                    "weightedAccess": _number(weighted),
                    "interventions": interventions,
                    "jointUtility": _number(sum(profile.utilities)),
                    "gains": dict(
                        zip(
                            AGENCIES,
                            (
                                _number(u - d)
                                for u, d in zip(profile.utilities, disagreement)
                            ),
                        )
                    ),
                    "nashProduct": (
                        _number(math.exp(logarithm)) if logarithm is not None else 0
                    ),
                    "explanation": reason,
                }
            )
        # A small, truthful subset: compared outcomes plus feasible cross-deviations.
        selected = (independent, coordinated, bargaining)
        keys = list(
            dict.fromkeys(
                [p.key for p in selected]
                + list(
                    product(
                        dict.fromkeys((0, *(p.health.mask for p in selected))),
                        dict.fromkeys((0, *(p.shelter.mask for p in selected))),
                    )
                )
            )
        )
        lookup = {profile.key: profile for profile in profiles}
        payoff = []
        for key in keys:
            if key not in lookup:
                continue
            profile = lookup[key]
            payoff.append(
                {
                    "healthActions": [
                        self.candidates[i]["actionId"] for i in profile.health.actions
                    ],
                    "shelterActions": [
                        self.candidates[i]["actionId"] for i in profile.shelter.actions
                    ],
                    "utilities": dict(zip(AGENCIES, map(_number, profile.utilities))),
                    "feasible": True,
                }
            )
        return {
            **self.evaluation(),
            "strategies": strategies,
            "payoffMatrix": payoff[:16],
            "equilibriumVerified": verified,
            "agreement": bool(positive),
        }


def demo_request():
    return json.loads(
        (FIXTURE_DIR / "network-allocation-demo.json").read_text(encoding="utf-8")
    )
