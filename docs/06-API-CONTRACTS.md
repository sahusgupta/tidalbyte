# Shared Contracts v1 (freeze before coding)

Coordinates are WGS84 longitude/latitude in degrees `[lon, lat]` for GeoJSON. Store user-facing event timestamps in ISO 8601 UTC. `scenarioVersion` increments for any changed control. Every numerical output includes units, data mode and provenance.

## Core request / response
```
Scenario {
  id: string; regionId: 'houston-gulf-coast';
  presetEventId: string; scenarioVersion: number;
  selection: { countyFips: string[]; warningTypes: string[]; eventTimeUtc: string };
  perturbations?: Record<string, number>;  // only allowlisted, validated feature keys
  modelMode: 'historical_context'|'exploratory_what_if';
}
Prediction {
  countyFips: string; predictedSeverity: number; severityUnit: string;
  modelVersion: string; dataMode: 'trained_conditional'|'offline_example';
  scope: 'selected_positive_outage_warning_hours';
  baselineSeverity?: number; notes: string[]; sourceIds: string[];
}
Intervention {
  id: string; graphEdgeIds: string[]; graphNodeIds: string[];
  action: 'protect'|'disable'|'inspect'; budgetUnits?: number;
}
PlanComparison {
  baseline: { reachableFacilities: number; connectedComponents: number; weightedAccessScore: number };
  proposal: { reachableFacilities: number; connectedComponents: number; weightedAccessScore: number };
  limitations: string[]; graphSource: string; mode: 'hypothetical_connectivity';
}
```

## Allowlisted Gemini command proposal
```
{ commandId:string, scenarioVersion:number, action:
 'SELECT_REGION'|'SELECT_PRESET'|'SET_PARAMETER'|'RUN_ANALYSIS'|'TOGGLE_OVERLAY'|'COMPARE_INTERVENTION'|'EXPLAIN_RESULT',
 args: object, requiresConfirmation:boolean, clarification?:string }
```
Neither Gemini nor ElevenLabs may commit changes automatically. Validate county IDs, known event IDs, numeric parameter bounds, size limits, authorization/cost, and that a requested action is supported. Ambiguous references require clarification.

## Endpoints (lead writes OpenAPI, other sessions use it)
- `GET /healthz`, `GET /readyz`
- `GET /api/v1/catalog/regions` -> available region presets and source credits
- `GET /api/v1/catalog/events?regionId=...` -> historical warning case IDs + dates
- `GET /api/v1/geo/counties?regionId=...` -> small GeoJSON + attribution
- `POST /api/v1/scenarios/evaluate` (Scenario) -> `{scenario, predictions:Prediction[], modelMetadata, disclaimers}`
- `GET /api/v1/models/current` -> target/unit/splits/baseline metrics/limitations
- `GET /api/v1/network?regionId=...` -> illustrative/source-aware GeoJSON graph
- `POST /api/v1/network/compare` -> PlanComparison
- `POST /api/v1/network/preview` -> illustrative graph features with before/after activity and access paths
- `GET /api/v1/network/strategy` -> two-agency payoffs, equilibria and joint maxima for the fixed example
- `GET /api/v1/allocation/demo` returns the seeded Houston mitigation request.
- `POST /api/v1/allocation/scenarios/evaluate` accepts an AllocationRequest and returns declared disruptions, exposure, eligible actions, baseline service access and provenance.
- `POST /api/v1/allocation/plans/compare` accepts that same request and returns the evaluation plus the three strategies, their costs and payoffs, selected edge IDs, leave-one-action-out access, and equilibrium/agreement flags. Allocation scenario version 1 identifies the supported data revision. The command controller separately tracks edits for confirmation.
- `POST /api/v1/ai/interpret` `{text,scenarioSummary}` -> structured command proposal + clarifications
- `POST /api/v1/voice/transcribe` multipart audio -> `{transcript}`
- `POST /api/v1/voice/speak` `{text}` -> audio response (optional)

## Response behavior
- All responses follow same `{data, meta, error}` envelope; `meta` contains requestId, mode (`historical_context`, `exploratory_what_if`, or `offline_example`), sourceIds and warnings.
- `422` for invalid inputs, `404` for unknown region/event, `503` for missing dependency/model, `429` for rate limit.
- Emit model features/units only from training metadata, not guessed request options.
- No job scheduler necessary for bounded small requests; longer graph runs can be future background jobs.

## Revision control
`contracts/*.schema.json` are canonical for wire shapes. This prose is explanatory. Lead updates schema and bumps versions after all consumers acknowledge.
