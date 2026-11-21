# Prompt 04 handoff

Branch `feat/voice-gemini-elevenlabs` starts from the merged lead scaffold.
FastAPI already mounts both routers. The implementation uses the existing
Python lock. Live providers read `GEMINI_API_KEY` and `ELEVENLABS_API_KEY` from
the server process and use [Gemini 3.5 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)
and [ElevenLabs Scribe v2](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).
Provider attempts have a 12-request rolling minute cap per process per provider,
with deadlines of 8 seconds for Gemini and 12 seconds for ElevenLabs. No retries.
Provide a deployment-wide rate limit if the API runs across multiple workers.

## Browser integration

1. Let users type a command or submit a push-to-talk recording as a single
   multipart file field named `audio` to `POST /api/v1/voice/transcribe`.
   MediaRecorder WebM, Ogg, WAV, and MP4 uploads are supported up to 4 MiB.
   Let the browser set the multipart boundary. Display `data.transcript` for
   review and editing before the user submits it as a command. Leave the typed
   controls available for empty transcripts, 413, 422, and 429 responses.
2. Send `{text, scenarioSummary}` to `POST /api/v1/ai/interpret` using the
   complete current Scenario. Display any `data.clarifications` and the
   response's `meta.warnings`. The offline interpreter covers a fixed set of
   demo phrases. Keyless or failed transcription returns a fixed **OFFLINE
   EXAMPLE** transcript, independent of the recording. Label it visibly as
   sample text and let the user choose whether to submit or replace it.
3. Reject a proposal if its `scenarioVersion` differs from the active version
   when shown or applied. For `requiresConfirmation: true`, require an
   explicit click. Use the existing manual command or evaluation path and its
   validation. The AI endpoint only returns proposals.

| Proposal | Arguments | Consumer mapping |
| --- | --- | --- |
| `SELECT_REGION` | `{regionId: "houston-gulf-coast"}` | Fly to Houston |
| `SELECT_PRESET` | `{presetEventId}` | Select the published offline preset |
| `TOGGLE_OVERLAY` | `{visible: boolean}` | Show or hide the county overlay |
| `RUN_ANALYSIS` | `{}` | Confirm, then evaluate the active scenario |
| `EXPLAIN_RESULT` | `{}` | Open the existing scope or evidence card |

Try “Show the Houston offline example”, “Compare the county modeled severity”,
or “Explain what the model actually predicts”. “Show it” asks for clarification.
The historical-warning and illustrative-link demo requests return explicit
unavailable messages while the verified-event and graph workstreams are pending.
Model parameter edits and network comparisons require trusted catalogs and
validators from those workstreams before enablement. All scenario data still
comes from the lead's offline fixture, even with live provider credentials.

## Verification and merge

The full Python suite passed 76 tests on Python 3.12.14 with the repository's
pinned dependencies. `python scripts/validate_kit.py` passed. The API tests
exercise the keyless flow and use HTTP transport mocks for provider calls.
Live calls need a credentialed demo rehearsal. Optional text-to-speech remains
reserved, and browser record/review/confirm UI belongs to Globe/UI. Lead approval
and regeneration for the OpenAPI export are tracked in
[proposal 002](../proposals/002-ai-voice-openapi.md).
