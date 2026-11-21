# Houston Disaster Atlas

Run `pnpm install --frozen-lockfile` and `pnpm --filter web dev` from the repository root. Open [the local atlas](http://127.0.0.1:5173). The map and scenario editor run without provider keys. To use the companion API, install the Python dependencies from the root README and start `pnpm dev:api`. The frontend defaults to `http://localhost:8000`; override it with `VITE_API_BASE_URL` if needed.

## Three-minute walkthrough

1. Open Greater Houston and inspect the pinned Channel approach crossing. Select Downtown Houston, Buffalo Bayou or Ship Channel from the map's bookmark menu. H resets the regional view and 1–3 select the local bookmarks outside form controls.
2. In Hurricane mode choose **Edit track**. Click to add a waypoint, drag a numbered handle, or use the coordinate editor with a keyboard. Play or scrub the 12-hour seed timeline. Duration changes the displayed time. Intensity and rainfall are scenario annotations.
3. Choose **Flood** and **Edit footprint**. Place the center and resize the edge. The circle expands with the timeline from 35% to 100% of the selected final radius. The viewport and legend identify this geometry as illustrative.
4. Choose **Inspect** and select a road. The inspector shows its source, geometric intersection and exposure status. Use **Add closure** or **Remove closure** to change the local network. The **Baseline vs alternative** strip compares the open baseline with the edited scenario at the same time. **Reset demo** restores the seeded setup, including one assumed closure.
5. Toggle **County severity** for the independent county context. Open **Sources** for provenance and assumptions. The tablet layout opens the editor and inspector in side drawers.
6. Choose **Earth** to open the global view at `#/earth`. Match a letter on the Houston aerial inset to a study zone and select its name. Each zone has a direct link at `#/zone/<id>`. Set `VITE_SIMULATOR_URL` to connect a compatible external simulator. The zone panel also links back to the Houston atlas.

## Evidence and integrations

| Layer                         | Input and interpretation                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aerial reference              | Two georeferenced, bounded USGS National Map display images. Houston opens in Cesium on an ellipsoid. A separate interactive 2D atlas supports browsers without WebGL. Imagery supplies location context only.                                                                                                                          |
| Road and connectivity fixture | Twelve original, CC0 schematic links. Geometry, names and topology are illustrative. A bridge closure in the seed changes components from 1 to 2 and reachable junctions from 12 to 9. Road exposure is unknown. No routing or passability determination is made.                                                                       |
| Hurricane and flood           | A manually drawn trajectory, interpolated storm position, fixed 6 km inspection circle and timed footprint. Road counts use local segment-to-circle intersection. There are no observed tracks, flood depths or hydraulic computations.                                                                                                 |
| County weather/outage         | `POST /api/v1/scenarios/evaluate` with the shared Houston preset. The bootstrap API returns three fixed indices and schematic county geometry. An eligible trained response displays its version, sources, units, conditional scope and held-out evaluation. Editing local geometry or rainfall does not rerun a model on those inputs. |
| Backend graph                 | `GET /api/v1/network` must advertise a graph source and edge IDs. `POST /api/v1/network/compare` accepts that catalog's IDs and returns separate, hypothetical backend metrics. The current API leaves these endpoints unavailable.                                                                                                     |
| Typed and voice requests      | `POST /api/v1/ai/interpret` returns a proposal. `POST /api/v1/voice/transcribe` accepts user-initiated audio. Both need backend implementations for live use. The client validates and requests confirmation before applying supported actions. [Command review](src/features/assistant/README.md)                                      |

The shared package supplies scenario, prediction, model metadata, network comparison and command types. Geometry editing and fixture reachability stay local. The frontend sends neither camera imagery nor drawn geometry to inference or command services.

## Browser captures

| State              | Desktop                                                                                                         | Tablet                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Hurricane          | [Opening map, 1440 × 900](docs/qa/houston-hurricane-1440.jpg) · [Edited track](docs/qa/hurricane-edit-1440.jpg) | [Opening map, 768 × 1024](docs/qa/houston-tablet-768.jpg)                                               |
| Flood and closures | [Footprint and legend, 1280 × 720](docs/qa/flood-1280.jpg) · [Comparison](docs/qa/closures-comparison-1280.jpg) | [Scenario controls](docs/qa/editor-tablet-768.jpg) · [Road inspector](docs/qa/inspector-tablet-768.jpg) |
| Context            | [County fixture](docs/qa/county-context-1280.jpg) · [Sources](docs/qa/sources-1440.jpg)                         |                                                                                                         |

[Phone atlas, 390 × 844](docs/qa/houston-phone-390.jpg) · [Earth study-zone index](docs/qa/earth-index-1440.jpg) · [Downtown and Buffalo Bayou zone](docs/qa/zone-1440.jpg)

The [imagery manifest](public/map/provenance.json) lists the provider, service-reported acquisition period, bounds and byte sizes for each aerial reference. Houston opens with bundled aerial imagery. Earth opens with bundled Natural Earth imagery. Closer Houston views can load online USGS detail. To use an additional licensed XYZ template in the atlas, set `VITE_ATLAS_IMAGERY_URL` and `VITE_ATLAS_IMAGERY_CREDIT`. The bundled images remain available if that provider fails.

[Interactive 2D fallback](docs/qa/accessible-map-1440.jpg) · [Unavailable command service](docs/qa/command-unavailable-1440.jpg) · [Command confirmation with a test backend](docs/qa/test-command-review-1440.jpg) · [Graph comparison with a test backend](docs/qa/test-backend-comparison-1440.jpg).

## Verification

Run `pnpm typecheck`, `pnpm test` and `pnpm build` from the repository root. The build checks Cesium assets and both georeferenced WebP files against their manifest.

The browser checks cover pointer placement and dragging in 3D and forced WebGL fallback, timeline playback, keyboard editing, road selection beneath a flood footprint, closure comparisons and reset. Command tests exercise confirmation, unsupported actions, stale responses and replay. Backend graph tests verify catalog edge IDs and reject comparisons from a different source. Successful provider responses in the two test-backend screenshots are controlled test inputs.

Viewport reviews covered 390 × 844, 720 × 450, 768 × 1024, 1280 × 720 and 1440 × 900. The phone has dedicated touch targets for the map tools and drawers. Keyboard users can skip directly to the atlas or the Earth index, open a zone, and return focus to its entry.

On November 21, 2026, type checking, the production build, shared contract checks and the OpenAPI check passed. With PR #2 on the base branch, 62 frontend tests and 52 Python tests passed. Pytest skipped three ML test modules in the application environment because its lockfile omits the training dependencies. Chrome passed 11 scenario interaction groups in 3D and forced WebGL fallback, the flood-picking regression, and nine command/network checks. The built application also passed navigation and scenario checks with API and external imagery requests blocked. Vite reports a size warning for the lazy Cesium bundle.
