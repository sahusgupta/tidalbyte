# Team Protocol: Multiple Computers, Multiple Agents

## One authoritative repo
GitHub is the **only** shared current state. The other computer cannot see this computer's files, prompts or chats until committed/pushed and pulled. Team members should be added as repository collaborators, then clone.

## Lead-first scaffold barrier
Lead pushes root `AGENTS.md`, `CLAUDE.md`, spec docs, contracts, skeleton, test commands, and a sample fixture to `main`. **Only after this commit** do parallel workstreams begin. Each teammate runs `git pull --ff-only` and reads STATUS/DECISIONS before starting.

## Stable ownership and branches
| Workstream | Branch prefix | Owned paths |
|---|---|---|
| Lead/integration | `integrate/*` | root config, `packages/contracts`, `.github`, STATUS, DECISIONS, CI |
| Globe/UI | `feat/globe-*` | `apps/web/**` |
| Data/ML | `feat/ml-*` | `ml/**`, `data/provenance/**`, `apps/api/app/routes/predict.py`, `apps/api/app/services/model.py` |
| Graph/analysis | `feat/graph-*` | `apps/api/app/routes/network.py`, `apps/api/app/services/network.py`, `data/fixtures/network*` |
| Voice/Gemini | `feat/voice-*` | `apps/api/app/routes/interpret.py`, `voice.py`, `apps/api/app/services/ai.py`, `speech.py` |
Shared schema edits need lead signoff and an explicit PR; do not edit another owner's files.

## Lifecycle for every session
1. `git fetch origin && git checkout main && git pull --ff-only` (or current feature branch rebase carefully), read `STATUS.md`, `DECISIONS.md`, contracts and assignment prompt.
2. `git switch -c feat/<task>-<developer>`; work only in owned paths. Use small commits.
3. Run actual tests and manually inspect output. Do NOT state tests passed unless run.
4. Push and open PR with changed files, API dependencies, screenshots or sample outputs, metrics/provenance if ML, test commands/results, warnings.
5. Lead reviews/merges; teammates fetch merged main. Before relying on a contract update, pull and re-run tests.
6. Integrator updates STATUS, prioritization, and demo risk continuously; agents use those files on every fresh turn.

## Concurrent session conflict safeguards
- Prefer individual clones on separate machines. If multiple agents share ONE working directory, use `git worktree add ../earthlab-ui -b feat/globe... main` etc. Never run separate agents on the same dirty branch.
- APIs/types frozen in `contracts/`; unknown fields should error clearly or be optional within contract. No silent reinterpretation.
- Use fixtures for incomplete services rather than blocking UI. Each module has a mock adapter and an integration test.
- The lead is the only person to touch merge conflicts and release branch.
- Never let coding agents create GitHub PRs or access secrets without proper authorization from the human repo owner; if not configured, provide terminal commands instead.

## Suggested cadence
- T+0–30 min: lead scaffolds, defines one typed scenario fixture and API response, assigns roles.
- T+30–150: UI globe mock, dataset inspection/train baseline, graph fixture, voice mocks in parallel.
- T+150–300: real model connected to county overlays; graph connected; voice command UI connected.
- T+300–450: harden deployments, provenance, performance, one-end-to-end judge script.
- Last 90 min: no new scope; test demo and backup recording.
These are target windows, not a guaranteed schedule.

## Cross-team messaging
Write short durable handoffs to `docs/handoffs/<branch>.md` and PR descriptions. Communicate breaking changes in team chat **and** commit contracts. Chats alone are not state.
