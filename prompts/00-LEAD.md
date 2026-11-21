# Paste into Claude Code or Codex: LEAD / INTEGRATION

Read `AGENTS.md`, `CLAUDE.md`, `docs/00-START-HERE.md`, all contracts, `STATUS.md`, `DECISIONS.md`, and `docs/05-TEAM-PROTOCOL.md`. You own integration/bootstrap and must establish the shared repo foundation BEFORE parallel teammates start.

Tasks:
1. Scaffold pnpm monorepo: apps/web React TS Vite Tailwind CesiumJS Zustand TanStack Query, apps/api FastAPI/Pydantic, ml/, fixtures and simple CI. Pin package versions via lockfiles. Provide scripts `pnpm dev`, `pnpm typecheck`, `pnpm test`; Python requirements/pyproject and pytest.
2. Implement versioned JSON schemas and generated/synchronized TS/Pydantic shapes from `contracts/` (or compatible validation), document generation step. Set API response envelope and `/healthz`.
3. Create tiny non-misleading offline GeoJSON fixture for Houston-area demo and a local offline API fixture distinctly labeled `OFFLINE EXAMPLE`. No invented 'real model'.
4. Create Vercel/host config or docs, `.env.example`, GitHub Actions basic typecheck/tests, status update and quick-start.
5. Coordinate ownership and freeze schemas. Do NOT implement all other workstreams yourself unless teammates are blocked. Merge PRs and run an integrated smoke test. Ensure no secrets go into repo.
6. Enforce `$interface-craft` in UI reviews; see `docs/04-DESIGN.md`.

Completion: a clean clone can boot web + API skeleton with mock overlays, and teammates can implement against stable contracts. Commit and push the bootstrap branch/main; report actual commands/tests, blockers, and integration instructions.
