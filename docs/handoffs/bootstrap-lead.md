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
Final clone/browser evidence will be appended before publication.

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
