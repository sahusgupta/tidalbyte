# Infrastructure and game theory handoff

Branch `feat/graph-infra-game-theory`. No API keys or trained model required.
Install the locked API environment, including NetworkX 3.5, with
`python -m pip install -r requirements.lock`. Start the API using the repository
setup guide, then run `python -m pytest apps/api/tests/test_network.py`.

GET `/api/v1/network` loads the versioned Houston-area fixture. EarthLab
created its schematic WGS84 geometry, fictional facilities and weights
independently of external datasets. The fixture is CC0-1.0. It represents
assumed connectivity for a teaching example.

POST `/api/v1/network/compare` with this body to demonstrate a disconnected
clinic and its restoration through protection.

```json
{
  "regionId": "houston-gulf-coast",
  "disabledNodeIds": [],
  "disabledEdgeIds": ["north-link"],
  "interventions": [
    {
      "id": "protect-north",
      "graphEdgeIds": ["north-link"],
      "graphNodeIds": [],
      "action": "protect"
    }
  ]
}
```

The baseline includes the assumed disruptions. The proposal applies the
selected interventions to the same disruptions. Protect cancels a disruption
of the selected asset, disable removes it and inspect leaves connectivity
as-is. Removing a node removes its incident edges. The staging point defines
reachability. The access score sums reachable facility weights (clinic 9,
shelter 3). Connected components count surviving nodes and links, including
isolated nodes. Optional intervention budgetUnits is descriptive for a
manual comparison. The request allows up to three distinct selected assets.

The example yields one reachable facility, two components and three access
points before intervention, then two facilities, one component and 12 access
points after intervention. POST `/api/v1/network/preview` with the same
body to retrieve active/bridge flags and shortest access paths. Travel-cost
units are fictional. The results provide no empirical road conditions,
outage estimates or emergency routing assurance.

GET `/api/v1/network/strategy` returns the fixed example when both facility
links face disruption. Each agency has one budget unit. It can pass or
spend that unit on one link. Each agency earns its own utility for all
reachable facilities and pays a 2.5-point utility cost for choosing
protection. If both agencies protect the same link, each pays the cost.
The two pure Nash equilibria protect only the clinic and yield a joint
payoff of 6.5. Both coordinated optima protect different links and yield 7.
The response lists all nine action profiles in agency order.

The lead approved the dependency pin and OpenAPI export. Frontend
integration remains with the globe owner. See [proposal 002](../proposals/002-network-integration.md).

Local verification used Python 3.12.14 with the locked Python packages and
NetworkX 3.5. All 64 API, ML and contract tests passed. The regenerated OpenAPI matches the running app in this environment.
GitHub Actions runs the same drift check and tests on Python 3.13.
