# Houston Disaster Atlas

Run `pnpm install --frozen-lockfile` and `pnpm --filter web dev` from the repository root. Open [the local atlas](http://127.0.0.1:5173). The map and scenario editor run without provider keys. To use the companion API, install the Python dependencies from the root README and start `pnpm dev:api`. The frontend defaults to `http://localhost:8000`; override it with `VITE_API_BASE_URL` if needed.

## Three-minute walkthrough

1. Open Greater Houston. The **Scenario** notebook shows the Gulf approach and the position along its drawn route. On a phone, tap **Scenario** below the map to open the notebook. Use the location menu to visit Downtown Houston, Buffalo Bayou or Ship Channel. H resets the view and 1–3 select local bookmarks outside form controls.
2. In Hurricane mode choose **Edit track**. Click to add a waypoint, drag a numbered handle, or use the coordinate editor with a keyboard. Play or scrub the 12-hour seed timeline. Duration changes the displayed time. Intensity and rainfall are scenario annotations.
3. Choose **Flood** and **Edit footprint**. Place the center and resize the edge. The circle expands with the timeline from 35% to 100% of the selected final radius. The viewport and legend identify this geometry as illustrative.
4. Choose **Inspect** and select a road. Its notebook page shows the measured fixture geometry, source and exposure status. Use **Add closure** or **Remove closure** to change the local network. Open **Compare** to see the open baseline and the edited scenario at the same time. **Reset demo** restores the original setup, including one assumed closure.
5. Toggle **County severity** for the independent county context. Open **Sources** for provenance and assumptions. **Ask the atlas** opens typed and voice requests. The **View** menu on the map contains the viewing angle and 2D/3D options.
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

| View | Desktop | Phone or tablet |
| --- | --- | --- |
| Greater Houston | [Opening atlas, 1440 × 900](docs/qa/houston-hurricane-1440.jpg) | [Phone, 390 × 844](docs/qa/houston-phone-390.jpg) · [Tablet, 768 × 1024](docs/qa/houston-tablet-768.jpg) |
| Notebook | [Selected road and its geometry](docs/qa/road-notebook-1440.jpg) | [Scenario sheet and editable route](docs/qa/notebook-phone-390.jpg) |
| Scenario evidence | [Flood footprint and legend](docs/qa/flood-1280.jpg) · [Closure comparison](docs/qa/closures-comparison-1280.jpg) · [Sources](docs/qa/sources-1440.jpg) | |

[Interactive 2D Houston map](docs/qa/accessible-map-1440.jpg) · [Earth study-zone index](docs/qa/earth-index-1440.jpg) · [Downtown and Buffalo Bayou zone](docs/qa/zone-1440.jpg)

The [imagery manifest](public/map/provenance.json) gives the provider, service-reported acquisition period, geographic bounds and byte size of each aerial. Houston opens with bundled imagery. Natural Earth II supplies the wider map. Closer Houston views can load online USGS detail. To use a licensed XYZ imagery service, set `VITE_ATLAS_IMAGERY_URL` and `VITE_ATLAS_IMAGERY_CREDIT`. The bundled aerial and both atlas typefaces also work offline.

## Verification

Run `pnpm typecheck`, `pnpm test`, `pnpm contracts:check`, `pnpm openapi:check` and `pnpm build` from the repository root. The build verifies the Cesium assets and both georeferenced WebP files against the manifest.

The November 21, 2026 redesign passed type checking, the production build, contract and OpenAPI checks, 62 frontend tests, and 52 Python tests. Pytest skipped three ML modules because the application environment omits NumPy. Vite reported its size warning for the lazy Cesium bundle.

Chrome passed 13 map interaction groups in 3D and forced 2D, covering pointer and keyboard edits, timeline playback, road selection beneath a flood footprint, closure comparison and reset. Ten tests covered command confirmation, cancellation, stale responses and replay, plus backend graph IDs and source validation. The production bundle also passed with the API and external imagery blocked.

Layout and navigation were checked at 320 × 568, 390 × 844, 720 × 450, 768 × 1024, 1280 × 720 and 1440 × 900. In compact layouts, the three notebook pages open from the bottom. **Edit track on map** and **Edit footprint on map** close the sheet and place keyboard focus on the map.
