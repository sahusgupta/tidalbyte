# Read This First: Product and Technical Contract

## Product thesis
**EarthLab**: Explore how extreme-weather scenarios may affect critical infrastructure using a realistic global 3D Earth canvas, a measurable ML estimate, transparent network analysis, and testable planning alternatives.

## Single scientifically defensible day-one use case
Houston-region **county-level outage severity associated with historical National Weather Service warnings**. An initial model trained on a harmonized dataset of county-hours with positive outage metrics and matched warnings estimates outage **severity conditional on the dataset selection**. It does **not** predict whether a county will have any outage at all; it does **not** predict transformer/line failure; it does **not** forecast storm surge or flood depth. For interactive weather scenario edits that leave data support, label results as `what-if (exploratory)` rather than forecasts.

## Architecture locked
- Browser: React + TypeScript + Vite + Tailwind + CesiumJS + Zustand + TanStack Query. Desktop-first app, no marketing site.
- Google Photorealistic 3D Tiles via CesiumJS (optional, billing/terms). Fallback Cesium globe/imagery.
- Python FastAPI backend with Pydantic request validation, scikit-learn HistGradientBoostingRegressor, networkx for connected-network analysis, joblib model metadata.
- Gemini: structured scenarios and safe textual explanations via controlled tools/functions.
- ElevenLabs: STT input and optional TTS summaries; typed command fallback always available.
- Small region-specific GeoJSON fixture for Texas Gulf Coast counties and demonstration infrastructure, derived independently from permissible data; no globally complete infrastructure graph.
- Shared TypeScript/Python contracts in `contracts/` and API OpenAPI spec.
- No user accounts, DB, global disaster physics, or live emergency operations.

## ML contract
Baseline mean/median-by-warning group or simple regression; learned model predicts transformed observed outage severity conditional on positive-outage/warning archive. Group holdout by weather event and time; no random county-hour splitting; no future-derived predictors. Report honest MAE and baseline; no guaranteed improvement.

## Demo must work without external providers
One keypress launches Houston, loads deterministic preset scenario and explanatory sample output. Clearly label all sample/mock outputs and distinguish from actual model results.

## Definition of done
1. Globe spins, flies to Houston, renders at least one data-driven regional overlay with legend and attribution.
2. Trained model artifact exists with provenance, reproducible train script, held-out metrics and a verified API inference path.
3. User chooses one historical weather scenario, gets a model response and sees explanation of conditional/severity-only scope.
4. Network analysis demonstrates a small selected/illustrative graph and an intervention; no false asset-level claims.
5. Spoken or typed query can ask for an analysis, Gemini validates/returns a structured proposal; ElevenLabs can transcribe at least one phrase and/or narrate output (voice network permitting).
6. Manual control works during API failure, and UI never presents simulated output as real.
7. Responsiveness, source attributions, keyboard navigation, legends, uncertainty, test suite, and rehearsed demo.

## Team roles
Lead/integrator, frontend/3D, ML/data, infrastructure/analysis, AI/voice. If only 3 people, combine infrastructure with ML and AI/voice with lead. Use worktrees on shared machines; separate clones on separate laptops.
