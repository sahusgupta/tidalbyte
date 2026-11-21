# EarthLab Status

Updated: 2026-11-21. **Prompt 00 lead bootstrap only**, verified locally and in a
fresh isolated clone. Integration branch: `integrate/bootstrap`.

| Workstream | Owner | Branch | Status | Next integration |
|---|---|---|---|---|
| Lead/contracts/CI | Codex lead | integrate/bootstrap → main | Bootstrap complete | Teammates pull the scaffold commit |
| Globe/UI | unassigned feature owner | — | Lead's initial keyless globe/mock overlay only | prompts/01-FRONTEND-GLOBE.md |
| ML/data | unassigned | — | Fail-closed placeholder; no model or verified data | prompts/02-ML-DATA.md |
| Infrastructure/graph | unassigned | — | 503 route stubs only | prompts/03-INFRA-GAME-THEORY.md |
| AI/voice | unassigned | — | 503 route stubs only | prompts/04-GEMINI-ELEVENLABS.md |

## Contracts

v1.0.0 bootstrap freeze: `contracts/*.schema.json`, generated TS/Pydantic shapes,
and exported OpenAPI. See `contracts/README.md` and approved proposal001.
Scenario and envelope validation reject unsupported input; example evaluation
preserves mode, provenance and severity-only scope. Subsequent wire changes
require lead approval and consumer acknowledgement.

## Current evidence

- Integrated typecheck, five web tests and 53 Python tests passed.
- Production build passed with lazy Cesium chunk-size warning.
- Browser found and repaired misplaced static assets; Earth now renders locally.
- API-backed Run example visibly reports API connected and remains OFFLINE EXAMPLE.
- Browser checked 390x844, 768x1024, 1280x720 and 1440x900; county inspection,
  Houston shortcut/flight and actual API-unavailable production fallback work.
- Fresh isolated clone passed frozen installs, typecheck, all 58 tests, build,
  contract/OpenAPI drift checks and kit validation; web/API boot and HTTP checks
  passed for health/readiness, all three fixture counties and real imagery XML.

## Limits and team barrier

No real historical warning dataset, trained estimator, graph computation, Gemini,
ElevenLabs or Google tiles are enabled. The fixture event/time/indices are
arbitrary; polygons are schematic, not official boundaries. Training intentionally
exits2 without writing artifacts. No provider credentials are needed.

This is the lead scaffold barrier once this commit is available on main.
Teammates fetch/pull main, then read this file, DECISIONS and their own prompt.
A second physical machine and deployed-host rehearsal remain unverified. This
bootstrap does not meet the complete product definition of done.
