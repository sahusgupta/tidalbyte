# EarthLab

EarthLab opens on the Houston Disaster Atlas. Draw a hypothetical hurricane track
or flood footprint, inspect a sample road, and compare the connectivity of the
edited network with its baseline. The local demo needs no keys. County outage
values come from a labeled fixture until a trained model is connected.

## Run locally

Use Node **22.16.0**, pnpm **10.12.1**, and Python **3.13**. Git is the team
synchronization boundary. Pull before starting and read `AGENTS.md`, `STATUS.md`,
`DECISIONS.md` and your assignment in `prompts/`.

```sh
git pull --ff-only
corepack enable
corepack prepare pnpm@10.12.1 --activate
pnpm install --frozen-lockfile
python -m venv .venv
```

Install Python dependencies using the matching platform command:

```powershell
# Windows PowerShell
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
```

```sh
# macOS / Linux
.venv/bin/python -m pip install -r requirements.lock
```

Then start both services from the repository root:

```sh
pnpm dev
```

Open [the console](http://127.0.0.1:5173/) and [API docs](http://127.0.0.1:8000/docs).
`pnpm dev` selects the repository's `.venv` automatically. Web only:
`pnpm --filter web dev`; API only: `pnpm dev:api`.
No `.env` or provider credentials are required for this scaffold. To change local
configuration, copy `.env.example` to `.env`; Vite reads root frontend variables.
For API environment overrides, export variables in the launching shell (the API
also accepts the documented Uvicorn `--env-file .env` option if python-dotenv is
installed separately). Server secrets must never use the `VITE_` prefix.

## Try the atlas

1. Open the console and select a Houston road to inspect its provenance and
   intersection with the drawn scenario.
2. Choose **Edit track** to move a storm waypoint, then scrub the timeline.
   In **Flood**, place and resize the illustrative footprint.
3. Open **Baseline vs alternative** to compare the effects of a hypothetical closure.
4. Choose **Earth** for the geographic overview, select a study zone, and return
   to the Houston editor when ready.

The [frontend walkthrough](apps/web/README.md) includes controls, screenshots,
imagery provenance, and optional service contracts.

The polygons are original schematic rectangles, not official county boundaries.
The arbitrary event timestamp and severity indices do not describe observed
weather or outages. See `data/fixtures/README.md` for provenance and limitations.

## Verify

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm contracts:check
pnpm openapi:check
python scripts/validate_kit.py
```

`pnpm test` runs web tests and Python API/contract/ML-guard tests using `.venv`.
For the original direct Python command, activate `.venv` first, then run
`python -m pytest apps/api/tests ml/tests`. The API docs are generated from the
runnable skeleton; schema drift is checked in CI. Regenerate after approved
contract edits with `pnpm contracts:generate` and `pnpm openapi:generate`.

```sh
python ml/train.py --config ml/config.yaml
```

Training deliberately exits **2** until the ML owner implements and validates a
real pipeline with verified data. It writes no fabricated model or metrics.

## Team handoff

- Lead: root configuration, `packages/contracts`, schemas, CI and integration.
- Frontend: `apps/web/**`; implement the frontend prompt after pulling bootstrap.
- ML/data: `ml/**`, provenance and prediction/model service paths.
- Infrastructure: network routes/service and independently sourced graph fixture.
- AI/voice: interpretation/voice routes and provider services.

Only prompt 00 has been executed. Future feature prompts remain separate tasks.
Read `docs/05-TEAM-PROTOCOL.md` before branching; use isolated worktrees on a shared
machine. Shared wire changes require a proposal and lead approval. All UI work
must read and apply the installed `$interface-craft` skill and `docs/04-DESIGN.md`.

See `contracts/README.md`, `docs/09-SETUP-DEPLOY.md`, `STATUS.md` and
`docs/handoffs/bootstrap-lead.md` for exact integration state and remaining work.
