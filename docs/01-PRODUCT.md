# Product Spec (P0/P1/P2/P3)

## Target user and decision
Infrastructure planners, insurers, disaster-preparedness analysts and students can explore **which areas may experience more severe storm-associated outages** and which hypothetical repair/inspection priorities could protect connectivity of critical services. Intended for exploratory teaching/triage, not operational dispatch or real-world safety certification.

## P0: instantly legible Earth console
- `/` starts directly inside desktop-first app. Left: scenario rail. Center: full-bleed interactive Cesium globe. Right: context-aware inspector. Bottom: time/simulation strip and provenance.
- Camera orbit, pan, zoom; one-click fly to Houston preset; 3D imagery if configured; fallback stable on slow or unconfigured devices.
- County overlays (severity buckets, not fabricated point predictions), legend, hover county/name/source/inputs and click to pin.
- Mock only with explicit large `DEMO DATA` flag; no fake live countdowns, irrelevant glows, random synthetic catastrophe metrics.

## P1: ML-grounded storms and outage severity
- Preset: documented historical warning event(s) loaded from curated data subset. Select warning type/event/time and supported county.
- What-if sliders only for features actually available to model. Mark all perturbations `Exploratory: not a real forecast`; if a requested feature cannot be modeled, disable with explanation.
- Display expected outage severity *under archive's positive-outage/warning selection*, relative comparison and factual model metrics. Never claim raw percent risk unless calibrated on unbiased examples.
- Source/method card explains source, timestamp/period, target, bias, and baseline comparison.

## P2: infrastructure connectivity and interventions
- Show roads/critical facilities extracted from separately licensed OSM/OSMnx or a clearly labeled curated sample graph.
- Assess **network connectivity under hypothetical node/edge removals**, not actual electrical grid physics. Visually identify cut edges and access paths.
- User can select up to three illustrative assets/road edges to inspect or protect; score by maintained connectivity/weighted service access with stated utility weights. Show baseline versus scenario.
- Game-theory sponsor track: optional explicit strategic resource-allocation scenario with 2 independent agencies, finite budgets, action choices, payoff functions, and comparative independent vs coordinated outcome. Don't call shortest-path alone game theory.

## P3: voice, AI and polish
- Push-to-talk ElevenLabs speech transcription to text input. Typed fallback. Optional spoken ElevenLabs briefing.
- Gemini maps input to allowlisted functions: `select_region`, `select_preset`, `set_scenario_parameter`, `run_model`, `toggle_overlay`, `compare_intervention`, `explain_result`. User must confirm destructive/expensive changes.
- Gemini explanations grounded in actual model + provenance. Do not invent events, statistics or infrastructure facts.
- One guided narrative (~90 seconds) explaining baseline, impact, mitigation and limitations.

## Out of scope for this hackathon
- Accurate global multi-disaster physical simulator or real-time forecasting.
- Road flood-depth prediction from aerial imagery, global city asset-level predictions, earthquake/tsunami/fire fluid physics, guaranteed safety routes.
- Arbitrary uploaded datasets, geospatial heavy ETL in browser, user billing, auth, social features, 3D editing of buildings.
- Autonomous emergency recommendations for responders.

## User language
Use `modeled outage severity`, `exploratory scenario`, `network connectivity under assumed disruptions`, `inspect first`, `historical warning context`.
Avoid `these roads WILL flood`, `90% chance this transformer fails`, `we saved 5,000 lives`, `certified safe`, `real-time truth`.
