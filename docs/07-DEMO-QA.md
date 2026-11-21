# Demo Script and Quality Gates

## Judge demo: 90 seconds
1. Open app immediately to beautifully rendered Earth; choose **Houston / historical severe-weather warning**.
2. Fly to region. County overlay appears with explicit legend: **conditional outage severity**; inspect county showing real source ID and trained model version.
3. Toggle an exploratory supported warning-feature scenario. Compare county severity estimates as a model sensitivity example, **not a real forecast**.
4. Turn on network layer. Disable an illustrative edge; compare how reachable critical-service nodes change; protect/inspect one link and rerun. Distinguish hypothetical graph from real utility topology.
5. Speak: 'Show me which county had the highest modeled severity and explain the limitations.' ElevenLabs transcribes; Gemini proposes a safe analysis command; results and narration appear. Fallback: type same sentence.
6. End on transparent ML evidence: train/test events, MAE vs baseline, dataset selection caveat, one failure case.

## Required test matrix
- Globe creates/destroys without crash; fly-to-Houston and drag/zoom.
- 3D Google tiles unavailable -> fallback globe remains functional, source attribution intact.
- County overlay correct WGS84 projection, legend unit, hover/click stable.
- Model metadata matches artifact, no target leakage. Held-out tests grouped by event/time. Metrics measured, not invented.
- Real model and offline fixtures visually distinguishable.
- Voice failure -> typed commands, no unvalidated model command executed.
- Hypothetical graph edges never represented as real substations or proven flood routes.
- A weather control that isn't in training features is disabled/rejected.
- 1440x900 and 1280x720 screenshot critique using `$interface-craft`; verify nondecorative controls reachable at 100% and 200% zoom.
- Mobile shows explanatory read-only fallback; app is desktop-first and no mobile editing promise.
- No API keys in client bundle, logs, PRs or screenshots.

## Critical contingency tiers
- Tier A: live Cesium + trained real-data model + graph + speech.
- Tier B: same with speech typed fallback.
- Tier C: same without Google photorealistic tiles; standard Cesium globe.
- Tier D: sample scenario explicitly marked OFFLINE EXAMPLE with recorded demo video. Do not pass examples as learned outputs.

## Five-minute deployment triage
If ML endpoint fails, check model artifact path/metadata and CORS; if tiles fail, check billing/restrictions/provider attribution; if speech fails, check server key and allow text; if visualization blank, fallback to Cesium native globe.

## Freeze rule
Last 90 minutes: no new features. Validate deployment URL on another laptop/network and rehearse the 90-second script twice.
