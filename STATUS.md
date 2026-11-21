# EarthLab Status

Updated: 2026-11-21. **Prompt 00 lead bootstrap only**; verification in progress
on `integrate/bootstrap`, not yet published to main.

| Workstream | Owner | Branch | Status | Next integration |
|---|---|---|---|---|
| Lead/contracts/CI | Codex lead | integrate/bootstrap | Scaffold implemented; final browser/clone checks underway | Publish verified bootstrap |
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
- Clean-clone and final responsive/offline checks still pending this commit.

## Limits and team barrier

No real historical warning dataset, trained estimator, graph computation, Gemini,
ElevenLabs or Google tiles are enabled. The fixture event/time/indices are
arbitrary; polygons are schematic, not official boundaries. Training intentionally
exits2 without writing artifacts. No provider credentials are needed.

Do not begin independent feature work until the lead publishes this scaffold to
main. Teammates then fetch/pull and read this file, DECISIONS and their own prompt.
A second physical machine and deployed-host rehearsal remain unverified. This
bootstrap does not meet the complete product definition of done.
