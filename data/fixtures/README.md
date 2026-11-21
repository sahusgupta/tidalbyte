# Offline fixture v1

`offline-evaluation.json` and `houston-counties.geojson` are original EarthLab
demonstration fixtures, released under CC0-1.0. Source ID:
`project:offline-fixture-v1`. No provider data or historical observations are used.

County names and FIPS identify the intended Houston-area selections. Polygon
rectangles are **schematic placeholders**, not official county boundaries. The
event ID `example-warning-001`, warning type and timestamp are arbitrary scenario
context, not a documented historical warning. Indices 0–3 are arbitrary display
examples; they do not represent customers, probabilities, measurements or model
predictions. `modelVersion: offline-fixture-v1` identifies the fixture revision,
not a trained estimator. Evaluation metrics are null and datasets are empty.

Replace geometry through the frontend/data handoff only after recording source,
license, download date, simplification method and coordinate reference system.
Do not derive geometry or training data from Google Photorealistic 3D Tiles.
