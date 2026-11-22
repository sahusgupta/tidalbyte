# Houston storm paths and agency planning

Choose a rainfall preset in **Storm controls**. Under **Event origin & path**, choose the storm type, rain radius and origin. Extend the track through named places or draw one on the map. A single point represents a stationary event. Playback traverses the path in proportion to distance. A standard map click outside drawing mode selects the starting point of a hospital trip.

Open **Impact & routing** to see the largest flooded road length near each named place, the highest-exposure streets, water depth and hospital access. The water layer fills the estimated street width. Its closure markings use the same unrounded depths and vehicle threshold as routing. **Plan infrastructure improvements** compares before-storm drainage work and after-storm pumping. Each plan identifies the street, funding agency, spending, crews and change in road closures and hospital access.

## Interpretation

The storm path prescribes rainfall. Blue drainage traces follow the filled elevation model to surface water, another trace or the study boundary. Local and upstream rain feed the regional depth surrogate. The Ship Channel hurricane case also uses a coastal water-level boundary. The traces do not resolve culverts, walls, underground pipes, wave motion or time-of-arrival hydraulics. A neighborhood label describes the nearest reference point. Road widths come from road class. Flood depths are conditional scenario estimates. Event probabilities, structural failure and operational road safety require different evidence.

Planning compares eight or fewer portfolios on the selected region's road graph. Treatments apply an illustrative reduction in water over short roadway segments. Agency reports can be rounded before the solver chooses projects. Every strategy's reported outcome uses the same full-precision network evaluation. Equal recommendations, an empty portfolio or a blocked route can be valid results under the chosen constraints.

## Reproduction

From the repository root, run the following checks with both local services and regional data prepared:

- `pnpm typecheck`, `pnpm test`, `pnpm contracts:check`, `pnpm openapi:check` and `pnpm build` exercise the atlas, core API and shared contracts.
- `npm --prefix simulator/frontend test` and `npm --prefix simulator/frontend run build` exercise the simulator client.
- From `simulator/backend`, run `python -m unittest discover -s tests -v` with the simulator Python environment for the drainage model, routing, hosted runtime and paired interventions.
- `node simulator/qa/verify-storm-tracks.mjs` advances an event from a named neighborhood towards a reviewed pin in each zone. The local Ship Channel and Meyerland examples changed from a clear trip to a blocked trip. The Medical Center example required a detour.
- `node simulator/qa/verify-storm-planning.mjs` opens the product site and compares both phases with desktop mouse and emulated touch. It checks the no-spend result at zero budget.
- `node simulator/qa/verify-track-gestures.mjs` exercises drawing, undoing, canceling and applying a path, then placing an independent hospital-routing pin. All ten zone/viewport cases also passed `node simulator/qa/verify-zones.mjs` with the visible Memorial Day preset.

The simulator uses regional terrain, street and building geometry and locally trained model weights. Core simulation and allocation require no provider keys. See the [deployment instructions](../09-SETUP-DEPLOY.md#release-the-houston-simulator-on-vercel).
