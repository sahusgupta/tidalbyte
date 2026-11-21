# Proposal 002 · Infrastructure integration

Approved by the EarthLab lead on 2026-11-21 for the graph workstream branch.

- Pin NetworkX 3.5 in the root Python requirements and lock. The graph
  loads NetworkX on demand and returns a 503 if the environment is incomplete.
- Approve two additive graph routes for UI consumers. POST
  /api/v1/network/preview takes NetworkCompareRequest and returns a GeoJSON
  FeatureCollection with before/after activity, bridge flags and access paths.
  GET /api/v1/network/strategy returns a fixed two-agency example with a
  payoff table, pure Nash equilibria and joint-payoff maxima.
- Publish the regenerated OpenAPI with the graph response shapes. GET /network and POST
  /network/compare now return success responses for their existing inputs.
  The comparison uses the frozen PlanComparison shape.
- Coordinate map and inspector integration with the globe owner after approval.

See the [graph handoff](../handoffs/graph-infra-game-theory.md) for the
implementation, semantics and reproducible example.
