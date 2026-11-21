# EarthLab

EarthLab opens on a guided introduction to Houston. Choose an area to explore
modeled flood depths on roads and 3D buildings, play a storm, or trace a
hypothetical route to a hospital. All five areas use the AquaGrid simulator.

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

To serve AquaGrid locally, complete the [simulator setup](simulator/README.md)
to install its frontend and Python dependencies. Prepare the regional data with
`python -m aquagrid.prepare_zones` from `simulator/backend` using the simulator
Python environment. Alternatively, point to a hosted AquaGrid map using
`VITE_SIMULATOR_URL`. Start the product from the repository root:

```sh
pnpm dev
```

Open [EarthLab](http://127.0.0.1:5173/), follow **Explore Houston**, and select
**Open EarthLab** to choose an area. You can also go directly to the
[five-area chooser](http://127.0.0.1:5173/#/simulate).
`pnpm dev` and `pnpm dev:integrated` run the same local stack.

| Local service | Address |
| --- | --- |
| EarthLab product site | http://127.0.0.1:5173 |
| EarthLab planning API | http://127.0.0.1:8000/docs |
| AquaGrid 3D map | http://127.0.0.1:5174 |
| AquaGrid region catalog | http://127.0.0.1:8001/api/regions |

For a hosted AquaGrid map, set `VITE_SIMULATOR_URL` to its frontend URL before
starting EarthLab. The launcher then starts only the product site and EarthLab
API. To use the local map with an existing AquaGrid backend, set `AQUAGRID_API`
to its origin. The launcher reads these settings from the shell or a root
`.env.local` file. With no overrides it starts all four services. Local simulation
requires no provider credentials. Keep server secrets out of `VITE_*` variables.

## Try a simulation

1. Choose a Houston area. Its street and building map opens inside EarthLab.
2. Open **Storm controls**, select a storm, and play the modeled changes.
3. Choose a hospital in **Impact and routing** and place a pin on the map to
   calculate a hypothetical route. Use the area selector to open another region.

The separate resource-allocation engine is available through the EarthLab API
and `pnpm demo:allocation` for the mitigation and response examples. It uses
an illustrative graph. The [planning handoff](docs/handoffs/houston-resource-planning.md)
documents its assumptions and utility functions.

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
