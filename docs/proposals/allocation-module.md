# Houston allocation module

Approved for integration by the lead on November 21, 2026. The graph owner implements the optimizer, fixtures, routes and solver tests. The lead owns the shared registry, atlas and integration review. The simulator workstreams own region preparation and browser checks.

The v1.1 additive contract uses the standard envelope. `GET /api/v1/allocation/demo` returns a reproducible request. `POST /api/v1/allocation/scenarios/evaluate` derives access and the candidate catalog. `POST /api/v1/allocation/plans/compare` returns these fields plus three feasible strategies, utilities, costs, resource use, a payoff table, equilibrium verification and agreement status. Shared types live in `contracts/api.schema.json` and its generated TypeScript and Python packages.

The two agencies sponsor actions on existing `network-houston.geojson` edges. Explicit input statuses determine disruption. A circle from the atlas can tag intersecting edges as exposed. Costs, repair times, effects, demand weights and locations are illustrative. The solver enforces shared and agency budgets, shared and agency crew limits, equipment, horizon and one action per asset. Mitigation models a reduction in assumed disruption. Response models hypothetical restoration. A zero-resource portfolio stays feasible.

The independent portfolio is the disagreement point. A verified unilateral deviation check controls the equilibrium label. Coordination uses a combined utility objective. Bargaining enumerates feasible positive gains over disagreement under adjustable weights and returns the disagreement portfolio when there is no agreement.

The existing atlas displays these same graph IDs in the planning inspector, geographic overlays and intervention ledger. The assistant may propose validated edits and reads computed summaries. The atlas retains its existing drawing, county evaluation and AquaGrid paths.

## Confirmed planning commands and optional narration

Lead approved November 21, 2026. Existing `CommandProposal.action=COMPARE_INTERVENTION` carries either `{intent:'compare'|'prioritize_hospitals'|'assume_blocked'|'explain'}` or `{intent:'resources',totalBudget,crewCapacity}`. Budget and crew capacity are integers bounded 0–200 and 0–6. Both the server and client reject additional arguments. Planning proposals require confirmation; the client only accepts them when its host enables `canPlan`. No allocation schema or numerical solver behavior changes.

For assumed blockage, the host supplies `selectedPlanningEdge`; the command bar captures it before interpretation and rechecks it at confirmation. Changing the selected link, scenario or planning revision invalidates a pending proposal. The host includes its planning revision in scenarioVersion and applies the confirmed action. Hospital prioritization explicitly sets clinic priority 10 and caps shelter priority 3 for both agencies. Resources edits the joint budget and crew limit. Explain opens Nash bargaining’s computed explanation.

Narration uses the existing `VoiceSpeakRequest{text}` and `/api/v1/voice/speak` route. With server-only ElevenLabs key and voice ID, it returns bounded `audio/mpeg` data. Missing or invalid provider configuration returns an honest 503; it never synthesizes a fallback result. `SpeakPlanSummary` only reads the deterministic, visible text supplied by the planner. It has explicit generation/playback, cancellation, stale-text cleanup and native audio controls. Requests are limited to 2,000 characters, 15 provider seconds, 4 MiB output and the shared ElevenLabs request budget. The integrator regenerates the OpenAPI document for the binary 200 response and error statuses.

Provider API verified against the [ElevenLabs speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert). It receives the supplied text with MP3 output; Gemini never writes numerical planning results or narration text.
