# EarthLab Status

## Storm paths and local infrastructure planning

All five Houston simulators accept a storm origin, up to seven additional waypoints and a rainfall radius. **Impact & routing** ranks nearby areas and named streets and compares drainage or pumping projects under agency budgets and crew limits. The selected event, vehicle and hospital drive the comparison. See the [scenario walkthrough](simulator/README.md#compare-infrastructure-improvements-under-an-event) and [verification and model limits](docs/handoffs/storm-footprints.md).

## Local opening performance

The landing opens before the globe loads. AquaGrid prepares its 3D buildings in a worker and makes storm controls available while the map loads. In the local Downtown benchmark the median time to the first building draw fell from 3.97 s to 1.62 s. The [performance handoff](docs/handoffs/local-opening-performance.md) records the hardware, startup timings, regional service behavior and verification commands.

## Local 3D flood simulator

Run `pnpm dev` after the [local setup](README.md#run-locally). Open the [Houston area chooser](http://127.0.0.1:5173/#/simulate). All five links open AquaGrid with the selected region's streets and extruded buildings. The area chooser is the current entry point. The resource-allocation engine remains available through the EarthLab API and `pnpm demo:allocation`.

The [simulator repair handoff](docs/handoffs/repair-3d-flood-links.md) records the startup and map-rendering fixes and the ten browser cases.

## Houston planning and zones

The [resource planning integration](https://github.com/sahusgupta/tidalbyte/pull/5) adds mitigation and response to the Houston atlas. Open **Study menu → Resource planning**, or run `pnpm demo:allocation` for both cases. The [planning handoff](docs/handoffs/houston-resource-planning.md) covers the API, computed example, desktop and touch controls, tests and model assumptions.

All eight desktop and emulated-touch cases passed for Medical Center, Meyerland, Ship Channel and Kingwood. Each zone opened its own region, changed modeled road and building depths during playback and submitted a single pin request that returned a route to its selected emergency facility. The five-region catalog includes Downtown. Run `python -m aquagrid.prepare_zones` from `simulator/backend` with the simulator environment on another machine. Regional flood models use a process simulator as their training target. The allocation engine uses a separate fictional five-link graph. See the [regional training handoff](docs/handoffs/houston-simulator-zones.md) and [browser checks](simulator/qa/README.md).

The current shared API version is 1.1.0. FastAPI computes the three feasible portfolios and completion frames. The command controller requires confirmation, and optional ElevenLabs narration reads the displayed result. The historical bootstrap notes below describe earlier milestones.

Updated 2026-11-21. The [integration PR](https://github.com/sahusgupta/tidalbyte/pull/4)
combines the Figma field console, the embedded flood simulator, the illustrative
graph and the command and voice services. The Houston atlas opens at `/`, Earth
at `#/earth` and study zones at `#/zone/<id>`. See the [run instructions](README.md)
and [simulator setup](simulator/README.md).

| Workstream | Owner | Branch | Status | Next integration |
|---|---|---|---|---|
| Lead/contracts/CI | Codex lead | integrate/houston-resource-planning | v1.1 allocation contracts, integrated OpenAPI and CI | Pull main before continuing a workstream |
| Globe/UI | Frontend | integrate/houston-resource-planning | Houston editor, planning inspector and playback, Earth index and five prepared simulator regions | Rebuild ignored regional artifacts on each demonstration machine |
| ML/data | ML/data | feat/ml-harvey-peak-flood | Training pipelines and evaluations merged in PR #2 | Transfer weights and connect the county model to the API. See the [ML handoff](docs/handoffs/feat-ml-harvey-peak-flood.md). |
| Infrastructure/graph | Graph | feat/graph-allocation-engine | Constrained independent, coordinated and bargaining strategies on the NetworkX fixture | See the [planning handoff](docs/handoffs/houston-resource-planning.md) |
| AI/voice | AI/voice | codex/planning-command-voice | Confirmed planning edits, transcription and optional computed-summary narration | Credentialed rehearsal for Gemini and ElevenLabs |

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
