# Prompt 00 lead bootstrap handoff

Scope: `prompts/00-LEAD.md` only. Lead branch `integrate/bootstrap`. No feature
prompts have been completed. Parallel agents prepared initial skeleton pieces in
isolated worktrees under lead review; they did not begin independent workstreams.

## Files

Root pnpm/Python configs and locks, `.env.example`, `.gitignore`, GitHub Actions,
`vercel.json`, README/setup docs, STATUS/DECISIONS, canonical schemas and exported
OpenAPI, generated `packages/contracts/**`, `data/fixtures/**`, `apps/web/**`,
`apps/api/**`, and fail-closed `ml/**` placeholders. Root agent instructions and
existing feature prompts remain in force. Proposal001 records lead authorization.

## Validation so far

Executed `git fetch origin`, `git pull --ff-only`, dependency installs in a local
venv and pnpm workspace, `pnpm contracts:generate`, `pnpm openapi:generate`,
`pnpm contracts:check`, `pnpm typecheck`, `pnpm test:web` (5 passed),
`pnpm test:python` (53 passed), `pnpm build`, `python scripts/validate_kit.py`,
and `git diff --check`. Production build warns about the large lazy Cesium chunk.
Python emits a dependency deprecation warning in Starlette TestClient/AnyIO.

Initial failed checks exposed external-reference code generation, datetime regex
incompatibility, optional null serialization and misplaced Cesium assets. These
were repaired before publication. No failed check is represented as successful.
Final integrated checks passed after repairs: `pnpm typecheck`, `pnpm test`
(5 web + 53 Python), `pnpm build` including deployed Cesium asset checks,
`pnpm contracts:check`, `pnpm openapi:check`, and the kit validator.

## Browser evidence

Inspected the actual console at 1280x720, 1440x900, 768x1024 and 390x844.
The globe renders from local imagery with Cesium attribution. Houston flight,
the H shortcut, schematic overlays, county pinning and inspector updates work.
Run example returned `API connected`; after stopping the API, production preview
returned `API unavailable · bundled offline example` while keeping manual controls.
Desktop footer stays in view; mobile/tablet scroll normally without horizontal
overflow. The last 1440x900 viewport measured page width1440 and height900.

Interface-craft critique repaired the three most consequential issues: missing
static assets, desktop footer below the viewport, and map labels lacking contrast
against bright imagery. A further camera adjustment fits the schematic region.
Local ignored screenshot: `output/earthlab-bootstrap.jpg`. It is a machine-local
verification artifact, not required to run a clean clone. Browser zoom and
physical device testing were not performed; reduced-motion behavior is implemented
but was not verified with an OS preference change.

## API/model dependencies

No external keys. Local Natural Earth II cartography ships with Cesium; attribution
stays visible. API loads only local OFFLINE EXAMPLE fixtures once at startup.
`/healthz`, `/readyz`, catalogs, county geometry, evaluation and model metadata work.
Graph/interpretation/voice return503; their request shapes are reserved in OpenAPI.
No actual model/data evaluation exists; `evaluation:null` and empty dataset IDs
are deliberate. `python ml/train.py --config ml/config.yaml` must exit2 until
real verified-data training is implemented by the ML owner.

## Consumer integration

Pull the published main before creating feature branches. Import shared TS types
from `@earthlab/contracts` and Pydantic shapes from `earthlab_contracts.models`.
Canonical Python validation is in `earthlab_contracts.validation`. Regenerate
contracts/OpenAPI only after approved schema changes. Use offline fixtures to
continue independent work when services remain unimplemented. Keep workstreams
inside the path ownership table in `docs/05-TEAM-PROTOCOL.md`.

Frontend keeps interface-craft's planetary instrument direction and required
visual critique. Real county geometry needs separately recorded provenance.
ML must provide conditional target units, supported features, source versions,
event/time holdout and baseline before replacing offline indices. Network and
voice are separate future tasks. No deployment or PR has been created.

## Clean-clone verification and publication

A separate clean Git clone of commit `3885cb6` passed `pnpm install
--frozen-lockfile`, fresh `.venv` creation and `pip install -r requirements.lock`,
`pnpm typecheck`, `pnpm test` (5 web + 53 Python passed), `pnpm build`,
`pnpm contracts:check`, `pnpm openapi:check`, and `python scripts/validate_kit.py`.
Only documentation changed after that verified source commit.

Clean-clone runtime commands used isolated ports to avoid existing helpers:
`node scripts/python.mjs -m uvicorn app.main:app --app-dir apps/api --port 8013`
and `pnpm --filter web dev --port 5183`. HTTP smoke checked the web shell,
actual Natural Earth II TileMap XML, health, offline readiness and a validated
three-county evaluation. Both helpers stopped and clone Git status stayed clean.

Publish by fast-forwarding `main` to the integration branch after a final fetch;
push both `main` and `integrate/bootstrap`. No PR is required for the initial
lead barrier. No remote CI success, hosted deployment, second-machine rehearsal,
real data validation or full product demo readiness is claimed by these checks.
