# Handoff: Relief money overlay in the Houston simulator

Uncommitted work on `main`, 2026-11-21. Owner: ML/data.

## What it does
**Relief money** sits in the simulator header next to Map layers. For the storm on screen it lists the five places where a donation would reach the most people in need. Each place shows an amount, people in flooded homes and up to two plain reasons. Budget presets are $250K, $1M and $5M, and a custom amount is also accepted. Users can weight the plan toward **Most in need** or **Most people**. The places are drawn on the map in gold with rank badges, and clicking one brings it into view. Regions without a tract file (Miami) hide the button. The EarthLab web app is unchanged; the overlay appears inside its embedded simulator.

## Files
- `ml/relief/build_relief.py` builds `simulator/frontend/public/relief/<region>.json` from SVI 2022, TIGERweb 2020 tracts and Overture neighbourhood names. Inputs are recorded in `data/provenance/relief_sources.md`.
- `simulator/frontend/src/lib/relief.ts` (+ `relief.test.mjs`) handles building-to-tract matching, need per tract from a result, the budget split, reasons and amount parsing.
- `simulator/frontend/src/components/ReliefPanel.tsx` and `relief.css` are the panel.
- `simulator/frontend/src/components/MapView.tsx` adds the gold tract areas, rank badges and framing of the recommended places.
- `simulator/frontend/src/App.tsx` loads the tract file and adds the panel and header button.
- Docs: `simulator/README.md` (Relief money section) and `docs/08-SOURCES.md` (items 9–10).

## Method and limits
Need is computed in the browser from each `/simulate` result (`buildings` depth in cm, `access`). Residents are assumed evenly spread over a tract's buildings. Need counts:
- residents in flooded homes (over 15 cm),
- plus residents in deep water (over 50 cm),
- plus flooded residents without a car,
- plus residents who are 65+ or disabled and cut off from the selected hospital.

Weighting is 1 ± p by the Texas SVI percentile, with p = 0.75 for Most in need and 0 for Most people. The budget is split proportionally across the top five places in $100 steps.

Limits:
- Impacts come from the regional surrogate model, not observed damage.
- Populations are ACS 2018–2022 estimates.
- Reasons use fixed thresholds: no car ≥ 15%, poverty ≥ 35%, uninsured ≥ 30%, deep water ≥ 10% of flooded residents.
- This is not a needs assessment and makes no cost or effectiveness claims. No API or contract changes.

## Verification
- Simulator: `npm test` passes all 14 tests, including 6 new relief tests. `tsc -b --noEmit` and `npm run build` pass.
- Browser, with the local `pnpm dev` stack:
  - Ship Channel under Tax Day and Downtown under Harvey, inside EarthLab at `#/zone/downtown-buffalo-bayou`.
  - The dry-weather empty state.
  - A custom $750K budget, and the invalid-amount message.
  - List-to-map highlight and framing.
  - The panel at 390 px.
  - No console errors.
- Not exercised: touch gestures on a real phone, and the hosted Vercel package.
