# Houston site and simulator opening performance

The landing now displays its introduction and five-area chooser before loading Cesium. Scrolling toward Earth loads the globe. Opening the chooser or hiding the tab pauses its render loop.

In AquaGrid, the region metadata enables the storm controls while the renderer, roads and building geometry load concurrently. A worker prepares the full building mesh, including roof triangles, wall heights and source row IDs for picking. The map yields between shader groups during its first draw. Once the route is visible, its moving dot can update independently of the city geometry. Clear skies and reduced motion leave the rain renderer idle.

## Measurements

Three fresh desktop Chrome profiles per revision, 1440 × 900, AMD Radeon 890M, same local site at port 4187, simulator at 5174, warm regional service, normal motion and bundled imagery. The table reports medians for Downtown & Buffalo Bayou.

| Measurement | Before | After |
| --- | ---: | ---: |
| Navigation to intro heading | 793 ms | 480 ms |
| JavaScript decoded by the time the heading appeared | 4,424,911 bytes | 242,997 bytes |
| Area selection to first 3D building wall draw | 3,971 ms | 1,624 ms |
| Longest browser main-thread task during opening | 2,361 ms | 550 ms |
| City building draws in a 1.8-second idle sample | 54 | 0 |
| Completed model requests in 3.5 seconds of storm playback | 5 | 6 |

The first draw still includes graphics-driver shader compilation. Roads, labels and route markers finish drawing after the first buildings. A separate pair of cold standalone production-build runs drew the full opening scene in 5.0–5.5 seconds, compared with 7.7–7.9 seconds before the change. Timings vary by GPU, process state and region.

## Regional service

The API can serve metadata and geometry while scientific libraries import. The first scenario requested for a region loads its trained model. Prepared geometry can be delivered compressed and revalidated on a return visit. Run `python -m aquagrid.prepare_zones` with the simulator environment to generate these representations for existing complete datasets. Older datasets continue to serve their JSON directly.

For Kingwood, the isolated API reached its health endpoint in 1.6 seconds, previously 8.9 seconds. A first building download took 105 ms, previously 508 ms. A model request made immediately after process start took about 5.4 seconds while the libraries loaded. The previous server spent 8.9 seconds warming up before accepting requests. Two reference scenarios retained identical response contents, including route and flood overlay, after excluding runtime measurements.

## Verification

- `pnpm typecheck`, `pnpm test` and `pnpm build` cover the site, contracts and application backend. The root environment passed 123 web tests and 154 Python tests. Three optional county-ML modules were skipped in that environment.
- In `simulator/frontend`, `npm test`, `npm run typecheck` and `npm run build` cover the packed building mesh, rain and route state. In `simulator/backend`, the six catalog and startup tests passed under `python -m unittest discover -s tests -v` in the AquaGrid environment.
- The [browser QA guide](../../simulator/qa/README.md) documents the five-area desktop and touch flow and `node profile-opening.mjs`. An additional check held back the building response, selected the Memorial Day storm through the existing controls and confirmed that its model result persisted when the map opened.
