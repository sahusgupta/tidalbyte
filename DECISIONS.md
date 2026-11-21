# Architecture Decision Log

- ADR-001: Desktop-first standalone React web application; no SaaS marketing site.
- ADR-002: CesiumJS global Earth view; Google Photorealistic 3D Tiles OPTIONAL visual layer only; standard Cesium fallback.
- ADR-003: Day-one hazard limited to **historical weather-warning-associated county outage severity** in Houston region; not global multi-hazard simulation.
- ADR-004: scikit-learn CPU gradient-boosted regression; event/time-held-out test and baseline; selection bias disclosed.
- ADR-005: Independent illustrative graph connectivity; no false electric-network topology or asset-level claims.
- ADR-006: Gemini structured commands + ElevenLabs voice; both optional to run core demo.
- ADR-007: `$interface-craft` governs frontend design with EarthLab-specific art direction.
- ADR-008: Multiple computers collaborate by GitHub branches/PRs only; owner-specific paths; lead approves shared schema changes.
- ADR-009: UI, model and API explicitly identify historical vs hypothetical vs mock outputs.

Record any change as ADR-010+ with date, reason, effect on API, and lead approval.

- ADR-010 (2026-11-21, lead approved): Freeze wire contracts v1.0.0 in the
  initial lead bootstrap. JSON Schema remains canonical; deterministic generators
  produce TS/Pydantic shapes and canonical validation enforces format/array
  constraints at runtime. See `docs/proposals/001-bootstrap-contracts.md`.
- ADR-011 (2026-11-21, lead approved): Bootstrap is offline-example only. Original
  schematic Houston-area rectangles and arbitrary severity indices exercise the
  data path without claiming a historical case or trained estimator. ML training
  fails closed; graph/AI/voice endpoints return 503 pending their own workstreams.
  No API keys are required for the initial application.
- ADR-012 (2026-11-21, lead approved): Verification targets Node 22.16.0,
  pnpm 10.12.1 and Python 3.13, with committed dependency locks. Bundle Natural
  Earth II imagery and Cesium workers locally for provider-independent display.
  Vercel configuration is a template only; no deployment is created by bootstrap.
- ADR-013 (2026-11-21, lead approved). Allocation v1.1 uses the existing five-link Houston planning graph. Explicit scenario assumptions determine edge status. A drawn footprint marks exposure. The graph owner implements bounded portfolio enumeration, verifies independent outcomes, and returns disagreement when no feasible portfolio improves both agencies' utilities. The atlas displays the computed paths and utility scores. See the [allocation proposal](docs/proposals/allocation-module.md).
- ADR-014 (2026-11-21, lead approved). Regional AquaGrid builds and trained models are reproducible local artifacts. A new machine prepares missing regions sequentially. The destination catalog excludes one mislocated hospital source record using its provider identity and erroneous location. Simulator routing remains a hypothetical service independent of the allocation fixture.
