# Sources and citations: Harvey flood-depth model

Accessed 2026-11-21. Every raw download stays under `data/raw/` (local only, never committed).
DOIs below were checked to resolve to the named dataset on the access date.

## Data used by the model

### 1. Flood depth labels and high-water marks: USGS Hurricane Harvey flood documentation
- **Data:** Watson, K.M., Welborn, T.L., Stengel, V.G., Wallace, D.S., and McDowell, J.S., 2018, *Data used to characterize peak streamflows and flood inundation resulting from Hurricane Harvey of selected areas in southeastern Texas and southwestern Louisiana, August–September 2017*: U.S. Geological Survey data release, https://doi.org/10.5066/F7VH5N3N
- **Report:** Watson, K.M., Harwell, G.R., Wallace, D.S., Welborn, T.L., Stengel, V.G., and McDowell, J.S., 2018, *Characterization of peak streamflows and flood inundation of selected areas in southeastern Texas and southwestern Louisiana from the August and September 2017 flood resulting from Hurricane Harvey*: U.S. Geological Survey Scientific Investigations Report 2018–5070, 44 p., https://doi.org/10.3133/sir20185070
- **Used:** 4 of 7 basins (San Jacinto, Brazos, San Bernard, coastal creeks): mapped-area boundaries, inundation polygons, depth rasters (1.4–10 m), surveyed high-water marks. Download is about 1.4 GB, with ScienceBase MD5 checksums verified where provided.
- **Coverage note:** the release covers selected river reaches. In Harris County that is only the San Jacinto corridor (Kingwood, Humble, Lake Houston). Buffalo, Brays, and White Oak bayous are **not** included.
- **Handling notes:**
  - Depth rasters are stored in **feet**, although horizontal units are metres. This was verified against the high-water-mark heights above ground (median ratio ~1.0); values were converted to metres.
  - The ESRI-grid rasters carry no EPSG code. Their bounds match the boundary polygons in EPSG:6579 (92–100% overlap), so EPSG:6579 is assumed.
  - The "upper Brazos" zip contains a file named `brazos_lower_depth.tif`; this is a naming quirk in the release.
  - The coastal surge layer (`coast_peak`, Rockport area) was not used.
- **License:** no license is stated on the ScienceBase item. USGS-produced data are U.S. public domain under USGS policy (https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits); please credit USGS.

### 2. Ground elevation: USGS 3D Elevation Program (3DEP)
- U.S. Geological Survey, 3D Elevation Program bare-earth DEM, via the `3DEPElevation` ImageServer (https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer).
- Requested as 20 m tiles in EPSG:6579 with bilinear resampling of the best available 3DEP source; Houston-area sources are lidar-derived. LidarExplorer is a viewer for the same 3DEP lidar program.
- Derived features: slope, depression depth, D8 flow accumulation, HAND, TWI, TPI, computed with pysheds (see Software).
- License: U.S. public domain (USGS).

### 3. Impervious surface and open water: NLCD 2016 (USGS / MRLC)
- U.S. Geological Survey, *National Land Cover Database (NLCD) 2016 Products* (ver. 3.0, November 2023): USGS data release, https://doi.org/10.5066/P96HHBIE
- Accessed through the MRLC GeoServer WCS (https://www.mrlc.gov/geoserver/ows), coverages `mrlc_download__NLCD_2016_Impervious_L48` and `mrlc_download__NLCD_2016_Land_Cover_L48`. Both were area-averaged to 20 m. Class 11 (open water) is used to exclude permanent water from labels.
- **Substitution:** the plan named *USGS Annual NLCD*. On 2026-11-21 the MRLC service returned a server error for every time-sliced Annual NLCD request ("startTime is null"), so NLCD 2016 was used instead. It is the closest pre-Harvey epoch.
- License: U.S. public domain (USGS); credit MRLC / USGS.

### 4. Rainfall: NOAA GHCN-Daily (COOP + CoCoRaHS stations)
- Menne, M.J., Durre, I., Korzeniewski, B., McNeill, S., Thomas, K., Yin, X., Anthony, S., Ray, R., Vose, R.S., Gleason, B.E., and Houston, T.G., 2012, *Global Historical Climatology Network – Daily (GHCN-Daily), Version 3*: NOAA National Climatic Data Center, https://doi.org/10.7289/V5D21VHZ
- Menne, M.J., Durre, I., Vose, R.S., Gleason, B.E., and Houston, T.G., 2012, An overview of the Global Historical Climatology Network-Daily database: *Journal of Atmospheric and Oceanic Technology*, 29, 897–910, https://doi.org/10.1175/JTECH-D-11-00103.1
- Daily PRCP for 1,525 stations in SE Texas (28.0–31.2°N, 97.6–93.5°W) for Harvey (2017-08-25 to 09-01), Tax Day 2016, Imelda 2019, Nicholas 2021, and Beryl 2024. Retrieved through the NCEI Access Data Service (https://www.ncei.noaa.gov/access/services/data/v1).
- Harvey storm totals from 325 stations that reported at least 85% of storm days were interpolated by inverse distance weighting.
- Includes volunteer observations from **CoCoRaHS** (Community Collaborative Rain, Hail and Snow Network, https://www.cocorahs.org).
- License: NOAA data are U.S. public domain.

## Data fetched for event context and replays (not model features yet)

### 5. River stage: USGS National Water Information System
- U.S. Geological Survey, 2026, *National Water Information System data available on the World Wide Web (USGS Water Data for the Nation)*, accessed 2026-11-21, https://doi.org/10.5066/F7P55KJN
- 15-minute gage height (00065) for 168 sites in 16 SE Texas counties during Harvey, Tax Day 2016, Imelda, Nicholas, and Beryl, plus a July 2017 normal-flow reference.
- Example: Buffalo Bayou at Houston (08074000) rose from 5.2 ft to 28.0 ft during Harvey.
- USGS precipitation (00045) series exist for 15–18 sites, but the service returned no values for any of these events. That is why rainfall comes from NOAA instead.

### 6. Tornado tracks: NOAA Storm Prediction Center
- NOAA/NWS Storm Prediction Center, *Severe Weather Database Files*, `1950-2024_actual_tornadoes.csv`, https://www.spc.noaa.gov/wcm/
- Start/end coordinates, path length/width, EF rating, injuries, and fatalities, for real tornado replays. U.S. public domain.

## Named in the plan but not available from this machine
- **Harris County Flood Warning System (HCFCD) rainfall and bayou levels, 5-minute data:** the training session did not obtain a bulk download. This does not establish that public bulk downloads are unavailable; check the FWS Document Library and historical export options before requesting data from the Harris County Flood Control District (https://www.hcfcd.org/Community/Contact-Us/Public-Information-Requests). The site disclaimer states that HCFCD makes no warranties as to the accuracy or completeness of the information.
- **USGS STN Flood Event Viewer high-water marks** (Harvey, Imelda, and Beryl, including central Houston bayous): the service returned HTTP 403 to automated requests from this machine. A CSV exported from https://stn.wim.usgs.gov/FEV/ in a browser would add central-Houston validation points.

## Software
- Bartos, M., Smith, T.J., Grout, R., and others, *pysheds* (v0.5 used), https://doi.org/10.5281/zenodo.3822494
- Pedregosa et al., 2011, Scikit-learn: Machine Learning in Python, *JMLR* 12, 2825–2830 (scikit-learn 1.9.1 used).
- rasterio, GeoPandas, pyproj, NumPy, pandas, SciPy.
