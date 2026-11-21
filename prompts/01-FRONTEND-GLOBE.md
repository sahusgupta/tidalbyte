# Paste into Claude Code or Codex: FRONTEND / GLOBE

Read `AGENTS.md`, `CLAUDE.md`, `docs/00-START-HERE.md`, `docs/01-PRODUCT.md`, `docs/02-SYSTEM.md`, `docs/04-DESIGN.md`, `docs/06-API-CONTRACTS.md`, `STATUS.md`, and `DECISIONS.md`.

**Mandatory:** invoke `$interface-craft` if installed; otherwise fully read `skills/interface-craft/SKILL.md` and explicitly apply it. This is an operational design tool, not a SaaS landing page.

Own `apps/web/**` only. Build premium *Planetary Atlas / Mission Instrument* with globe dominating screen: CesiumJS orbit -> Houston preset, Google Photorealistic 3D Tiles optional and standard globe fallback. Add left scenario rail, county overlays + legends, right county/source inspector, P0 mocked fixtures with big OFFLINE EXAMPLE marks, model results adapter, infrastructure edge overlay, comparison panel, typed voice-bar UI, accessibility and responsive failure states.

Use state controller typed from `contracts/`; no independent ad hoc API contracts. Match spatial data strictly WGS84 GeoJSON. Keep map attribution always visible. Never infer road elevations or building outlines from tiles. Avoid fake risk numbers; fixtures must be labeled. Use screenshots at 1440x900 and 1280x720 and iterate for legibility and polish; honor reduced motion and keyboard navigation.

Acceptance: a judge can open `/`, see Earth, fly to Houston, toggle a county overlay, inspect an evidence-backed value or clearly labeled mock, simulate UI comparisons with no backend, and interact via keyboard. Hand over screenshots and test results. Push PR without modifying ML/AI/backend-owned files.
