# EarthLab — Houston Flood Response and Mitigation Allocation Engine

You are Codex acting as a senior optimization engineer, applied game theorist, geospatial backend engineer, and product engineer. Implement a **functional, explainable resource-allocation module** within the existing EarthLab repository. Do not create a new app. Work with the existing React/TypeScript/CesiumJS frontend, Python FastAPI backend, Houston scenario map, infrastructure graph, and established ML pipeline. Build a real module with tests and observable outputs, not just a mockup or mathematical slide.

## First: repository and team protocol
1. Read `AGENTS.md`, `CLAUDE.md` if present, `docs/00-START-HERE.md`, `docs/01-PRODUCT.md`, `docs/02-SYSTEM.md`, `docs/05-TEAM-PROTOCOL.md`, `docs/06-API-CONTRACTS.md`, `STATUS.md`, `DECISIONS.md`, and `prompts/03-INFRA-GAME-THEORY.md`. Inspect actual files before assuming their existence, interfaces or contents.
2. This is a multi-person project on separate computers. `git fetch` and check your branch before editing. Use a dedicated branch such as `feature/allocation-game-theory`. Respect file ownership. If a new API/schema changes a shared contract, submit a concrete proposal in `docs/proposals/`, coordinate with the team lead, then implement after approval; don't silently break consumers.
3. If you modify UI components, invoke `$interface-craft` when installed or read the bundled `skills/interface-craft/SKILL.md` and apply it. Follow the existing Houston-only design system. Do not modify the main globe's visual hierarchy or introduce generic SaaS dashboards.
4. Maintain an executable demo with offline fixtures. Document any dependency on data providers. Never commit API keys or private large datasets.

## Product outcome
EarthLab helps planners **explore** how limited resources might be allocated across Houston-area infrastructure before a flood and during an assumed post-flood disruption. It must answer:
- Which roads or assets appear most important to inspect or protect, given the available data and explicitly assumed flood footprint?
- With finite crews, equipment, time and budgets, which intervention portfolios preserve the greatest modeled access to critical services?
- How does the result change if two organizations optimize their own objectives versus coordinate through an explicit Nash bargaining mechanism?
- Why was each intervention selected, what assumptions drive the result, and how sensitive is the recommendation to changing the assumptions?

This is a **scenario-planning and decision-support prototype**, not real emergency dispatch software, a validated flood model, or a tool authorized to direct crews. No automatic deployment or instruction to drive through flooded roads. Outputs must say “modeled”, “hypothetical”, “requires verification”, or equivalent wherever applicable.

## Scope: two modes built on one mathematical core
**A. Before-event mitigation:** Choose at most a few candidate road links / drainage-adjacent assets for hypothetical reinforcement or preventive inspection. Interventions have illustrative costs, capacities and assumed reductions in disruption severity. Show which investments preserve road-network connectivity and critical-facility access in a specified hypothetical flood scenario. Do NOT assume a road can be made floodproof merely because an action was chosen.

**B. After-event response:** Given a user-defined set of blocked or impaired road segments (verified or hypothetical), assign limited inspection/clearance resources to candidate segments. Each action has a crew requirement, time-to-effect and assumed restoration effect. Prioritize restored connectivity to designated hospitals, shelters and other critical facilities. Do not present hypothetical restoration times as real response schedules.

For the hackathon, fully implement one intervention class per mode, at most two agencies, up to 10–20 candidate interventions, and a bounded, deterministic optimization. More realism is a stretch goal.

## Data and graph integration
- Reuse `networkx` graph and existing `/api/v1/network` and `/api/v1/network/compare` mechanisms. Don't create a second disconnected map of Houston.
- Node attributes: geolocation, supported facility type, population/priority proxy where sourced, provenance; edge attributes: ID, length/travel cost, connected nodes, source/provenance, and scenario status (`available`, `impaired`, `blocked`, `unknown`). Use GeoJSON for map overlays.
- Hurricane/flood drawing tools create user-defined hazard footprints. Intersection with roads means **exposed to the drawn scenario**, never demonstrated flood depth or impassability. Only treat an edge as blocked if the scenario explicitly assumes it blocked or supported evidence shows it; expose that provenance in UI.
- The existing trained county-level weather/outage severity model is contextual information. It does NOT establish road-level flood probability or whether a specific substation will fail. Do not propagate county model scores into road failure probabilities without an explicit, honest mapping backed by data.
- If authentic facility/road attributes are unavailable, create a small Houston-shaped, explicitly labeled `DEMO / ILLUSTRATIVE` graph and include `source`, `mode`, `assumptions`, and data timestamps for each scenario. Prefer actual licensed OSM road geometries when already available in repo; don't extract geometry from Google Photorealistic 3D Tiles.

## Deterministic objective and constraints
Represent a planning scenario with agencies, a total budget, agency-specific budgets, candidate interventions and a graph state. Actions have `actionId`, `targetEdgeIds`, `mode`, `requiredResources`, `estimatedCost`, `estimatedCompletionTime`, `effectAssumption`, and source. Plans may not exceed agency budgets, available crews, action capacities, or compatible time windows. Reject infeasible plans.

Define a transparent network-access score. Example:
`Access(plan) = sum over demand nodes (demandWeight_i * reachableCriticalFacilityWeight_i)`
where reachability or travel cost is computed on the resulting graph and documented. For more realistic routing, use shortest-path travel costs with an explicit cutoff. Avoid double counting served population across multiple facilities.

Two primary stakeholder agencies should have distinct, user-visible utility functions, for example:
- Agency A (transportation/public works): improved road connectivity and travel time minus expenditure/operational cost.
- Agency B (emergency services): restored weighted access to verified critical service locations minus resource cost and expected delay.

Utilities must be deterministic given the same scenario, weights, and actions, and must use consistent units or normalized scores, with visible explanations of those normalizations. Permit sensitivity controls for each agency's weights.

## Game theory: implement honestly
Do not confuse Nash equilibrium, Nash bargaining and social welfare optimization.

1. **Independent-agency disagreement baseline:** Each agency chooses feasible interventions to maximize its own utility without binding cooperation, within its own budget. Implement a bounded best-response process or exhaustive small-game enumeration. Label the outcome `independent outcome / approximate best response` unless you explicitly verify that no unilateral deviation improves either agency's payoff. Only call it a `pure-strategy Nash equilibrium` if verified, and explain when no pure equilibrium exists or convergence is not established.
2. **Coordinated planner baseline:** Maximize an explicitly weighted combined benefit / service-access score subject to resource and budget limits. This is constrained optimization, NOT itself game theory.
3. **Nash bargaining:** Use the independent/disagreement utilities `(d_A,d_B)` as fallback payoffs, enumerate feasible joint plans or use a bounded optimizer, and choose an individually rational plan that maximizes the Nash product of utility gains:
   `maximize (U_A(plan)-d_A)^wA * (U_B(plan)-d_B)^wB`
   subject to both gains >= 0 and all constraints; use logs for numerically stable positive gains where appropriate. If no mutually improving positive-gain agreement exists, show `No mutually beneficial agreement in modeled action set` rather than inventing a solution. Make bargaining weights explicit, default equal, and let users adjust them.
4. Compare `independent`, `coordinated`, and `Nash bargaining` strategies using the SAME scenario, candidate actions, graph and assumptions. Report selected intervention IDs, agency utility scores, weighted access score, total costs and resource consumption. The methods may produce the same plan; do not force a dramatic difference.
5. Show one small 2x2 or bounded strategy payoff table with actual computed payoffs for the judge to inspect. Provide an explanation of how the bargaining solution follows from those payoffs. Never fabricate equilibrium labels or savings.

Use exhaustive search or integer linear programming for a small decision space; prefer reliable, deterministic results over implementing a sophisticated but untested reinforcement-learning optimizer. ML should remain the repository's separately trained and evaluated outage predictor; the strategic allocation engine is algorithmic game theory/optimization, not mislabeled machine learning.

## API and contract (coordinate before changing canonical schemas)
Propose and implement a versioned resource allocation API, ideally:
- `POST /api/v1/allocation/scenarios/evaluate` for derived candidate interventions and scenario access baseline.
- `POST /api/v1/allocation/plans/compare` to compute independent, coordinated, and bargaining plans.
- `GET /api/v1/allocation/demo` for a reproducible Houston demo case.
Use the repository's `{data,meta,error}` envelope and include `scenarioVersion`, `graphVersion`, `assumptionSetId`, `dataMode`, `sourceIds`, and `limitations`. Respond with enough structured data for map highlighting and comparison charts, not narrative alone. Limit candidates/timeouts so requests finish quickly on a laptop; expose a progress indicator only if actual background processing exists.

Recommended request: `{scenarioId, mode, blockedEdgeIds, floodPolygonId?, candidateActions, agencies:[{id,budget,crewCapacity,utilityWeights}], bargainingWeights, planningHorizonHours}`.
Recommended response: `{baseline, independent, coordinated, bargaining, candidateActionScores, affectedGeoJson, payoffMatrix, assumptions, provenance, warnings}`.
Validate IDs, nonnegative budgets, caps, scenario revisions, geometry references and all numerical inputs. Never trust direct model-generated JSON without the same validation as manual UI input.

## UI integration: Houston 3D map
Build a compact `Allocation Studio` or `Resource Planning` mode inside EarthLab, not another app or landing page. Keep the 3D Houston map visually dominant.
- Toolbar mode switch: `Mitigation` / `Response`.
- Hover/click on exposed roads and critical services to inspect why they are prioritized; selected candidate actions appear as anchored map markers with visualized downstream connectivity.
- Inspector controls for finite budget, number of crews, intervention assumptions, agency preferences and bargaining weights.
- `Compare strategies` runs all three methods and shows their differences in small legible charts, an allocation ledger, and highlighted interventions on the map.
- Allow before/after toggling, selected-plan playback, and provenance tooltips. Show unknown or missing data, rather than inventing it.
- Tactile cartographic design using `$interface-craft`: charcoal workspace, restrained ink-like routes, warm paper layers, careful scientific annotations, no default gradient SaaS cards or giant marketing hero.
- Performance fallback: if photorealistic tiles fail, show the same analysis over basic Cesium/GeoJSON; if API unavailable, show a conspicuously labeled offline scenario.

## Gemini and ElevenLabs interface
Extend the existing allowlisted command interpretation to propose (not execute) actions such as:
- “With two repair crews and a budget of 50 units, what should we inspect first?”
- “Compare independent agencies against a cooperative agreement.”
- “Prioritize hospitals more heavily.”
- “What changes if this road is blocked?”
- “Explain why the bargaining plan picks this connection.”
The command controller validates and applies edits; Gemini can explain actual returned utility/graph data but cannot invent impact numbers. ElevenLabs provides voice input and spoken summaries, with text/manual fallback. Use existing integrations; don't duplicate voice infrastructure. If the command schema must change, coordinate with the lead.

## Implementation order
1. Inspect actual repo and write a short `docs/proposals/allocation-module.md` naming touched files/contracts and assumptions. Coordinate any new endpoint shapes.
2. Create reproducible demo fixtures: 2 agencies, finite budgets, 8–12 intervention options, a bounded Houston road graph, critical facilities, a fictional flood footprint, and explicit disruption assumptions.
3. Implement network utility metrics and feasible-portfolio enumeration with deterministic tie-breaking.
4. Implement independent baseline, coordinated planner and Nash bargaining; produce payoff table and three comparable outputs.
5. Add tests and API endpoints using real graph service; ship API contract and handoff to frontend owner.
6. Implement map-based planning UI only if assigned ownership or in coordination with UI owner; connect endpoints and typed controls.
7. Add Gemini/ElevenLabs command hooks only through the existing orchestration owner.
8. Profile under 20 candidates and make the interactive demo quick and deterministic.

## Minimum tests / acceptance criteria
- Budget/crew constraints always hold, including zero-budget and insufficient-capacity cases.
- Same graph, assumptions, and seed produce identical results; independent of UI state.
- Blocking an edge changes connectivity appropriately; protecting it only changes modeled disruptions in the declared way.
- No unsupported flood-map intersection is silently interpreted as an actual closure.
- Utility values are recomputed from chosen actions and are not Gemini-generated numbers.
- Bargaining solution is feasible and gives neither agency less than its disagreement utility (within numeric tolerance); if not possible, report no agreement.
- No equilibrium label unless the unilateral-deviation test passes.
- Independent, coordinated, and Nash bargaining share the same input conditions; comparison is apples-to-apples.
- Serialized output includes selected asset IDs, map geometry IDs, source provenance, units, warnings and explanation-ready fields.
- Manual use works with Gemini/ElevenLabs down, and visual simulation works without photorealistic tile service.
- A judge can select a flooded-road scenario, set budgets, run comparisons, click a recommended road, and understand the tradeoff within ~90 seconds.

## Deliverables and handoff
Submit working code, repeatable test commands with actual results, API examples, a one-command local demo fixture, a short explanation of Nash bargaining vs independent best response, a screenshot or short demo if practical, and a succinct list of limitations. Update `STATUS.md` and add a handoff under `docs/handoffs/`. Commit to your assigned branch and provide the PR link. Do not mark tasks complete merely because UI looks finished.

Start now. Prefer the smallest fully integrated, mathematically honest version over feature sprawl. Ask for approval only for shared schema changes, security-sensitive actions, or true blockers; otherwise proceed autonomously.
