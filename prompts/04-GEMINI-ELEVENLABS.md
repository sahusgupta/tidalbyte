# Paste into Claude Code or Codex: GEMINI + ELEVENLABS

Read `AGENTS.md`, `CLAUDE.md`, specs, contracts, STATUS and team protocol. Own `apps/api/app/routes/interpret.py`, `voice.py`, `apps/api/app/services/ai.py`, `speech.py`.

Build typed-only and push-to-talk voice flows. ElevenLabs STT -> transcript; Gemini function call/structured interpretation -> allowlisted command proposal; application validates everything and makes user click confirm if high-impact. Optionally ElevenLabs TTS narrates a short evidence-grounded analysis. NEVER put secret keys client-side or use Gemini to invent predicted values, road closures or utility asset statuses.

Sample commands: 'Show the Houston historical warning event', 'Compare the county modeled severity', 'What changes if we prioritize inspecting this illustrative link?', 'Explain what the model actually predicts.' Ambiguous targets -> clarification, unavailable scenario -> explicit unsupported. Provide mocked integrations when API keys absent, but always label mock text. Respect quota/latency and upload size cap.

Implement `/api/v1/ai/interpret`, `/api/v1/voice/transcribe`, optional `/api/v1/voice/speak`; tests on command validation, unsafe actions, missing secrets and provider failures. Do not modify frontend/shared types unilaterally. PR and handoff.
