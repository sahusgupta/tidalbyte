# Verified Reference Sources and Dataset Access

Check each provider's current license, service limits, access terms and attribution before redistribution. These are **source URLs**, not automatically downloaded materials. Keep original provenance metadata when curating small data subsets.

1. **Harmonized NWS weather warning / positive county-outage data 2015–2024, v2 (open)**: https://zenodo.org/records/22651795 . Paired publication: https://www.nature.com/articles/s41597-026-08356-z . WARNING: matched records are selected positive outage + warning cases; cannot train absolute outage-occurrence classifier without representative negatives.
2. **NOAA Storm Events Database**, CSV/bulk: https://www.ncei.noaa.gov/access/storm-events-database/ . Event history and contextual validation, not turnkey outage training labels.
3. **OpenStreetMap Texas regional extracts via Geofabrik**: https://download.geofabrik.de/north-america/us/texas.html . State-wide raw PBF ~hundreds MB; prefer bounding-box or curated small extract. Follow ODbL attribution/share-alike conditions when applicable.
4. **CesiumJS Google Photorealistic 3D Tiles quickstart**: https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/ . Configure token/key, geocoding, attribution and service billing. It's a visual layer, NOT ML training data.
5. **Google Map Tiles API policies**: https://developers.google.com/maps/documentation/tile/policies . Explicitly prohibit nonvisual image analysis, object identification and geodata extraction; do not cache outside permitted limits.
6. **Google Gemini function calling**: https://codelabs.developers.google.com/codelabs/gemini-function-calling . The API returns structured tool-call requests; the application performs validated actions.
7. **ElevenLabs speech-to-text**: https://elevenlabs.io/docs/overview/capabilities/speech-to-text . Use server-side access for transcription; check quotas.
8. **Google Map Tiles API overview**: https://developers.google.com/maps/documentation/tile/quick-reference . Geographic imagery/zoom coverage varies; don't promise photorealistic coverage everywhere.
9. **CDC/ATSDR Social Vulnerability Index 2022 (census tracts)**: https://www.atsdr.cdc.gov/place-health/php/svi/ . Population and vulnerability measures behind the simulator's Relief money overlay. ACS 2018–2022 estimates; percentiles rank tracts within Texas. Public domain; see `data/provenance/relief_sources.md`.
10. **Census TIGERweb 2020 census tracts**: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/10 . Tract outlines for Harris and Montgomery counties, clipped to each simulator region.

## Required review before launch
- Record exact downloaded file names, date, revision, size and licenses in `data/provenance/`.
- Record access barriers: e.g. restricted datasets are **not** an MVP dependency.
- Do not publish Google imagery assets, large third-party data or downloaded raw datasets inside this Git repo.
