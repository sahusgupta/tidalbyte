# Paste into Claude Code or Codex: INFRASTRUCTURE / NETWORK

Read all authoritative docs, especially `docs/01-PRODUCT.md`, `docs/02-SYSTEM.md`, `docs/06-API-CONTRACTS.md`, `docs/05-TEAM-PROTOCOL.md` and `STATUS.md`. Own `apps/api/app/routes/network.py`, `apps/api/app/services/network.py`, `data/fixtures/network*`.

Build a SMALL separately sourced Houston-area **illustrative connectivity network** with source and license notes; nodes include fictional/illustrative critical service locations or independently sourced OSM POIs (label accurately). Don't use real grid lines without evidence. Build weighted networkx graph with inspect/protect/disable interventions; measure reachable facility nodes, components and weighted accessibility. Compare scenarios deterministically, show changed edges/paths via GeoJSON; do not claim physical power-grid cascade or true flood conditions.

For game theory add a modest, explicit TWO-AGENCY strategic budget-allocation module only after P2 works. Define actions, budgets, utility functions, independently optimal vs coordinated outcomes; produce a payoff table with clear hypothetical assumptions and at least one test. Don't relabel pure optimization as game theory.

Implement `/api/v1/network`, `/api/v1/network/compare`, write tests for disconnect and edge-protection effects, document limitations and provenance. Deliver PR and handoff; never modify global contracts without approval.
