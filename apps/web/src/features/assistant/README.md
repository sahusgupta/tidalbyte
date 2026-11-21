# Command review

The atlas sends a typed request to `POST /api/v1/ai/interpret` with the current versioned scenario. The response is a proposal. The bar validates the response envelope, Houston region, scenario version, arguments and enabled controls. Confirm repeats validation against the latest scenario before dispatching a command once.

The bar accepts only actions enabled by its host: Houston recentering, a supported preset, a conditional county evaluation, explicit overlay visibility, and the evidence view. The published backend proposes county-overlay visibility only; its `{visible}` arguments map to `outages`. Geometry and closure changes use the manual editor. Unsupported, stale or unavailable commands leave the map untouched.

Voice uses microphone permission requested by the Record button. Stop posts the recording as multipart field `audio` for transcription. Cancel discards it. Capture is limited to 20 seconds and 4 MiB, matching the server. The transcript remains editable and requires a separate **Propose** action before interpretation. No transcription automatically requests or executes a command. An empty transcript leaves typed controls available.

Provider and offline warnings remain visible. When ElevenLabs is unavailable, the backend can return fixed sample text unrelated to the recording; the UI labels that sample before review. Interpretation warnings distinguish Gemini from the built-in offline interpreter. The published county-only `{visible}` overlay command maps only to the enabled `outages` layer; other overlay commands require explicit allowlisted IDs. The interpreter request allows 12 seconds for the server's 8-second provider deadline, and transcription allows 20 seconds for its 12-second deadline. Provider secrets belong on the server. TTS remains unavailable; this UI does not imply narration is configured.

See [the atlas handoff](../../../README.md) for the county and network contracts, fixture provenance and verified demo flows.
