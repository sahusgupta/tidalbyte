# Houston aerial display fixtures

These two bounded, lossy WebP derivatives support offline display in Cesium and the accessible SVG atlas. They are under 0.8 MB each. Raw service downloads are excluded. Exact requested/exported extents, transformation, source period, limitations and credits are recorded in `provenance.json`.

Source: [USGS ImageryOnly service](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer). Its service metadata describes CONUS NAIP source imagery from 2017–2021 and a June 2024 refresh, credits USDA/USGS, permits tile export, and identifies CONUS orthoimagery as public domain. [USGS reproduction guidance](https://www.usgs.gov/faqs/are-usgs-topographic-maps-copyrighted) identifies the geographically limited imagery exceptions; they do not cover this Houston extract. Retain USDA / USGS credit in the map.

This is archival visualization, not a current road/weather feed or measured flood/terrain evidence. No Google tiles are used, cached, extracted, or used to train models. The map uses an ellipsoid; local tilt is an inspection convenience, not reconstructed terrain or photorealistic buildings.

Optional `VITE_ATLAS_IMAGERY_URL` may configure a licensed image-tile template. Set `VITE_ATLAS_IMAGERY_CREDIT` to the provider's required attribution. The layer is removed on a provider error and the local USGS reference remains. With neither variable set, there are no runtime imagery requests to external services.

`storm-eye.svg` is an original EarthLab vector marker (CC0), separate from the aerial reference. It denotes the manually drawn hypothetical scenario, with no observed storm data implied.
