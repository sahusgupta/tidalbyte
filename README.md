# EarthLab

A desktop-first Earth console for exploring Houston-region weather/outage context.
This repository currently contains the **prompt 00 lead bootstrap only**: a
keyless Cesium globe, schematic county overlays, a deterministic offline fixture,
a validated FastAPI skeleton, frozen shared contracts and CI. No trained model,
verified historical warning case, infrastructure analysis or AI/voice integration
is implemented yet. All displayed severity values say **OFFLINE EXAMPLE**.

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

## Try the bootstrap

1. See Earth rotate; pause orbit or drag the globe. Reduced-motion preferences
   disable the initial orbit and camera animation.
2. Select **Fly to Houston** or press **H** outside form fields.
3. Pin Harris, Fort Bend or Brazoria from the county list or schematic map shapes.
4. Choose **Run example**. The API validates the request and returns fixed indices.
5. With only the web server running, choose **Run example** again: local fallback
   remains available, explicitly labeled as offline.

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
