# EarthLab Status

## Houston planning and zones

The [resource planning integration](https://github.com/sahusgupta/tidalbyte/pull/5) adds mitigation and response to the Houston atlas. Open **Study menu → Resource planning**, or run `pnpm demo:allocation` for both cases. The [planning handoff](docs/handoffs/houston-resource-planning.md) covers the API, computed example, desktop and touch controls, tests and model assumptions.

The four additional AquaGrid regions have local geography, full-default trained surrogate models and checked regional hospital destinations. The five-region catalog includes Downtown. Run `python -m aquagrid.prepare_zones` from `simulator/backend` with the simulator environment on another machine. Large artifacts stay local. Regional flood models use a process simulator as their training target. The allocation engine uses a separate fictional five-link graph.

The current shared API version is 1.1.0. FastAPI computes the three feasible portfolios and completion frames. The command controller requires confirmation, and optional ElevenLabs narration reads the displayed result. The historical bootstrap notes below describe earlier milestones.

Updated 2026-11-21. The [integration PR](https://github.com/sahusgupta/tidalbyte/pull/4)
combines the Figma field console, the embedded flood simulator, the illustrative
graph and the command and voice services. The Houston atlas opens at `/`, Earth
at `#/earth` and study zones at `#/zone/<id>`. See the [run instructions](README.md)
and [simulator setup](simulator/README.md).

| Workstream | Owner | Branch | Status | Next integration |
|---|---|---|---|---|
| Lead/contracts/CI | Codex lead | codex/houston-atlas-redesign | Combined OpenAPI and CI for both web applications | Pull main before continuing a workstream |
| Globe/UI | Frontend | feat/globe-sharp-zoom-sim and codex/houston-atlas-redesign | Houston editor, Earth index, five simulator zone links and optional full-stack launcher | Prepare the regions needed for the demo |
| ML/data | ML/data | feat/ml-harvey-peak-flood | Training pipelines and evaluations merged in PR #2 | Transfer weights and connect the county model to the API. See the [ML handoff](docs/handoffs/feat-ml-harvey-peak-flood.md). |
| Infrastructure/graph | Graph | feat/graph-infra-game-theory | NetworkX fixture, comparison, preview and two-agency game | See the [graph handoff](docs/handoffs/graph-infra-game-theory.md) |
| AI/voice | AI/voice | feat/voice-gemini-elevenlabs | Validated proposals, transcription, labeled keyless examples, optional live providers | Credentialed rehearsal for Gemini and ElevenLabs. Speech synthesis remains reserved |

## Contracts

v1.0.0 bootstrap freeze: `contracts/*.schema.json`, generated TS/Pydantic shapes,
and exported OpenAPI. See `contracts/README.md` and approved proposal001.
Scenario and envelope validation reject unsupported input; example evaluation
preserves mode, provenance and severity-only scope. Subsequent wire changes
require lead approval and consumer acknowledgement.

## Prompt 00 verification

- Integrated typecheck, five web tests and 53 Python tests passed.
- Production build passed with lazy Cesium chunk-size warning.
- Browser found and repaired misplaced static assets; Earth now renders locally.
- API-backed Run example visibly reports API connected and remains OFFLINE EXAMPLE.
- Browser checked 390x844, 768x1024, 1280x720 and 1440x900; county inspection,
  Houston shortcut/flight and actual API-unavailable production fallback work.
- Fresh isolated clone passed frozen installs, typecheck, all 58 tests, build,
  contract/OpenAPI drift checks and kit validation; web/API boot and HTTP checks
  passed for health/readiness, all three fixture counties and real imagery XML.

## Limits at the prompt 00 handoff

No real historical warning dataset, trained estimator, graph computation, Gemini,
ElevenLabs or Google tiles are enabled. The fixture event/time/indices are
arbitrary; polygons are schematic, not official boundaries. Training intentionally
exits2 without writing artifacts. No provider credentials are needed.

This is the lead scaffold barrier once this commit is available on main.
Teammates fetch/pull main, then read this file, DECISIONS and their own prompt.
A second physical machine and deployed-host rehearsal remain unverified. This
bootstrap does not meet the complete product definition of done.
