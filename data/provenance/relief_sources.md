# Relief money overlay: census and vulnerability inputs

Used by `ml/relief/build_relief.py` to write `simulator/frontend/public/relief/<region>.json` (five files, 143 KB in all).
Raw downloads stay outside Git (`../ml-work/data/raw/svi/` on the building machine). Downloaded 2026-11-21.

| File | Source | License | SHA-256 |
|---|---|---|---|
| `SVI_2022_Texas.csv` (4.98 MB) | CDC/ATSDR Social Vulnerability Index 2022, Texas census tracts: https://svi.cdc.gov/Documents/Data/2022/csv/states/Texas.csv | U.S. federal government work, public domain. Cite CDC/ATSDR SVI 2022. | `e6255bb896298afcbb4121eb1301be0c63df8de0efc0986189402db4d5bea22a` |
| `tracts2020_harris_{0,500,1000}.geojson` (3.4 MB) | Census TIGERweb, 2020 census tracts (layer 10), Harris County (48201), outSR 4326, 5-decimal geometry: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/10 | U.S. Census Bureau, public domain | `eec1786e…c6045`, `ad0a4710…20bb5d`, `7c1e44c0…23` |
| `tracts2020_montgomery_0.geojson` (0.8 MB) | Same layer, Montgomery County (48339); the Kingwood map box crosses the county line | U.S. Census Bureau, public domain | `0ed8ac3c95000bb2cc7fd14a9c643a95f1f6839af9dbcb51dc0cb36cbb91b4c9` |

Neighbourhood names come from the Overture `division` points the simulator pipeline already downloads (`simulator/data/raw/<region>/division.parquet`, CDLA Permissive 2.0 / ODbL by theme; see Overture attribution).

## Processing

- Tracts are joined to SVI on GEOID (1,248 polygons, all matched) and clipped to each simulator region's map box.
- Residents in a clipped part = ACS 2018–2022 tract population × share of the tract's land area inside the box. Parts under 50 residents are dropped.
- Kept fields: Texas SVI percentile (`RPL_THEMES`) and the percent of residents below 150% of poverty, in households without a vehicle, aged 65+, with a disability, uninsured, and with limited English. SVI's −999 missing marker becomes `null`.
- Outlines are simplified to about 20 m for display.
- No flood impact is stored. The simulator derives it in the browser from each modeled result.
