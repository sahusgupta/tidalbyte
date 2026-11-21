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

1. Select a road on the map to inspect its source and intersection with the scenario. Choose **Gulf approach** to edit the storm, then play or scrub the timeline.
2. Open **Compare** to inspect the local sketch. Expand **Infrastructure network** for interventions, connectivity and the two-agency protection game on its own illustrative graph.
3. Choose **Ask the atlas** to type a request or review a recording transcript. Review the proposed action before applying it. Without provider keys, the API labels its built-in command interpreter and fixed sample transcript.
4. The **Study menu** opens the Downtown **Flood simulator** or the **Earth view** with all five Houston study zones.
5. Choose **Study menu → Resource planning** for the mitigation and response scenarios. Adjust shared resources and agency preferences, compare the three strategies, then inspect the selected links on the atlas. **Before**, **After** and the play control show when each modeled action takes effect. Run both reference cases from a terminal with `pnpm demo:allocation`. See the [planning and regional verification handoff](docs/handoffs/houston-resource-planning.md).

### Run the atlas and flood simulator together

Complete the [simulator setup](simulator/README.md), then run `pnpm dev:integrated` from the repository root. This starts the atlas at [port 5173](http://127.0.0.1:5173), its API at 8000, the flood map at [port 5174](http://127.0.0.1:5174), and AquaGrid at 8001. Each frontend talks to its own API. Prepared regional data and a trained AquaGrid artifact enable flood depths, impacts and modeled hospital routes. The county example and illustrative graph run independently with `pnpm dev`.

The [frontend walkthrough](apps/web/README.md) includes controls, screenshots,
imagery provenance, and optional service contracts.

Restart the integrated launcher after changing Python code or refreshing a regional hospital catalog. The separate `pnpm dev:api` command supports automatic reload during API development.

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

`pnpm test` runs web tests and Python API, contract and ML checks using `.venv`.
For the original direct Python command, activate `.venv` first, then run
`python -m pytest apps/api/tests ml/tests`. The API docs are generated from the
runnable skeleton; schema drift is checked in CI. Regenerate after approved
contract edits with `pnpm contracts:generate` and `pnpm openapi:generate`.

```sh
python ml/train.py --config ml/config.yaml
```

Training needs the separate ML dependencies and prepared dataset. Missing inputs
produce exit code 2. The training pipelines and evaluation reports are in the
repository. The application still serves the offline county example.
See the [ML setup and artifact handoff](ml/README.md).

## Team handoff

- Lead: root configuration, `packages/contracts`, schemas, CI and integration.
- Frontend: `apps/web/**`, including the atlas and Earth index.
- ML/data: `ml/**`, provenance and prediction/model service paths.
- Infrastructure: network routes/service and independently sourced graph fixture.
- AI/voice: interpretation/voice routes and provider services.

Read `docs/05-TEAM-PROTOCOL.md` before branching. Use isolated worktrees on a shared
machine. Shared wire changes require a proposal and lead approval. All UI work
must read and apply the installed `$interface-craft` skill and `docs/04-DESIGN.md`.

See `contracts/README.md`, `docs/09-SETUP-DEPLOY.md`, `STATUS.md` and
`docs/handoffs/bootstrap-lead.md` for exact integration state and remaining work.
