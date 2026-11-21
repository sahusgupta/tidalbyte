# Local Houston simulator repair

Branch `integrate/repair-3d-flood-links` restores the deck.gl map reference and pointer handlers lost when the 3D map optimizations were merged. The regional API had returned roads and buildings successfully. An undefined `startGroundTap` crashed React during rendering and prevented the simulator from signaling readiness.

The product site and standalone AquaGrid frontend both open the same 3D simulator. The five links pass different Houston area IDs. The default `pnpm dev` now launches the site, 3D frontend, EarthLab API and AquaGrid API together. The setup instructions describe external service overrides and preparation of the independent local regional datasets.

## Verification

- The browser harness in `simulator/qa/verify-zones.mjs` opened all five areas from the product landing at 1440 × 900 and at 390 × 844 with emulated touch. All ten cases rendered extruded building walls, received different storm frames and computed a route after a ground pin. The downtown case also passed on the local production preview at port 4187.
- The desktop and phone captures show the regional map occupying the main viewport. On phones, the area selector carries the visible place name while the header retains its accessible heading.
- `pnpm typecheck`, `pnpm test:web`, `pnpm build`, `pnpm contracts:check`, and `pnpm openapi:check` passed. The main Python environment passed 154 tests and skipped three optional county-ML modules. The simulator passed `npm run typecheck`, `npm run build`, its three Node interaction tests and three Python catalog tests.

The simulator uses its own Python environment and prepared regional XGBoost models. The verification used those local artifacts and browser-emulated phone input. For setup and the browser command, see [the simulator guide](../../simulator/README.md) and [the QA instructions](../../simulator/qa/README.md).
