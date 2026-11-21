# Handoff: `feat/globe-sharp-zoom-sim`

Integration update for PR #1. The Houston atlas opens at `/`. The Earth index is available at `#/earth`, and zone links remain at `#/zone/<id>`. The Earth index uses bundled global imagery and requests Houston detail at closer zooms. The notes below describe the original branch before integration.

Date: 2026-11-21. Base: `feat/globe-houston-atlas` @ `cfa214b` (Globe/UI workstream, unmerged at time of writing).
**Merge order:** after `feat/globe-houston-atlas`, or as a PR into it. Its edits to that branch's files are small (20 lines).

## What it adds

- **Earth view as the landing screen** (`apps/web/src/features/earth/`):
  - a rotating globe on tiled USGS The National Map orthoimagery (public domain, no key)
  - the whole globe at small scales, and the US down to about 2 m/px (zoom 16)
  - rendering at the display's real pixel density, which was a main cause of blur
- **Zones** (`features/earth/zones.ts`): five neighbourhood-scale Houston areas, drawn on the map and listed on the left.
  - Clicking one flies the camera in, then opens the simulator.
  - Adding a zone to `zones.ts` makes it appear in both places.
- **Simulator hand-off** (`features/simulator/`): opens an external street & flood simulator at `VITE_SIMULATOR_URL`, framed to the zone.
  - The zone is passed in the query (`zone`, `name`, `bbox`, `center`, `v`) and as a posted message.
  - The simulator can reply `ready`, `status`, or `exit`. The contract is in `features/simulator/README.md`.
  - Without the variable, a "not connected yet" panel shows the exact URL and message. No simulation output is displayed.
- **Optional photoreal 3D:** Google Photorealistic 3D Tiles load automatically when `VITE_GOOGLE_MAPS_TILES_KEY` or `VITE_CESIUM_ION_TOKEN` is set. They are display only, with credits shown on screen.
- **Routing:** `#/` Earth, `#/zone/<id>` zone + simulator, `#/atlas` the existing Houston scenario atlas (`app/Root.tsx`, `app/route.ts`).

## Edits to existing files

- `main.tsx`: renders `Root` instead of `App`.
- `app/App.tsx`: optional `onEarth` prop; the EarthLab brand becomes a "back to Earth" button.
- `features/globe/Globe.tsx`:
  - The atlas adds tiled USGS imagery over `BOUNDS` (same colour grading) above the bundled single-tile images, which stay as an offline fallback.
  - It uses the shared `sharpenRendering()`.
  - The credit text was updated to match.

## Tests and checks (actual)

- `pnpm --filter web typecheck`: clean.
- `pnpm --filter web test`: **62 passed** (8 new: zones, simulator contract, routes).
- `pnpm --filter web build`: passes, including `verify-assets` (Cesium assets, Houston imagery, provenance).
- Browser at 1440x900:
  - globe landing, region view with zone outlines, list-click fly-in, and street-level sharpness checked
  - the atlas zoomed in, and the brand back to Earth
  - no console errors
- Stub simulator on a second origin:
  - received the query and the zone message
  - its `status` was shown
  - `exit` returned to `#/`
  - existing query parameters on the simulator URL were preserved
- Node was v26 locally; the repo pins 22.12-22.x. Not re-run on Node 22.

## Integration notes and limits

- USGS tiles stop at zoom 16. Closer than that, imagery is upsampled. Photoreal 3D needs a key or token from the team.
- Outside the US, imagery at mid zoom is coarser; the product scope is Houston.
- If the simulator sends `X-Frame-Options: DENY` or `frame-ancestors`, it cannot be embedded; the "Open in new tab" link carries the same parameters.
- No new dependencies.
- `.env.example` was not edited (lead-owned). Suggest adding `VITE_SIMULATOR_URL=` beside the existing `VITE_*` keys.
