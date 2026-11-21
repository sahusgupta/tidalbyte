# Proposal 002 · Infrastructure integration

Status is pending lead approval.

- Add NetworkX 3.5 to the root dependency input and regenerate the Python lock
  on the repository's target runtime. The graph currently loads this optional
  dependency on demand and returns a 503 when it is missing.
- Approve two additive graph routes for UI consumers. POST
  /api/v1/network/preview takes NetworkCompareRequest and returns a GeoJSON
  FeatureCollection with before/after activity, bridge flags and access paths.
  GET /api/v1/network/strategy returns a fixed two-agency example with a
  payoff table, pure Nash equilibria and joint-payoff maxima.
- Review the versioned example payloads and publish the regenerated OpenAPI
  after the response shapes are approved. GET /network and POST
  /network/compare now return success responses for their existing inputs.
  The comparison uses the frozen PlanComparison shape.
- Coordinate map and inspector integration with the globe owner after approval.

See the [graph handoff](../handoffs/graph-infra-game-theory.md) for the
implementation, semantics and reproducible example.
