# Houston Disaster Atlas

Run `pnpm install --frozen-lockfile` and `pnpm --filter web dev` from the repository root. Open [the local atlas](http://127.0.0.1:5173). The map and scenario editor run without provider keys. To use the companion API, install the Python dependencies from the root README and start `pnpm dev:api`. The frontend defaults to `http://localhost:8000`; override it with `VITE_API_BASE_URL` if needed.

## Three-minute walkthrough

1. Houston opens directly on the map. Choose **Greater Houston** to visit Downtown Houston, Buffalo Bayou or Ship Channel. The desktop tool rail becomes a single tool picker on phones.
2. Choose **Gulf approach** in the header to adjust scenario type, duration, rainfall or intensity. **Edit track on map** closes the settings and takes you to the map. Add or drag a waypoint, then play or scrub the timeline. The coordinate editor supports keyboard input.
3. Choose **Edit flood footprint** to place and resize an illustrative circular area. **Measure distance** measures between two points on the map. **View** contains camera and renderer options.
4. Select a sample road to open its inspection sheet. Change an assumed closure, then open **Compare** to slide between the baseline and the edited geography at the same scenario time. The numerical comparison and its evidence expand below the map.
5. Open **Layers** to change the basemap, see the legend or enable county severity. County readings identify their source and data mode. **Ask the atlas** accepts typed or voice input for a proposed command.
6. The **Study menu** (•••) includes the inspector, sources, Earth navigation and **Export study**. The GeoJSON download contains the active sketch, sample roads, assumed closures, scenario time and inputs. On phones, the menu also provides **Compare** and **Map layers & legend**.

## Evidence and integrations

| Layer                         | Input and interpretation                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aerial reference              | Two georeferenced, bounded USGS National Map display images. Houston opens in Cesium on an ellipsoid. A separate interactive 2D atlas supports browsers without WebGL. Imagery supplies location context only.                                                                                                                          |
| Road and connectivity fixture | Twelve original, CC0 schematic links. Geometry, names and topology are illustrative. A bridge closure in the seed changes components from 1 to 2 and reachable junctions from 12 to 9. Road exposure is unknown. No routing or passability determination is made.                                                                       |
| Hurricane and flood           | A manually drawn trajectory, interpolated storm position, fixed 6 km inspection circle and timed footprint. Road counts use local segment-to-circle intersection. There are no observed tracks, flood depths or hydraulic computations.                                                                                                 |
| County weather/outage         | `POST /api/v1/scenarios/evaluate` with the shared Houston preset. The bootstrap API returns three fixed indices and schematic county geometry. An eligible trained response displays its version, sources, units, conditional scope and held-out evaluation. Editing local geometry or rainfall does not rerun a model on those inputs. |
| Backend graph | **Compare** loads a separate illustrative network catalog from the API. Comparison and preview use that catalog’s source and target IDs. The strategy view reads the two-agency game from the same service. |
| Typed and voice requests | The server interprets text and transcribes recordings with optional Gemini and ElevenLabs credentials. The atlas labels offline examples, lets users edit transcripts and checks each proposal before confirmation. [Command review](src/features/assistant/README.md) |
| Neighborhood flood simulator | Open the Downtown simulator from the Study menu, or choose one of five zones in Earth view. AquaGrid reads its own prepared regional geography and flood surrogate. [Setup and interpretation](../../simulator/README.md) |

The shared package supplies scenario, prediction, model metadata, network comparison and command types. Geometry editing and fixture reachability stay local. The frontend sends neither camera imagery nor drawn geometry to inference or command services.

## Browser captures

| View | Desktop | Phone or tablet |
| --- | --- | --- |
| Greater Houston | [Opening atlas, 1440 × 900](docs/qa/houston-hurricane-1440.jpg) | [Phone, 390 × 844](docs/qa/houston-phone-390.jpg) · [Tablet, 768 × 1024](docs/qa/houston-tablet-768.jpg) |
| Study sheets | [Selected road and its geometry](docs/qa/road-notebook-1440.jpg) | [Scenario sheet and editable route](docs/qa/notebook-phone-390.jpg) |
| Scenario evidence | [Layers and legend](docs/qa/map-layers-1440.jpg) · [Flood footprint](docs/qa/flood-1280.jpg) · [Closure comparison](docs/qa/closures-comparison-1280.jpg) · [Sources](docs/qa/sources-1440.jpg) | |

[Interactive 2D Houston map](docs/qa/accessible-map-1440.jpg) · [Earth study-zone index](docs/qa/earth-index-1440.jpg) · [Downtown and Buffalo Bayou zone](docs/qa/zone-1440.jpg)

The [imagery manifest](public/map/provenance.json) gives the provider, service-reported acquisition period, geographic bounds and byte size of each aerial. Houston opens with bundled imagery. Natural Earth II supplies the wider map. Closer Houston views can load online USGS detail. To use a licensed XYZ imagery service, set `VITE_ATLAS_IMAGERY_URL` and `VITE_ATLAS_IMAGERY_CREDIT`. The bundled aerial and both atlas typefaces also work offline.

## Verification

Run `pnpm typecheck`, `pnpm test`, `pnpm contracts:check`, `pnpm openapi:check` and `pnpm build` from the repository root. The build verifies the Cesium assets and both georeferenced WebP files against the manifest.

The atlas and the standalone flood map have separate production builds. CI checks both. The application Python environment omits the optional ML training dependencies. See the [ML handoff](../../ml/README.md) for the training and evaluation checks.

Browser checks exercised keyboard and touch operation, panel focus and dismissal, 3D and 2D editing, comparison, measurement, GeoJSON export, fallback data and confirmed commands. The screenshots cover the responsive layout from 320 × 568 to 1440 × 900.
