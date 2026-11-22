"""Shared finite, two-agency game for the Houston fixture and spatial flood scenarios."""

import math
from dataclasses import dataclass
from fractions import Fraction
from itertools import product

AGENCIES = ("health", "shelter")
EXPENDITURE_PENALTY = Fraction(1, 10)


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


class PortfolioGame:
    """Subclasses provide indexed actions, resource limits and two service outcomes per mask."""

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

    def nash_log(self, profile, disagreement):
        weight = self.request["bargainingWeight"] / 10
        gains = tuple(u - d for u, d in zip(profile.utilities, disagreement))
        if min(gains) <= 0:
            return None
        return weight * math.log(float(gains[0])) + (1 - weight) * math.log(float(gains[1]))

    def choose_plans(self, profiles):
        independent, verified, regret = self.independent(profiles)
        coordinated = min(profiles, key=lambda p: (-sum(p.utilities), p.tie_key))
        disagreement = independent.utilities

        positive = [
            (profile, self.nash_log(profile, disagreement))
            for profile in profiles
            if self.nash_log(profile, disagreement) is not None
        ]
        bargaining = independent
        if positive:
            best = max(value for _, value in positive)
            bargaining = min(
                (profile for profile, value in positive if abs(value - best) < 1e-12),
                key=lambda p: p.tie_key,
            )
        return independent, coordinated, bargaining, verified, regret, bool(positive)
