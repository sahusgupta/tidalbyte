# Command review

The atlas sends a typed request to `POST /api/v1/ai/interpret` with the current versioned scenario. The response is a proposal. The bar validates the response envelope, Houston region, scenario version, arguments and enabled controls. Confirm repeats validation against the latest scenario before dispatching a command once.

The current UI accepts Houston recentering, a county evaluation of the supported preset, and visibility changes for `roads`, `hazard` and `outages`. Geometry and closure changes use the manual editor. Unsupported, stale or unavailable commands leave the map untouched.

Voice uses microphone permission requested by the Record button. Stop posts the recording as multipart field `audio` for transcription. Cancel discards it. Capture is limited to 20 seconds and 10 MB. The transcript uses the same proposal and confirmation path as typed input. Provider secrets belong on the server.

See [the atlas handoff](../../../README.md) for the county and network contracts, fixture provenance and verified demo flows.
