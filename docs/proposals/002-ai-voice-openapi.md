# Export OpenAPI for the AI and voice routes

Status: pending lead approval.

Prompt 04 enables the existing v1 `POST /api/v1/ai/interpret` and
`POST /api/v1/voice/transcribe` endpoints. Their bootstrap OpenAPI entries
document unconditional 503 responses. The runtime now documents the existing
request bodies, the 200 response envelopes, and 413 and 429 limits. Optional
speech synthesis stays reserved.

Approve regenerating the checked-in `contracts/openapi.json` with
`pnpm openapi:generate`. The canonical JSON schemas and generated type
definitions already describe the interpretation request and proposal. This
proposal adds no action or required field to either shape. The transcription
response follows the documented `{transcript}` shape inside the common envelope.

The Globe/UI owner should acknowledge the handling of nullable proposals,
scenario versions, confirmation, and offline warnings in the
[Prompt 04 handoff](../handoffs/voice-gemini-elevenlabs.md). The approval and
export are needed before the OpenAPI drift check can pass on the feature branch.
