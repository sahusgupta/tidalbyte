# Paste into Claude Code or Codex: RELEASE / QA

Read all authoritative docs and `docs/07-DEMO-QA.md`; work on integrate branch with lead approval, not concurrently rewriting other owned files.

Once main has merged P0/P1: verify clean-clone build, CORS, model metadata, trained-vs-demo labeling, map attributions, no leaked keys, graph scenario claims, voice fallback, mobile explanatory fallback and performance. Open URL on a teammate's laptop, rehearse full 90-second scripted demo, collect screenshots and a short fallback video. If blocker arises, fix only own/integration files or assign owner a small PR.

Prepare `docs/SHOWCASE.md`: problem, dataset, ML algorithm, validation metric vs baseline, game-theory mechanism if implemented, role of Gemini, role of ElevenLabs, limitations, reproducibility and credits. Update STATUS and release checklist with truthfully tested evidence.
