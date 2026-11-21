import { useEffect, useRef, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Credit,
  Entity,
  GeoJsonDataSource,
  ImageryLayer,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  Viewer,
  buildModuleUrl,
} from "cesium";
import { offlineCounties, type Prediction } from "@earthlab/contracts";
import { counties, useConsoleStore } from "../../app/store";

const bucketColors = ["#688a83", "#dda35c", "#c65c4a"];

export default function Globe({ predictions }: { predictions: Prediction[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const sourceRef = useRef<GeoJsonDataSource | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState("");
  const scene = useConsoleStore((state) => state.scene);
  const sceneRevision = useConsoleStore((state) => state.sceneRevision);
  const overlayVisible = useConsoleStore((state) => state.overlayVisible);
  const pinnedCounty = useConsoleStore((state) => state.pinnedCounty);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    const imageryListeners: (() => void)[] = [];
    let viewer: Viewer;
    try {
      const baseLayer = ImageryLayer.fromProviderAsync(TileMapServiceImageryProvider.fromUrl(
        buildModuleUrl("Assets/Textures/NaturalEarthII"),
        { credit: new Credit("Natural Earth II · public domain") },
      ));
      const reportImageryFailure = () => {
        if (!disposed) setError("Local globe imagery could not load. The basic globe and county controls remain available.");
      };
      imageryListeners.push(baseLayer.errorEvent.addEventListener(reportImageryFailure));
      imageryListeners.push(baseLayer.readyEvent.addEventListener((provider) => {
        if (!disposed) imageryListeners.push(provider.errorEvent.addEventListener(reportImageryFailure));
      }));
      viewer = new Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        shouldAnimate: false,
        baseLayer,
      });
    } catch {
      disposed = true;
      imageryListeners.forEach((remove) => remove());
      setError("3D rendering is unavailable on this device. County controls and the offline example remain available.");
      return;
    }
    viewerRef.current = viewer;
    viewer.scene.backgroundColor = Color.fromCssColorString("#171d21");
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.baseColor = Color.fromCssColorString("#2f484d");
    viewer.scene.fog.enabled = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(-96, 25, 19_000_000) });
    viewer.resolutionScale = Math.min(window.devicePixelRatio, 1.5);

    let previous = performance.now();
    const removeOrbit = viewer.scene.postRender.addEventListener(() => {
      const now = performance.now();
      const elapsed = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const state = useConsoleStore.getState();
      if (state.rotating && state.scene === "earth") viewer.camera.rotate(Cartesian3.UNIT_Z, elapsed * 0.025);
    });
    const removeRenderError = viewer.scene.renderError.addEventListener(() => {
      if (!disposed) setError("The 3D view stopped rendering. County controls and the offline example remain available.");
    });
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    const getCounty = (position: Cartesian2) => {
      const picked: unknown = viewer.scene.pick(position);
      if (picked && typeof picked === "object" && "id" in picked && picked.id instanceof Entity) {
        const fips: unknown = picked.id.properties?.countyFips?.getValue(viewer.clock.currentTime);
        return counties.find((county) => county.fips === fips);
      }
      return undefined;
    };
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const county = getCounty(movement.position);
      if (county) useConsoleStore.getState().dispatch({ action: "PIN_COUNTY", args: { countyFips: county.fips } });
    }, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const county = getCounty(movement.endPosition);
      setHovered(county ? `${county.name} County · schematic example · click to inspect` : "");
    }, ScreenSpaceEventType.MOUSE_MOVE);
    const stopOrbit = () => useConsoleStore.getState().dispatch({ action: "SET_ROTATION", args: { rotating: false } });
    viewer.scene.canvas.addEventListener("pointerdown", stopOrbit);

    GeoJsonDataSource.load(offlineCounties, {
      clampToGround: false,
      stroke: Color.fromCssColorString("#eee9dc"),
      strokeWidth: 2,
      fill: Color.fromCssColorString("#dda35c").withAlpha(0.6),
    }).then((source) => {
      if (disposed) return;
      sourceRef.current = source;
      void viewer.dataSources.add(source);
      setReady(true);
    }).catch(() => {
      if (!disposed) setError("Schematic overlay could not load. Use the county list to inspect the bundled example.");
    });

    return () => {
      disposed = true;
      imageryListeners.forEach((remove) => remove());
      handler.destroy();
      removeOrbit();
      removeRenderError();
      viewer.scene.canvas.removeEventListener("pointerdown", stopOrbit);
      sourceRef.current = null;
      viewerRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const destination = scene === "houston"
      ? Cartesian3.fromDegrees(-95.5, 29.525, 340_000)
      : Cartesian3.fromDegrees(-96, 25, 19_000_000);
    viewer.camera.flyTo({ destination, duration: reduced ? 0 : 2.2,
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 } });
  }, [scene, sceneRevision, ready]);

  useEffect(() => {
    const source = sourceRef.current;
    const viewer = viewerRef.current;
    if (!source || !viewer) return;
    source.show = overlayVisible;
    for (const entity of source.entities.values) {
      const fips: unknown = entity.properties?.countyFips?.getValue(viewer.clock.currentTime);
      const prediction = predictions.find((item) => item.countyFips === fips);
      const bucket = prediction?.dataMode === "offline_example"
        ? Math.max(0, Math.min(2, Math.round(prediction.predictedSeverity) - 1))
        : 0;
      if (entity.polygon) {
        entity.polygon.material = new ColorMaterialProperty(Color.fromCssColorString(bucketColors[bucket]).withAlpha(fips === pinnedCounty ? 0.85 : 0.6));
        entity.polygon.outline = new ConstantProperty(true);
        entity.polygon.outlineColor = new ConstantProperty(Color.fromCssColorString(fips === pinnedCounty ? "#ffffff" : "#eee9dc"));
        entity.polygon.height = new ConstantProperty(fips === pinnedCounty ? 500 : 100);
      }
    }
  }, [ready, predictions, overlayVisible, pinnedCounty]);

  return (
    <div className="globe-stage" aria-label="Interactive Earth and schematic Houston county overlays">
      <div className="cesium-mount" ref={containerRef} />
      {error && <div className="map-error" role="status">{error}</div>}
      <div className="map-hover" role="status">{hovered}</div>
    </div>
  );
}
