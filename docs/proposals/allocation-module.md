# Houston allocation module

Approved for integration by the lead on November 21, 2026. The graph owner implements the optimizer, fixtures, routes and solver tests. The lead owns the shared registry, atlas and integration review. The simulator workstreams own region preparation and browser checks.

The v1.1 additive contract uses the standard envelope. `GET /api/v1/allocation/demo` returns a reproducible request. `POST /api/v1/allocation/scenarios/evaluate` derives access and the candidate catalog. `POST /api/v1/allocation/plans/compare` returns these fields plus three feasible strategies, utilities, costs, resource use, a payoff table, equilibrium verification and agreement status. Shared types live in `contracts/api.schema.json` and its generated TypeScript and Python packages.

The two agencies sponsor actions on existing `network-houston.geojson` edges. Explicit input statuses determine disruption. A circle from the atlas can tag intersecting edges as exposed. Costs, repair times, effects, demand weights and locations are illustrative. The solver enforces shared and agency budgets, shared and agency crew limits, equipment, horizon and one action per asset. Mitigation models a reduction in assumed disruption. Response models hypothetical restoration. A zero-resource portfolio stays feasible.

The independent portfolio is the disagreement point. A verified unilateral deviation check controls the equilibrium label. Coordination uses a combined utility objective. Bargaining enumerates feasible positive gains over disagreement under adjustable weights and returns the disagreement portfolio when there is no agreement.

The existing atlas displays these same graph IDs in the planning inspector, geographic overlays and intervention ledger. The assistant may propose validated edits and reads computed summaries. The atlas retains its existing drawing, county evaluation and AquaGrid paths.
