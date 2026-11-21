"""Deterministic connectivity and a finite two-agency protection game."""

import json
from copy import deepcopy
from functools import lru_cache
from itertools import product

from app.config import FIXTURE_DIR

LIMITATIONS = [
    "Fictional Houston-area assets and assumed disruptions; results describe schematic connectivity.",
    "Access score sums the assumed service weights of facilities reachable from the staging point.",
    "Path cost uses fictional travel-cost units. Connectivity cannot establish road safety or predict outages.",
]


class InvalidPlan(ValueError):
    pass


class IllustrativeNetwork:
    def __init__(self, nx, fixture):
        self.nx = nx
        self.fixture = fixture
        self.graph = nx.Graph()
        self.edges = {}
        self.facilities = {}
        for feature in fixture["features"]:
            asset_id, props = feature["id"], feature["properties"]
            if props["kind"] == "node":
                self.graph.add_node(asset_id)
                if props["role"] == "origin":
                    self.origin = asset_id
                if props["role"] == "facility":
                    self.facilities[asset_id] = props["serviceWeight"]
            else:
                endpoints = (props["from"], props["to"])
                self.edges[asset_id] = endpoints
                self.graph.add_edge(*endpoints, id=asset_id, weight=props["travelCost"])

    def _assets(self, node_ids, edge_ids):
        unknown = (set(node_ids) - set(self.graph)) | (set(edge_ids) - self.edges.keys())
        if unknown:
            raise InvalidPlan(f"Unknown or mismatched asset IDs: {', '.join(sorted(unknown))}.")
        return set(node_ids) | set(edge_ids)

    def compare(self, plan):
        disrupted = self._assets(plan["disabledNodeIds"], plan["disabledEdgeIds"])
        actions = {}
        intervention_ids = set()
        for intervention in plan["interventions"]:
            intervention_id = intervention["id"]
            if intervention_id in intervention_ids:
                raise InvalidPlan("Intervention IDs must be distinct.")
            intervention_ids.add(intervention_id)
            assets = self._assets(intervention["graphNodeIds"], intervention["graphEdgeIds"])
            if not assets:
                raise InvalidPlan("An intervention must select at least one asset.")
            for asset in assets:
                action = intervention["action"]
                if asset in actions and actions[asset] != action:
                    raise InvalidPlan("Each asset can have only one intervention action.")
                actions[asset] = action
        if len(actions) > 3:
            raise InvalidPlan("Select at most three distinct intervention assets.")

        protected = {asset for asset, action in actions.items() if action == "protect"}
        disabled = {asset for asset, action in actions.items() if action == "disable"}
        baseline = self._snapshot(disrupted)
        proposal = self._snapshot((disrupted - protected) | disabled)
        return baseline, proposal, actions

    def _snapshot(self, removed):
        graph = self.graph.copy()
        graph.remove_nodes_from(removed)
        graph.remove_edges_from(self.edges[asset] for asset in removed & self.edges.keys())
        paths = {}
        if self.origin in graph:
            costs, route_nodes = self.nx.single_source_dijkstra(graph, self.origin)
            for facility in self.facilities.keys() & costs.keys():
                nodes = route_nodes[facility]
                edges = [graph.edges[a, b]["id"] for a, b in zip(nodes, nodes[1:])]
                paths[facility] = {"edgeIds": edges, "travelCost": costs[facility]}
        return {
            "metrics": {
                "reachableFacilities": len(paths),
                "connectedComponents": self.nx.number_connected_components(graph),
                "weightedAccessScore": sum(self.facilities[facility] for facility in paths),
            },
            "paths": dict(sorted(paths.items())),
            "activeEdges": {data["id"] for _, _, data in graph.edges(data=True)},
            "activeNodes": set(graph),
            "bridges": {graph.edges[a, b]["id"] for a, b in self.nx.bridges(graph)},
        }

    def preview(self, baseline, proposal, actions):
        overlay = deepcopy(self.fixture)
        for feature in overlay["features"]:
            asset = feature["id"]
            active = "activeEdges" if feature["properties"]["kind"] == "edge" else "activeNodes"
            feature["properties"].update(
                baselineActive=asset in baseline[active],
                proposalActive=asset in proposal[active],
                baselineBridge=asset in baseline["bridges"],
                proposalBridge=asset in proposal["bridges"],
                intervention=actions.get(asset),
            )
        overlay["paths"] = {"baseline": baseline["paths"], "proposal": proposal["paths"]}
        return overlay

    def strategy(self):
        action_costs = {"pass": 0, "north-link": 1, "south-link": 1}
        budgets = (1, 1)
        choices = [
            tuple(action for action, cost in action_costs.items() if cost <= budget)
            for budget in budgets
        ]
        utility_cost = 2.5
        weights = ({"clinic": 5, "shelter": 1}, {"clinic": 4, "shelter": 2})
        disruptions = {"north-link", "south-link"}
        table = {}
        for profile in product(*choices):
            paths = self._snapshot(disruptions - set(profile))["paths"]
            payoffs = [
                sum(weight[facility] for facility in paths) - utility_cost * (action != "pass")
                for weight, action in zip(weights, profile)
            ]
            table[profile] = {
                "actions": list(profile),
                "payoffs": payoffs,
                "totalPayoff": sum(payoffs),
                "reachableFacilities": list(paths),
            }
        equilibria = [
            row for (a, b), row in table.items()
            if all(
                row["payoffs"][0] >= table[alternative, b]["payoffs"][0]
                for alternative in choices[0]
            ) and all(
                row["payoffs"][1] >= table[a, alternative]["payoffs"][1]
                for alternative in choices[1]
            )
        ]
        best_total = max(row["totalPayoff"] for row in table.values())
        return {
            "mode": "hypothetical_connectivity",
            "graphSource": self.fixture["sourceId"],
            "agencies": [
                {"id": agency, "budgetUnits": budget, "facilityUtilities": weight}
                for agency, budget, weight in zip(("health", "shelter"), budgets, weights)
            ],
            "disabledEdgeIds": sorted(disruptions),
            "actions": [
                {"id": action, "budgetUnits": cost}
                for action, cost in action_costs.items()
            ],
            "protectionUtilityCost": utility_cost,
            "payoffRule": "Sum reachable facility utilities, minus 2.5 utility points if that agency chooses protection. Duplicate protection costs both agencies and restores one link.",
            "payoffTable": list(table.values()),
            "independentEquilibria": equilibria,
            "coordinatedOptima": [row for row in table.values() if row["totalPayoff"] == best_total],
            "limitations": LIMITATIONS + ["Budgets, facility utilities and protection costs are illustrative assumptions."],
        }


@lru_cache(maxsize=1)
def load_network():
    import networkx as nx

    fixture = json.loads((FIXTURE_DIR / "network-houston.geojson").read_text(encoding="utf-8"))
    return IllustrativeNetwork(nx, fixture)
