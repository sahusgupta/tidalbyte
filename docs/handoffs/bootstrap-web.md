# Bootstrap web handoff

Owner: lead-delegated bootstrap, branch `integrate/bootstrap-web`.

The operational console uses the installed `interface-craft` skill and EarthLab's Planetary Atlas / Mission Instrument direction. The internal brief is a bounded outage-planning teaching surface: Earth dominates the map, thin control rails carry scenario and evidence, bone-colored notebook records keep interpretation readable. Motifs are cartographic coordinates, engraved rules, and a field notebook. The signature action is orbit to Houston. No marketing hero or invented real metrics.

Implemented the initial React/Vite/Tailwind/Cesium/Zustand/TanStack Query skeleton. Cesium's bundled Natural Earth II assets provide a keyless offline globe; no imagery provider calls are configured. Orbit pauses on pointer interaction, honors initial reduced motion, and can be paused manually. Houston flight, schematic polygon toggle, map picking and keyboard county list are connected. API evaluation has a bounded timeout and explicitly labeled local fallback.

Data contract imports are centralized in `@earthlab/contracts`: `Scenario`, `Prediction`, `Evaluation`, `offlineScenario`, `offlineEvaluation`, `offlineCounties`. This bootstrap supports a fixed example event; trained data, network and provider features remain separate workstreams. Fixture geometry is always labeled schematic.

## Validation and review

Unit tests cover fallback on API/network failure, rejection of malformed successful API responses, preservation of valid envelopes, preset version increments, and invalid county pins. After the lead integrated shared contracts and installed workspace dependencies, the web delegate ran `pnpm --filter web typecheck` (passed) and `pnpm --filter web test` (2 files, 5 tests passed) from the integrated checkout. Integration/root owns build and actual screenshot QA. No screenshot checks or production readiness are claimed in this subtask handoff.

The `vercel:react-best-practices` review checked lazy loading of the heavy Cesium view, separate mount/update effects, listener and viewer cleanup, derived render state, and semantic controls. Scenario and overlay actions use the shared `CommandProposal` action shape; camera and county pins remain local UI commands. The Houston button also exposes the `H` shortcut.

Mandatory visual critique must inspect 1440×900, 1280×720, 768×1024 and approximately 390px layouts after integration. Check globe assets/attribution, panel density, bottom action visibility, narrow-screen map height, map picking, keyboard focus, reduced motion, and API-offline behavior. Repair the three most consequential observed defects, then recheck.

Sources used for API setup: [Cesium offline guide](https://github.com/CesiumGS/cesium/blob/main/Documentation/OfflineGuide/README.md), [Cesium Viewer reference](https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html), [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite). Package versions were queried from npm and pinned exactly.
