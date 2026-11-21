/** Local reference first; optional remote imagery is display-only and never persisted. */
import {
  Cartesian2,
  Cartographic,
  Credit,
  GoogleMaps,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  Rectangle,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  buildModuleUrl,
  createGooglePhotorealistic3DTileset,
  type Cesium3DTileset,
  type Viewer,
} from "cesium";

export const USGS_IMAGERY_URL =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";
export const USGS_MAX_LEVEL = 16;
export const HOUSTON_IMAGERY_BOUNDS = [-95.9, 29.24, -94.7, 30.2] as const;
const usgsCredit = () =>
  new Credit(
    '<a href="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer" target="_blank" rel="noopener">Imagery: USDA / USGS The National Map</a>',
    true,
  );

/** Low-level factory retained for callers that explicitly manage layer loading themselves. */
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

/** Cesium already multiplies by devicePixelRatio when recommended resolution is false. */
export function sharpenRendering(viewer: Viewer, maxScale = 2) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = Math.min(dpr, maxScale) / dpr;
  viewer.scene.globe.maximumScreenSpaceError = 1.33;
}

export interface ImageryStatus {
  kind: "local" | "loading" | "detail" | "fallback";
  label: string;
  credit: string;
  warning?: string;
}

interface DetailOptions {
  bounds: readonly [number, number, number, number];
  activateBelowHeight: number;
  minimumDetailLevel: number;
  onStatus: (status: ImageryStatus) => void;
  localLabel: string;
  localCredit: string;
  url?: string;
  detailCredit?: string;
}

/**
 * Add detail only when close to its bounded coverage. Transparent parent levels
 * keep the local reference visible while real detail loads; a coarse opaque
 * ancestor tile must never cover a sharper bundled image.
 */
export function installZoomDetail(viewer: Viewer, options: DetailOptions): () => void {
  let disposed = false;
  let failed = false;
  let detailReady = false;
  let loading = false;
  let layer: ImageryLayer | undefined;
  let removeError: (() => void) | undefined;
  let timeout: number | undefined;
  let lastStatus = "";
  const transparent = document.createElement("canvas");
  transparent.width = 1;
  transparent.height = 1;
  const report = (status: ImageryStatus) => {
    if (disposed) return;
    const key = JSON.stringify(status);
    if (key !== lastStatus) {
      lastStatus = key;
      options.onStatus(status);
    }
  };
  const local = (): ImageryStatus => ({
    kind: "local",
    label: options.localLabel,
    credit: options.localCredit,
  });
  const removeLayer = () => {
    if (layer && !viewer.isDestroyed() && viewer.imageryLayers.contains(layer)) {
      viewer.imageryLayers.remove(layer, true);
    }
    layer = undefined;
  };
  const fail = () => {
    if (disposed || failed) return;
    failed = true;
    if (timeout !== undefined) window.clearTimeout(timeout);
    if (layer) layer.show = false;
    report({
      ...local(),
      kind: "fallback",
      warning: "Remote detail unavailable; using the bundled reference.",
    });
    // Provider errors can arrive during Cesium's imagery update.
    queueMicrotask(() => {
      removeError?.();
      removeError = undefined;
      removeLayer();
    });
  };
  const eligible = () => {
    const height = viewer.camera.positionCartographic.height;
    if (height > options.activateBelowHeight) return false;
    const world = viewer.camera.pickEllipsoid(
      new Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2),
      viewer.scene.globe.ellipsoid,
    );
    const point = world ? Cartographic.fromCartesian(world) : viewer.camera.positionCartographic;
    const lon = CesiumMath.toDegrees(point.longitude),
      lat = CesiumMath.toDegrees(point.latitude);
    return (
      lon >= options.bounds[0] &&
      lon <= options.bounds[2] &&
      lat >= options.bounds[1] &&
      lat <= options.bounds[3]
    );
  };
  const update = () => {
    if (disposed || failed || viewer.isDestroyed()) return;
    if (!eligible()) {
      if (layer) layer.show = false;
      report(local());
      return;
    }
    if (!layer) {
      const provider = new UrlTemplateImageryProvider({
        url: options.url || USGS_IMAGERY_URL,
        rectangle: Rectangle.fromDegrees(...options.bounds),
        maximumLevel: USGS_MAX_LEVEL,
        credit: options.detailCredit ? new Credit(options.detailCredit, true) : usgsCredit(),
        enablePickFeatures: false,
      });
      const requestImage = provider.requestImage.bind(provider);
      provider.requestImage = (x, y, level, request) => {
        if (level < options.minimumDetailLevel) return Promise.resolve(transparent);
        if (disposed || failed) return undefined;
        if (!loading && !detailReady) {
          loading = true;
          report({
            ...local(),
            kind: "loading",
            label: options.localLabel + " · loading detail",
          });
          timeout = window.setTimeout(fail, 8000);
        }
        const image = requestImage(x, y, level, request);
        return image?.then((value) => {
          if (!disposed && !failed) {
            detailReady = true;
            if (timeout !== undefined) window.clearTimeout(timeout);
            if (eligible())
              report({
                kind: "detail",
                label: options.url ? "Configured imagery detail" : "USGS tiled aerial detail",
                credit:
                  options.detailCredit || "USDA / USGS The National Map · archival aerial imagery",
              });
          }
          return value;
        });
      };
      removeError = provider.errorEvent.addEventListener((error) => {
        error.retry = false;
        fail();
      });
      layer = new ImageryLayer(provider);
      Object.assign(layer, {
        saturation: 0.48,
        brightness: 0.79,
        contrast: 1.13,
        gamma: 1.12,
      });
      viewer.imageryLayers.add(layer);
    }
    layer.show = true;
    if (!detailReady && !loading) report(local());
    else if (detailReady)
      report({
        kind: "detail",
        label: options.url ? "Configured imagery detail" : "USGS tiled aerial detail",
        credit: options.detailCredit || "USDA / USGS The National Map · archival aerial imagery",
      });
  };
  report(local());
  const removeUpdate = viewer.scene.preRender.addEventListener(update);
  return () => {
    disposed = true;
    removeUpdate();
    removeError?.();
    if (timeout !== undefined) window.clearTimeout(timeout);
    removeLayer();
  };
}

/**
 * EarthView: baseLayer:false, then call this helper and run its cleanup before
 * destroying the viewer. Natural Earth is local/global. Best-effort USGS detail
 * is restricted to Houston (including Kingwood); no Alaska/SPOT licensed data.
 */
export function installEarthImagery(
  viewer: Viewer,
  onStatus: (status: ImageryStatus) => void,
): () => void {
  let disposed = false;
  const base = ImageryLayer.fromProviderAsync(
    TileMapServiceImageryProvider.fromUrl(buildModuleUrl("Assets/Textures/NaturalEarthII"), {
      credit: new Credit("Natural Earth II · public-domain cartography", true),
    }),
  );
  viewer.imageryLayers.add(base, 0);
  const localFailure = base.errorEvent.addEventListener(() => {
    if (!disposed)
      onStatus({
        kind: "fallback",
        label: "Basic globe",
        credit: "CesiumJS",
        warning: "Bundled Natural Earth imagery is unavailable.",
      });
  });
  const stopDetail = installZoomDetail(viewer, {
    bounds: HOUSTON_IMAGERY_BOUNDS,
    activateBelowHeight: 200_000,
    minimumDetailLevel: 10,
    onStatus,
    localLabel: "Natural Earth II",
    localCredit: "Natural Earth II · public-domain cartography",
  });
  return () => {
    disposed = true;
    stopDetail();
    localFailure();
    if (!viewer.isDestroyed() && viewer.imageryLayers.contains(base))
      viewer.imageryLayers.remove(base, true);
  };
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
  if (source === "google")
    GoogleMaps.defaultApiKey = import.meta.env.VITE_GOOGLE_MAPS_TILES_KEY.trim();
  else Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN.trim();
  const tileset = await createGooglePhotorealistic3DTileset(
    source === "google" ? { key: import.meta.env.VITE_GOOGLE_MAPS_TILES_KEY.trim() } : undefined,
    { maximumScreenSpaceError: 8, showCreditsOnScreen: true },
  );
  if (viewer.isDestroyed()) return null;
  viewer.scene.primitives.add(tileset);
  return tileset;
}
