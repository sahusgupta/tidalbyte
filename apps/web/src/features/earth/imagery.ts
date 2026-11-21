/**
 * Imagery that stays sharp when zooming in.
 *
 * Default (no keys): USGS The National Map orthoimagery as a tiled service. It covers the whole
 * globe at small scales and the United States down to ~2 m/pixel (zoom 16). Public domain.
 * Optional: Google Photorealistic 3D Tiles (true 3D streets and buildings) when either
 * VITE_GOOGLE_MAPS_TILES_KEY or VITE_CESIUM_ION_TOKEN is set in the repository-root .env.
 * The tiles are display only: Google's terms forbid scraping or deriving data from them.
 */
import {
  Credit,
  GoogleMaps,
  ImageryLayer,
  Ion,
  Rectangle,
  UrlTemplateImageryProvider,
  createGooglePhotorealistic3DTileset,
  type Cesium3DTileset,
  type Viewer,
} from "cesium";

export const USGS_IMAGERY_URL =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";
export const USGS_MAX_LEVEL = 16;
const usgsCredit = () =>
  new Credit(
    '<a href="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer" target="_blank" rel="noopener">Imagery: USDA / USGS The National Map</a>',
    true,
  );

/** Tiled USGS orthoimagery; pass `bounds` ([w, s, e, n] degrees) to restrict requests to an area. */
export function usgsImageryLayer(bounds?: readonly [number, number, number, number]): ImageryLayer {
  return new ImageryLayer(
    new UrlTemplateImageryProvider({
      url: USGS_IMAGERY_URL,
      maximumLevel: USGS_MAX_LEVEL,
      credit: usgsCredit(),
      ...(bounds ? { rectangle: Rectangle.fromDegrees(...bounds) } : {}),
    }),
  );
}

/** Render at the display's real pixel density and refine terrain/imagery tiles sooner. */
export function sharpenRendering(viewer: Viewer, maxScale = 2) {
  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, maxScale);
  viewer.scene.globe.maximumScreenSpaceError = 1.33;
  viewer.scene.globe.tileCacheSize = 400;
}

export type PhotorealSource = "google" | "cesium-ion";

export function photorealConfigured(): PhotorealSource | null {
  if (import.meta.env.VITE_GOOGLE_MAPS_TILES_KEY?.trim()) return "google";
  if (import.meta.env.VITE_CESIUM_ION_TOKEN?.trim()) return "cesium-ion";
  return null;
}

/** Adds Google Photorealistic 3D Tiles when a key or ion token is configured; null otherwise. */
export async function addPhotorealTiles(viewer: Viewer): Promise<Cesium3DTileset | null> {
  const source = photorealConfigured();
  if (!source) return null;
  if (source === "google") GoogleMaps.defaultApiKey = import.meta.env.VITE_GOOGLE_MAPS_TILES_KEY.trim();
  else Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN.trim();
  const tileset = await createGooglePhotorealistic3DTileset(
    source === "google" ? { key: import.meta.env.VITE_GOOGLE_MAPS_TILES_KEY.trim() } : undefined,
    { maximumScreenSpaceError: 8, showCreditsOnScreen: true },
  );
  if (viewer.isDestroyed()) return null;
  viewer.scene.primitives.add(tileset);
  return tileset;
}
