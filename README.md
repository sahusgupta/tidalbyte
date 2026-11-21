# EarthLab | Shared Claude + Codex Hackathon Launch Kit

**One repo. One specification. Multiple machines.**

EarthLab is a desktop-first browser-based 3D disaster-impact planning prototype. A user navigates Earth, selects a supported historical weather-warning scenario in the Houston region, visualizes a **trained model's conditional county-level outage-severity estimate**, explores an illustrative infrastructure-connectivity network, and compares bounded mitigation/inspection strategies. Gemini interprets requests and produces evidence-linked explanations; ElevenLabs transcribes voice requests and optionally narrates the report.

## Five-minute launch
1. Create a **private GitHub repository**, commit this entire folder at the repository root. Do not commit credentials or large raw datasets.
2. Every teammate clones the **same repository URL** on their own laptop. All agents read `AGENTS.md`, `CLAUDE.md`, and `docs/00-START-HERE.md` before touching code.
3. Lead runs `prompts/00-LEAD.md` **first** on `main` (bootstrap contracts/scaffold/CI). Commit and push. Teammates pull before starting.
4. Each teammate creates a feature branch according to `docs/05-TEAM-PROTOCOL.md`, runs one ownership-specific prompt (`prompts/01`–`05`), and opens a PR. Lead merges in dependency order.
5. UI engineer installs/uses `$interface-craft` and follows `docs/04-DESIGN.md`. All other contributors must preserve its visual system.
6. Lead maintains `STATUS.md` and `DECISIONS.md` in `main`. **AI sessions cannot automatically know about changes on other machines:** they must `git fetch` and read tracked docs at start, before integrations, and after merges.
7. Configure `.env` from `.env.example`; obtain Cesium/Google 3D tile permissions and Gemini/ElevenLabs keys. Run the deterministic offline demo even if these APIs aren't ready.

## Kit map
- `AGENTS.md` = authoritative agent instructions for Codex and other tools.
- `CLAUDE.md` = Claude-specific boot instructions, same authority as AGENTS.
- `docs/00-START-HERE.md` = project contract / acceptance checks.
- `docs/01-PRODUCT.md` = scope, behavior, safety and copy.
- `docs/02-SYSTEM.md` = end-to-end architecture and data flow.
- `docs/03-ML-DATA.md` = concrete training task, leakage controls, metrics, provenance.
- `docs/04-DESIGN.md` = `$interface-craft`-driven EarthLab art direction.
- `docs/05-TEAM-PROTOCOL.md` = Git, branches, worktrees, handoff rules.
- `docs/06-API-CONTRACTS.md` = shared schemas and endpoints.
- `docs/07-DEMO-QA.md` = demo narrative, failure modes, quality gates.
- `docs/08-SOURCES.md` = public-source/data links and licenses to review.
- `prompts/` = paste-ready independent Claude/Codex workstream assignments.
- `contracts/` = machine-readable examples for initial scaffold.
- `STATUS.md` + `DECISIONS.md` = shared coordination state. Update via Git.

## Exactly what to do now
- Lead: assign roles, verify API keys, create repo, run lead prompt.
- Frontend: globe and overlays with canned data, then real API.
- ML/data: download subset, inspect schema, train valid baseline and model, export metrics; never invent model accuracy.
- Infrastructure: network topology and bounded, clearly illustrative interventions; do not assert individual asset failures.
- Voice/AI: Gemini proposed operations + ElevenLabs transcription/speech, gated by validation.
- Integration/testing: own CI, merging, fallback demos, and presentation.

**Hackathon discipline:** No global multi-hazard physics, no unvalidated road-flood forecasts, no certified safety recommendations, and no claims that Google map imagery is training data. Keep the product playable with mocks and without external keys.
