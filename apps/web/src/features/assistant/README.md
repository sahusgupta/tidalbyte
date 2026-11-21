# Frontend services and command bar handoff

`CommandBar` is a compact instrument-style command strip. Import it from
`features/assistant/CommandBar`; its local CSS is included automatically.

```tsx
<CommandBar
  scenario={scenario}
  getCurrentScenario={() => useConsoleStore.getState().scenario}
  capabilities={{
    presetEventIds: [scenario.presetEventId],
    overlayIds: ["hurricane", "flood", "roads", "outages"],
    canRunAnalysis: true,
    canExplain: true,
  }}
  onCommand={handleApprovedCommand}
/>
```

`ApprovedCommand` accepts only Houston `SELECT_REGION`, catalogued `SELECT_PRESET`,
historical unmodified `RUN_ANALYSIS`, exact `TOGGLE_OVERLAY {overlayId, visible}`,
and enabled `EXPLAIN_RESULT`. The callback must map these to the actual controller.
Parameter edits and network interventions require separate supported UI controls.
The backend only proposes; every action requires visible confirmation, fresh
scenario/capability validation, and a unique command ID. No natural-language
parsing happens in the browser. A failed provider request produces a visible
unavailable message and never pretends that a command executed.

Voice records actual microphone audio only after the user presses Record. Stop
sends it as multipart field `audio`; Cancel discards it. The recorder caps time
at 20 seconds and data at 10 MB, releases tracks on stop/failure/unmount, and
releases late microphone grants after cancellation. The transcript goes to the
same backend interpretation/review path. Server-side provider configuration is
required; no credentials are read or exposed by these adapters.

`evaluateScenario(scenario, fetcher?, baseUrl?, signal?)` retains the original
result shape. It validates envelope, scenario identity/version, conditional
scope, units, model metadata, county selection and sources. A matching fixture
fallback is filtered to the selected counties. Altered weather inputs never
receive unrelated canned predictions. HTTP404/422 refusal and cancellation are
preserved rather than disguised as fallback success.

`fetchNetworkCatalog(regionId?, options?)` returns `status: available` with
`catalog`, or `status: unavailable` with `catalog: null`. The catalog exposes
`graphSource`, `nodeIds`, `edgeIds`, `nodes/edges: {id,name}[]`, and `geojson`.
The current wire contract leaves network GeoJSON properties open, so the adapter
requires an explicit collection `graphSource`, `sourceId`, or singleton
`sourceIds` matching envelope provenance. Point IDs and line IDs come from
`properties.nodeId/edgeId` or their explicit GeoJSON feature ID. It does not
match roads by names, coordinates, or invented ID conventions.

`compareNetwork(request, catalog, options?)` only submits IDs advertised by that
catalog and accepts a comparison whose `graphSource` matches. Results have
`status` plus `comparison` or `null`. Local illustrative roads and connectivity
numbers stay in the domain fixture and must never be submitted as backend IDs.
Use a separate selector populated from `catalog.edges` for live comparisons.

Validation at handoff: frontend typecheck and 42 unit tests passed. Production
build was started separately. Integrated browser screenshots and visual critique
belong to the lead's complete Atlas render; this component has not been claimed
visually verified in isolation. Art direction follows `$interface-craft` phases:
Houston instrument surface, restrained cartographic labels, inline review rather
than a chat bubble; keyboard labels/focus, live status, compact responsive layout,
and no decorative motion.
