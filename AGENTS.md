# EarthLab Agent Operating Contract (read before any task)

You are working on **EarthLab**, a multi-person hackathon project distributed across separate computers and concurrent Codex/Claude sessions. This file applies to EVERY coding session.

## Mandatory reading, in order
1. `docs/00-START-HERE.md`
2. `docs/01-PRODUCT.md`
3. `docs/02-SYSTEM.md`
4. `docs/06-API-CONTRACTS.md`
5. `docs/05-TEAM-PROTOCOL.md`
6. `STATUS.md` and `DECISIONS.md`
7. Your assigned `prompts/*.md`; frontend also `docs/04-DESIGN.md` and `$interface-craft` skill.

## Top-level mandate
Produce a coherent, **working**, demo-ready disaster-impact planning prototype. The global photorealistic Earth is a visual navigational layer; ONLY the Houston-region supported weather/outage analysis is data-grounded. Weather effects and graph interventions are illustrative unless explicitly validated and sourced. Do not exaggerate predictive accuracy or safety readiness.

## Non-negotiable rules
- **Git is the synchronization boundary** between machines. Never assume another session sees your uncommitted files or chat context. `git fetch` before implementing/merging. Read `STATUS.md` after pulling. All agent context lives in versioned files.
- Do not change other workstreams' owned files or shared contracts without a written proposal in `docs/proposals/` and lead approval. If blocked, stub to contract; note issue in your PR.
- DO NOT commit secrets, raw large geodata, pretrained weights from third parties, downloads or `.env`. Commit small sample fixtures and metadata only.
- Prefer a working vertical slice and accurate labels over incomplete breadth. Do not implement additional disasters just to look impressive.
- No unnecessary auth/payment/SaaS landing pages. `/` opens the simulation console and guided demo.
- Gemini may **propose** commands but does not mutate state; validate server-side. ElevenLabs provides voice I/O, never the numerical prediction.
- ML results must include model version, dataset provenance, temporal/event-held-out evaluation and baseline. Fallback is transparent, not labeled ML.
- Google Photorealistic 3D Tiles are for DISPLAY ONLY; do not scrape, cache, extract roads/terrain, or train on them. Maintain Google/Cesium attribution and read provider terms.
- All UI work MUST use the installed `$interface-craft` skill. If unavailable on a machine, read the bundled snapshot `skills/interface-craft/SKILL.md` and install it locally. Explicitly apply its design-review stages; don't fake skill invocation.
- Keep current production demo reproducible. Tests/README setup must work on a clean clone. If APIs fail, show `Offline example` state with canned fixture.
- Every completed task ends with: files changed, commands run, tests passed/failed, API/model dependencies, PR link or branch name, and handoff notes.

## Stop/go priorities
P0: rotating Cesium globe + one-click Houston scene + mocked county risk overlay.
P1: documented, trained conditional outage severity model + real API overlay.
P2: infrastructure connectivity graph + interventions + before/after.
P3: Gemini command proposals, ElevenLabs STT/TTS, polished presentation.
If behind, cut P3 before compromising P0/P1.

## Working commands expected once scaffold exists
- `pnpm install && pnpm --filter web dev`
- `pnpm typecheck && pnpm test`
- `python -m pytest apps/api/tests ml/tests`
- `python ml/train.py --config ml/config.yaml`

When commands do not exist yet, lead owns creating them. Do not invent successful test results.
