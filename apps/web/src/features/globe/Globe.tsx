import { useEffect, useRef, useState } from "react";
import {
  BoundingSphere,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  CustomDataSource,
  DistanceDisplayCondition,
  Entity,
  HeadingPitchRange,
  HorizontalOrigin,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  Matrix4,
  PolygonHierarchy,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  Viewer,
  buildModuleUrl,
} from "cesium";
import { offlineCounties, type Prediction, type AllocationFootprint } from "@earthlab/contracts";
import {
  HOUSTON_ARCHIVE_LAYERS,
  createHoustonArchiveLayer,
  installZoomDetail,
  sharpenRendering,
  type ImageryStatus,
} from "../earth/imagery";
import type { AtlasMode, BookmarkId, EditorTool, Point, RoadSegment } from "../../atlas/domain";
import { FLOOD_RADIUS_LIMITS, getFloodPolygon } from "../../atlas/domain";
import { FlatMap, HOUSTON_OVERVIEW_CENTER } from "./FlatMap";
import { MapMeasure } from "./MapMeasure";
import type { PlanningAsset } from "../allocation/map";
import { addMeasurementPoint } from "./measurement";
import {
  BOOKMARKS,
  BOUNDS,
  clampPoint,
  distanceKm,
  pointAtRadius,
  type DragTarget,
} from "./mapGeometry";
import "./atlas-map.css";

export interface AtlasMapProps {
  planningAssets?: PlanningAsset[];
  planningFootprint?: AllocationFootprint | null;
  onPlanningAsset?: (id: string) => void;
  roads: RoadSegment[];
  track: Point[];
  stormPosition: Point;
  floodCenter: Point;
  floodRadiusKm: number;
  currentFloodRadiusKm: number;
  progress: number;
  mode: AtlasMode;
  selectedRoadId: string | null;
  closedRoadIds: string[];
  disconnectedRoadIds?: string[];
  comparison: boolean;
  tool: EditorTool;
  mapStyle?: "field" | "aerial";
  bookmark: BookmarkId;
  cameraRevision: number;
  showRoads?: boolean;
  /** Hazard visibility in either hurricane or flood mode. */
  showFlood?: boolean;
  countyPredictions?: Prediction[];
  baselineTrack?: Point[];
  baselineFloodCenter?: Point;
  baselineFloodRadiusKm?: number;
  onRoadSelect: (id: string) => void;
  onTrackChange: (points: Point[]) => void;
  onFloodChange: (center: Point, maxRadiusKm: number) => void;
  onMapPoint: (point: Point) => void;
  onResetView?: () => void;
}

const colors = {
  road: "#c9cec3",
  selected: "#fff5dc",
  closed: "#d58b76",
  disconnected: "#b2a4c1",
  ink: "#202c28",
};
const c = (hex: string, alpha = 1) => Color.fromCssColorString(hex).withAlpha(alpha);
const positions = (points: Point[], height = 65) =>
  points.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, height));
// Avoid asynchronous geometry queues while timeline edits replace entities.
const linePositions = (points: Point[], height = 65) => {
  const packed = positions(points, height);
  return new CallbackProperty(() => packed, false);
};
const label = (text: string, extra: object = {}) => ({
  text,
  font: '500 12px "Source Sans 3", sans-serif',
  fillColor: c("#f5f0dc"),
  outlineColor: c("#101c16"),
  outlineWidth: 4,
  style: LabelStyle.FILL_AND_OUTLINE,
  showBackground: false,
  pixelOffset: new Cartesian2(0, -13),
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
  ...extra,
});
const framedTarget = (bookmark: BookmarkId, canvas: HTMLCanvasElement) => {
  const target = BOOKMARKS[bookmark];
  const aspect = Math.max(0.4, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  const portraitOverview = bookmark === "houston" && aspect < 1.2;
  return bookmark === "houston"
    ? {
      point: [HOUSTON_OVERVIEW_CENTER[0], HOUSTON_OVERVIEW_CENTER[1] - (portraitOverview ? 0.035 : 0)] as Point,
      range: Math.min(110000, target.range * Math.max(1, 0.76 / aspect)),
      pitch: portraitOverview ? -82 : -66,
    }
    : { ...target, pitch: -66 };
};

export default function Globe(props: AtlasMapProps) {
  const mount = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const sources = useRef<{
    roads: CustomDataSource;
    planning: CustomDataSource;
    hazard: CustomDataSource;
    reference: CustomDataSource;
    counties: CustomDataSource;
    measurement: CustomDataSource;
  } | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const dragging = useRef<{
    target: DragTarget;
    track: Point[];
    center: Point;
    radius: number;
  } | null>(null);
  const suppressClickUntil = useRef(0);
  const lastCameraRequest = useRef<string | null>(null);
  const autoCamera = useRef<{ position: Cartesian3; heading: number; pitch: number } | null>(null);
  const [preview, setPreview] = useState<{
    track?: Point[];
    center?: Point;
    radius?: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [flat, setFlat] = useState(false);
  const [note, setNote] = useState("");
  const [hover, setHover] = useState("");
  const [hoveredRoad, setHoveredRoad] = useState<string | null>(null);
  const [tilted, setTilted] = useState(true);
  const [scale, setScale] = useState({ km: 5, pixels: 80 });
  const [rendererUnavailable, setRendererUnavailable] = useState(false);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [measurement, setMeasurement] = useState<Point[]>([]);
  const placeMeasurement = (point: Point) => setMeasurement((points) => addMeasurementPoint(points, point));
  const viewControls = useRef<HTMLDivElement>(null);
  const viewOptionsButton = useRef<HTMLButtonElement>(null);
  const [imageryStatus, setImageryStatus] = useState<ImageryStatus>({
    kind: "local",
    label: "Bundled aerial archive",
    credit: "USDA / USGS The National Map",
  });

  useEffect(() => {
    if (props.tool !== "measure") setMeasurement([]);
  }, [props.tool]);

  useEffect(() => {
    if (!viewOptionsOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !viewControls.current?.contains(event.target))
        setViewOptionsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setViewOptionsOpen(false);
      viewOptionsButton.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [viewOptionsOpen]);

  useEffect(() => {
    if (!mount.current) return;
    let disposed = false;
    let viewer: Viewer;
    const removers: (() => void)[] = [];
    try {
      viewer = new Viewer(mount.current, {
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
        baseLayer: false,
        skyBox: false,
        skyAtmosphere: false,
        contextOptions: { webgl: { alpha: false, preserveDrawingBuffer: true } },
      });
    } catch {
      setRendererUnavailable(true);
      setFlat(true);
      return;
    }
    viewerRef.current = viewer;
    viewer.scene.backgroundColor = c("#1a2628");
    viewer.scene.globe.baseColor = c("#34483d");
    viewer.scene.globe.enableLighting = false;
    viewer.scene.fog.enabled = false;
    sharpenRendering(viewer);
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1500;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 115000;
    const initial = framedTarget(latest.current.bookmark, viewer.canvas);
    viewer.camera.lookAt(
      Cartesian3.fromDegrees(...initial.point),
      new HeadingPitchRange(0, CesiumMath.toRadians(initial.pitch), initial.range),
    );
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    autoCamera.current = { position: viewer.camera.position.clone(), heading: viewer.camera.heading, pitch: viewer.camera.pitch };
    const group = {
      roads: new CustomDataSource("curated-roads"),
      planning: new CustomDataSource("illustrative-allocation"),
      hazard: new CustomDataSource("hypothetical-scenario"),
      reference: new CustomDataSource("local-reference-labels"),
      counties: new CustomDataSource("schematic-counties"),
      measurement: new CustomDataSource("local-surface-measurement"),
    };
    sources.current = group;
    Object.values(group).forEach((source) => {
      void viewer.dataSources.add(source);
    });
    const toneLayer = (layer: ImageryLayer) => Object.assign(layer,
      latest.current.mapStyle === "aerial"
        ? { saturation: 0.48, brightness: 0.79, contrast: 1.13, gamma: 1.12 }
        : { saturation: 0.18, brightness: 0.44, contrast: 1.18, gamma: 1.0 },
    );
    removers.push(viewer.imageryLayers.layerAdded.addEventListener(toneLayer));

    // A bounded archive must never become Cesium's globally stretched base.
    const globalBase = ImageryLayer.fromProviderAsync(TileMapServiceImageryProvider.fromUrl(
      buildModuleUrl("Assets/Textures/NaturalEarthII"),
      { credit: new Credit("Natural Earth II", true) },
    ));
    viewer.imageryLayers.add(globalBase, 0);

    for (const archive of HOUSTON_ARCHIVE_LAYERS) {
      const layer = createHoustonArchiveLayer(archive);
      removers.push(
        layer.errorEvent.addEventListener(() => {
          if (!disposed)
            setNote("Bundled aerial reference unavailable; scenario geometry remains usable.");
        }),
      );
      viewer.imageryLayers.add(layer);
    }
    // Opening stays local. Transparent coarse parents preserve the sharper
    // archive until a close zoom actually loads higher-resolution detail.
    const imageryUrl = import.meta.env.VITE_ATLAS_IMAGERY_URL?.trim();
    const imageryCredit = import.meta.env.VITE_ATLAS_IMAGERY_CREDIT?.trim();
    removers.push(
      installZoomDetail(viewer, {
        bounds: BOUNDS,
        activateBelowHeight: 15_000,
        minimumDetailLevel: 13,
        onStatus: setImageryStatus,
        localLabel: "Bundled aerial archive",
        localCredit: "USDA / USGS The National Map",
        ...(imageryUrl && imageryCredit ? { url: imageryUrl, detailCredit: imageryCredit } : {}),
      }),
    );
    for (const place of [
      { point: [-95.3698, 29.7604] as Point, name: "Downtown Houston", size: 15 },
      { point: [-95.446, 29.767] as Point, name: "Buffalo Bayou", size: 13 },
      { point: [-95.185, 29.735] as Point, name: "Ship Channel", size: 13 },
    ])
      group.reference.entities.add({
        position: Cartesian3.fromDegrees(...place.point, 120),
        label: label(place.name, {
          font: `500 ${place.size}px "Source Sans 3", sans-serif`,
          horizontalOrigin: viewer.canvas.clientWidth < 480
            ? (place.name === "Ship Channel" ? HorizontalOrigin.RIGHT : HorizontalOrigin.LEFT)
            : (place.name === "Buffalo Bayou" ? HorizontalOrigin.RIGHT : HorizontalOrigin.LEFT),
          pixelOffset: new Cartesian2(
            viewer.canvas.clientWidth < 480 ? (place.name === "Ship Channel" ? -8 : 8) : (place.name === "Buffalo Bayou" ? -12 : 16),
            viewer.canvas.clientWidth < 480 && place.name !== "Downtown Houston" ? 24 : (place.name === "Ship Channel" ? 20 : -20),
          ),
          distanceDisplayCondition: new DistanceDisplayCondition(
            0,
            place.size <= 13 ? 90000 : 180000,
          ),
        }),
      });

    const handler = new ScreenSpaceEventHandler(viewer.canvas);
    const pick = (position: Cartesian2) => {
      const ids = viewer.scene
        .drillPick(position)
        .flatMap((hit: unknown) =>
          hit && typeof hit === "object" && "id" in hit && hit.id instanceof Entity
            ? [String(hit.id.id)]
            : [],
        );
      const tool = latest.current.tool;
      const planning = ids.find(id => id.startsWith("plan:") || id.startsWith("plan-marker:"));
      if (planning) return "plan:" + planning.slice(planning.indexOf(":") + 1);
      const handle = ids.find(
        (id) =>
          (tool === "track" && id.startsWith("track-handle:")) ||
          (tool === "flood" && ["flood-center", "flood-radius"].includes(id)),
      );
      if (handle) return handle;
      const road = ids.find(
        (id) =>
          id.startsWith("road:") || id.startsWith("road-label:") || id.startsWith("road-casing:"),
      );
      return road ? `road:${road.slice(road.indexOf(":") + 1)}` : null;
    };
    const groundPoint = (position: Cartesian2): Point | null => {
      const world = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
      if (!world) return null;
      const geo = Cartographic.fromCartesian(world);
      return clampPoint([CesiumMath.toDegrees(geo.longitude), CesiumMath.toDegrees(geo.latitude)]);
    };
    const commitDrag = () => {
      const drag = dragging.current;
      if (!drag) return;
      dragging.current = null;
      suppressClickUntil.current = performance.now() + 120;
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      viewer.canvas.style.cursor = "";
      if (drag.target.kind === "track") latest.current.onTrackChange(drag.track);
      else latest.current.onFloodChange(drag.center, drag.radius);
      setPreview(null);
    };
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (performance.now() < suppressClickUntil.current) return;
      const id = pick(event.position);
      const state = latest.current;
      let target: DragTarget | null = null;
      if (id?.startsWith("track-handle:") && state.mode === "hurricane" && state.tool === "track")
        target = { kind: "track", index: Number(id.split(":")[1]) };
      if (id === "flood-center" && state.mode === "flood" && state.tool === "flood")
        target = { kind: "center" };
      if (id === "flood-radius" && state.mode === "flood" && state.tool === "flood")
        target = { kind: "radius" };
      if (!target) return;
      dragging.current = {
        target,
        track: state.track.map((point) => [...point] as Point),
        center: [...state.floodCenter],
        radius: state.floodRadiusKm,
      };
      viewer.scene.screenSpaceCameraController.enableInputs = false;
      viewer.canvas.style.cursor = "grabbing";
    }, ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      const drag = dragging.current;
      const state = latest.current;
      if (drag) {
        const point = groundPoint(event.endPosition);
        if (!point) return;
        if (drag.target.kind === "track") drag.track[drag.target.index] = point;
        else if (drag.target.kind === "center") drag.center = point;
        else
          drag.radius = Math.min(
            FLOOD_RADIUS_LIMITS.max,
            Math.max(
              FLOOD_RADIUS_LIMITS.min,
              distanceKm(drag.center, point) /
                Math.max(0.05, state.currentFloodRadiusKm / Math.max(state.floodRadiusKm, 0.1)),
            ),
          );
        setPreview({
          track: drag.track.map((point) => [...point] as Point),
          center: [...drag.center],
          radius: drag.radius,
        });
        return;
      }
      const id = pick(event.endPosition);
      const road = id?.startsWith("road:")
        ? state.roads.find((item) => item.id === id.slice(5))
        : undefined;
      setHoveredRoad(road?.id ?? null);
      if (id?.startsWith("plan:")) {
        const asset = state.planningAssets?.find(a => a.id === id.slice(5));
        setHover(asset ? asset.name + " · " + asset.caption : "");
        viewer.canvas.style.cursor = "pointer";
        return;
      }
      setHover(
        road
          ? `${road.name} · ${state.closedRoadIds.includes(road.id) ? "hypothetical closure" : "flood exposure unknown"}`
          : "",
      );
      viewer.canvas.style.cursor = road
        ? "pointer"
        : id?.includes("handle") || id?.startsWith("flood-")
          ? "grab"
          : state.tool === "track" || state.tool === "flood" || state.tool === "measure"
            ? "crosshair"
            : "";
    }, ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction(commitDrag, ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (performance.now() < suppressClickUntil.current) return;
      const id = pick(event.position);
      const state = latest.current;
      if (id?.startsWith("plan:")) {
        state.onPlanningAsset?.(id.slice(5));
        return;
      }
      if (state.tool === "measure") {
        const point = groundPoint(event.position);
        if (point) placeMeasurement(point);
        return;
      }
      if (id?.startsWith("track-handle:") || id?.startsWith("flood-")) return;
      const point = groundPoint(event.position);
      if (point && (state.tool === "track" || state.tool === "flood")) {
        state.onMapPoint(point);
        return;
      }
      if (id?.startsWith("road:")) state.onRoadSelect(id.slice(5));
    }, ScreenSpaceEventType.LEFT_CLICK);
    window.addEventListener("pointerup", commitDrag);
    window.addEventListener("blur", commitDrag);
    removers.push(() => {
      window.removeEventListener("pointerup", commitDrag);
      window.removeEventListener("blur", commitDrag);
    });
    removers.push(
      viewer.scene.renderError.addEventListener(() => {
        if (!disposed) {
          setRendererUnavailable(true);
          setFlat(true);
        }
      }),
    );
    let clamping = false;
    viewer.camera.percentageChanged = 0.001;
    removers.push(
      viewer.camera.changed.addEventListener(() => {
        if (clamping || disposed) return;
        const geo = viewer.camera.positionCartographic;
        const point: Point = [
          CesiumMath.toDegrees(geo.longitude),
          CesiumMath.toDegrees(geo.latitude),
        ];
        const focus = viewer.camera.pickEllipsoid(
          new Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2),
          viewer.scene.globe.ellipsoid,
        );
        const focusGeo = focus ? Cartographic.fromCartesian(focus) : geo;
        const focusPoint: Point = [
          CesiumMath.toDegrees(focusGeo.longitude),
          CesiumMath.toDegrees(focusGeo.latitude),
        ];
        const bounded = clampPoint(focusPoint);
        const height = Math.max(1500, Math.min(115000, geo.height));
        const pitch = Math.max(-CesiumMath.PI_OVER_TWO, Math.min(-0.6, viewer.camera.pitch));
        if (
          Math.abs(focusPoint[0] - bounded[0]) > 1e-6 ||
          Math.abs(focusPoint[1] - bounded[1]) > 1e-6 ||
          Math.abs(height - geo.height) > 1 ||
          Math.abs(pitch - viewer.camera.pitch) > 1e-5
        ) {
          clamping = true;
          viewer.camera.setView({
            destination: Cartesian3.fromDegrees(
              point[0] + bounded[0] - focusPoint[0],
              point[1] + bounded[1] - focusPoint[1],
              height,
            ),
            orientation: { heading: viewer.camera.heading, pitch, roll: 0 },
          });
          clamping = false;
        }
        const left = viewer.camera.pickEllipsoid(
          new Cartesian2(viewer.canvas.clientWidth / 2 - 50, viewer.canvas.clientHeight / 2),
          viewer.scene.globe.ellipsoid,
        );
        const right = viewer.camera.pickEllipsoid(
          new Cartesian2(viewer.canvas.clientWidth / 2 + 50, viewer.canvas.clientHeight / 2),
          viewer.scene.globe.ellipsoid,
        );
        if (left && right) {
          const a = Cartographic.fromCartesian(left),
            b = Cartographic.fromCartesian(right);
          const km = distanceKm(
            [CesiumMath.toDegrees(a.longitude), CesiumMath.toDegrees(a.latitude)],
            [CesiumMath.toDegrees(b.longitude), CesiumMath.toDegrees(b.latitude)],
          );
          const targetPixels = viewer.canvas.clientWidth < 360 ? 52 : viewer.canvas.clientWidth < 580 ? 80 : 100;
          const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].reduce(
            (best, value) => (value <= km * targetPixels / 100 ? value : best),
            0.1,
          );
          setScale({ km: nice, pixels: Math.max(10, Math.min(targetPixels, (nice / km) * 100)) });
        }
      }),
    );
    setReady(true);
    removers.push(viewer.scene.postRender.addEventListener(() => {
      mount.current?.setAttribute("data-scene-ready", String(viewer.scene.globe.tilesLoaded && viewer.dataSourceDisplay.ready));
    }));
    return () => {
      disposed = true;
      dragging.current = null;
      removers.forEach((remove) => remove());
      handler.destroy();
      sources.current = null;
      viewerRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.useDefaultRenderLoop = !flat && !rendererUnavailable;
    if (!flat && !rendererUnavailable) viewer.resize();
  }, [flat, rendererUnavailable, ready]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    for (let index = 0; index < viewer.imageryLayers.length; index++)
      Object.assign(viewer.imageryLayers.get(index), props.mapStyle === "aerial"
        ? { saturation: 0.48, brightness: 0.79, contrast: 1.13, gamma: 1.12 }
        : { saturation: 0.18, brightness: 0.44, contrast: 1.18, gamma: 1.0 });
    viewer.scene.requestRender();
  }, [props.mapStyle, ready]);

  useEffect(() => {
    const source = sources.current?.measurement;
    if (!source || !ready) return;
    source.entities.removeAll();
    if (props.tool !== "measure") return;
    measurement.forEach((point, index) => source.entities.add({
      id: `measurement:${index}`,
      position: Cartesian3.fromDegrees(...point, 160),
      point: { pixelSize: 9, color: c("#f5dfae"), outlineColor: c("#20221f"), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: label(index ? "B" : "A", { pixelOffset: new Cartesian2(0, -19) }),
    }));
    if (measurement.length === 2) {
      source.entities.add({
        id: "measurement-line",
        polyline: { positions: linePositions(measurement, 160), width: 2, material: new PolylineDashMaterialProperty({ color: c("#f5dfae"), dashLength: 12 }) },
      });
      source.entities.add({
        position: Cartesian3.fromDegrees((measurement[0][0] + measurement[1][0]) / 2, (measurement[0][1] + measurement[1][1]) / 2, 180),
        label: label(`${distanceKm(measurement[0], measurement[1]).toFixed(2)} km`, { pixelOffset: new Cartesian2(0, -14) }),
      });
    }
  }, [measurement, props.tool, ready]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready || flat) return;
    const target = framedTarget(props.bookmark, viewer.canvas);
    const request = `${props.bookmark}:${props.cameraRevision}:${tilted}`;
    const changed = lastCameraRequest.current !== null && lastCameraRequest.current !== request;
    lastCameraRequest.current = request;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offset = new HeadingPitchRange(0, CesiumMath.toRadians(tilted ? target.pitch : -90), target.range);
    viewer.camera.cancelFlight();
    if (changed && !reducedMotion) {
      viewer.camera.flyToBoundingSphere(
        new BoundingSphere(Cartesian3.fromDegrees(...target.point), 1),
        {
          duration: 0.8,
          offset,
          complete: () => {
            if (!viewer.isDestroyed()) {
              viewer.camera.lookAtTransform(Matrix4.IDENTITY);
              autoCamera.current = { position: viewer.camera.position.clone(), heading: viewer.camera.heading, pitch: viewer.camera.pitch };
            }
          },
        },
      );
    } else {
      viewer.camera.lookAt(Cartesian3.fromDegrees(...target.point), offset);
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      autoCamera.current = { position: viewer.camera.position.clone(), heading: viewer.camera.heading, pitch: viewer.camera.pitch };
    }
  }, [props.bookmark, props.cameraRevision, ready, tilted, flat]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const node = mount.current;
    if (!viewer || !node || !ready || flat) return;
    const observer = new ResizeObserver(() => {
      const saved = autoCamera.current;
      if (!saved || viewer.isDestroyed()) return;
      // Adapt an untouched overview on rotation; preserve deliberate camera edits.
      if (Cartesian3.distance(viewer.camera.position, saved.position) > 1 ||
          Math.abs(CesiumMath.negativePiToPi(viewer.camera.heading - saved.heading)) > 1e-5 ||
          Math.abs(viewer.camera.pitch - saved.pitch) > 1e-5) return;
      viewer.resize();
      const target = framedTarget(latest.current.bookmark, viewer.canvas);
      viewer.camera.lookAt(Cartesian3.fromDegrees(...target.point), new HeadingPitchRange(0, CesiumMath.toRadians(tilted ? target.pitch : -90), target.range));
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      autoCamera.current = { position: viewer.camera.position.clone(), heading: viewer.camera.heading, pitch: viewer.camera.pitch };
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, flat, tilted]);

  useEffect(() => {
    const source = sources.current?.planning;
    if (!source || !ready) return;
    source.entities.removeAll();
    const footprint = props.planningFootprint;
    if (footprint) {
      const ring = getFloodPolygon([footprint.longitude, footprint.latitude], footprint.radiusKm);
      source.entities.add({polyline: {positions: linePositions([...ring, ring[0]], 75), width: 2,
        material: new PolylineDashMaterialProperty({color: c("#aec9c0"), dashLength: 12})}});
    }
    for (const asset of props.planningAssets ?? []) {
      const first = asset.points[0];
      if (asset.kind === "road") {
        source.entities.add({id: "plan:" + asset.id, polyline: {
          positions: linePositions(asset.points, 115), width: asset.selected ? 6 : 4,
          material: asset.dashed ? new PolylineDashMaterialProperty({color: c(asset.color), dashLength: 14}) : c(asset.color),
        }});
        if (!asset.selected) continue;
        const last = asset.points.at(-1)!;
        source.entities.add({id: "plan-marker:" + asset.id,
          position: Cartesian3.fromDegrees((first[0]+last[0])/2, (first[1]+last[1])/2, 150),
          point: {pixelSize: 11, color: c(asset.color), outlineColor: c(colors.ink), outlineWidth: 2}});
      } else {
        source.entities.add({id: "plan:" + asset.id, position: Cartesian3.fromDegrees(...first, 130),
          point: {pixelSize: asset.kind === "facility" ? 12 : 7, color: c(asset.color), outlineColor: c(colors.ink), outlineWidth: 2},
          label: asset.kind === "facility" ? label(asset.name) : undefined});
      }
    }
  }, [props.planningAssets, props.planningFootprint, ready]);

  useEffect(() => {
    const source = sources.current?.roads;
    if (!source || !ready) return;
    source.entities.removeAll();
    source.show = props.showRoads !== false;
    const seenNodes = new Set<string>();
    for (const road of props.roads) {
      const selected = road.id === props.selectedRoadId || road.id === hoveredRoad;
      const closed = props.closedRoadIds.includes(road.id);
      const disconnected = props.disconnectedRoadIds?.includes(road.id);
      const stroke = closed
          ? colors.closed
          : disconnected
            ? colors.disconnected
            : selected ? colors.selected : colors.road;
      source.entities.add({
        id: `road-casing:${road.id}`,
        polyline: {
          positions: linePositions(road.points, 45),
          width: selected ? 6.5 : 4.5,
          material: c(colors.ink, 0.85),
        },
      });
      source.entities.add({
        id: `road:${road.id}`,
        polyline: {
          positions: linePositions(road.points, 68),
          width: selected ? 3.75 : 2.25,
          material:
            closed || disconnected
              ? new PolylineDashMaterialProperty({ color: c(stroke), dashLength: 13 })
              : c(stroke),
        },
      });
      for (const [index, point] of [
        road.points[0],
        road.points[road.points.length - 1],
      ].entries()) {
        const key = point.join(",");
        if (!selected || seenNodes.has(key)) continue;
        seenNodes.add(key);
        source.entities.add({
          id: `junction:${road.id}:${index}`,
          position: Cartesian3.fromDegrees(...point, 95),
          point: {
            pixelSize: 5,
            color: c("#f1ead6"),
            outlineColor: c(colors.ink),
            outlineWidth: 1.5,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
    }
  }, [
    props.roads,
    props.selectedRoadId,
    props.closedRoadIds,
    props.disconnectedRoadIds,
    props.showRoads,
    hoveredRoad,
    ready,
  ]);

  useEffect(() => {
    const source = sources.current?.hazard;
    if (!source || !ready) return;
    source.entities.removeAll();
    source.show = props.showFlood !== false;
    const track = preview?.track ?? props.track;
    const center = preview?.center ?? props.floodCenter;
    const radius = preview?.radius
      ? (preview.radius * props.currentFloodRadiusKm) / Math.max(props.floodRadiusKm, 0.1)
      : props.currentFloodRadiusKm;
    if (props.comparison) {
      if (props.mode === "hurricane" && props.baselineTrack?.length)
        source.entities.add({
          id: "baseline-track",
          polyline: {
            positions: linePositions(props.baselineTrack, 100),
            width: 3,
            material: new PolylineDashMaterialProperty({
              color: c("#e7e7df", 0.85),
              dashLength: 18,
            }),
          },
        });
      if (props.mode === "flood" && props.baselineFloodCenter && props.baselineFloodRadiusKm) {
        const ring = getFloodPolygon(props.baselineFloodCenter, props.baselineFloodRadiusKm);
        source.entities.add({
          id: "baseline-flood",
          polyline: {
            positions: linePositions([...ring, ring[0]], 105),
            width: 3,
            material: new PolylineDashMaterialProperty({
              color: c("#f1ece0", 0.9),
              dashLength: 18,
            }),
          },
        });
      }
    }
    if (props.mode === "hurricane") {
      source.entities.add({
        id: "active-track",
        polyline: { positions: linePositions(track, 160), width: 3, material: c("#e6aa63") },
      });
      track.forEach((point, index) =>
        source.entities.add({
          id: `track-handle:${index}`,
          position: Cartesian3.fromDegrees(...point, 190),
          point: {
            pixelSize: props.tool === "track" ? 14 : 10,
            color: c("#e6aa63", 0.01),
            outlineColor: c("#f0b977"),
            outlineWidth: 2.5,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: label(`${index + 1}`, {
            show: props.tool === "track",
            pixelOffset: new Cartesian2(index % 2 ? 18 : -18, 20),
            font: '500 12px "Source Sans 3", sans-serif',
          }),
        }),
      );
      source.entities.add({
        id: "storm-area",
        position: Cartesian3.fromDegrees(...props.stormPosition, 80),
        ellipse: {
          semiMajorAxis: 6000,
          semiMinorAxis: 6000,
          material: c("#dca55f", 0.06),
          outline: true,
          outlineColor: c("#e3b16e", 0.5),
          height: 80,
        },
      });
      source.entities.add({
        id: "storm-marker",
        position: Cartesian3.fromDegrees(...props.stormPosition, 240),
        billboard: {
          image: "/map/storm-eye.svg",
          width: 28,
          height: 28,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: label("Storm center", {
          show: props.tool === "track",
          pixelOffset: new Cartesian2(0, -27),
          font: '500 12px "Source Sans 3", sans-serif',
        }),
      });
    } else {
      const polygon = getFloodPolygon(center, radius);
      source.entities.add({
        id: "flood-area",
        polygon: {
          hierarchy: new PolygonHierarchy(positions(polygon, 90)),
          material: c("#8ab9b7", 0.35),
          height: 90,
        },
      });
      source.entities.add({
        id: "flood-perimeter",
        polyline: {
          positions: linePositions([...polygon, polygon[0]], 115),
          width: 2,
          material: new PolylineDashMaterialProperty({ color: c("#b9ddda"), dashLength: 12 }),
        },
      });
      source.entities.add({
        id: "flood-center",
        position: Cartesian3.fromDegrees(...center, 200),
        point: {
          pixelSize: 16,
          color: c("#b9ddda"),
          outlineColor: c("#253d40"),
          outlineWidth: 4,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: label("Extent center", {
          show: props.tool === "flood",
          pixelOffset: new Cartesian2(0, -27),
          font: '500 12px "Source Sans 3", sans-serif',
        }),
      });
      source.entities.add({
        id: "flood-radius",
        position: Cartesian3.fromDegrees(...pointAtRadius(center, radius), 180),
        point: {
          pixelSize: 12,
          color: c("#f5efd8"),
          outlineColor: c("#3e6567"),
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: label("Resize", {
          show: props.tool === "flood",
          pixelOffset: new Cartesian2(0, -20),
          font: '400 12px "Source Sans 3", sans-serif',
        }),
      });
    }
  }, [
    props.track,
    props.stormPosition,
    props.floodCenter,
    props.floodRadiusKm,
    props.currentFloodRadiusKm,
    props.mode,
    props.tool,
    props.comparison,
    props.baselineTrack,
    props.baselineFloodCenter,
    props.baselineFloodRadiusKm,
    props.showFlood,
    preview,
    ready,
  ]);

  useEffect(() => {
    const source = sources.current?.counties;
    if (!source || !ready) return;
    source.entities.removeAll();
    for (const prediction of props.countyPredictions ?? []) {
      const feature = offlineCounties.features.find(
        (item) => item.properties.countyFips === prediction.countyFips,
      );
      if (!feature) continue;
      const ring = feature.geometry.coordinates[0] as Point[];
      source.entities.add({
        id: `county:${prediction.countyFips}`,
        polyline: {
          positions: linePositions(ring, 110),
          width: 2,
          material: new PolylineDashMaterialProperty({ color: c("#d6dbc3", 0.65), dashLength: 20 }),
        },
      });
      const midpoint: Point = [
        ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
        ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
      ];
      source.entities.add({
        id: `county-label:${prediction.countyFips}`,
        position: Cartesian3.fromDegrees(...midpoint, 170),
        label: label(
          `${feature.properties.name} · ${prediction.predictedSeverity} ${prediction.severityUnit}\nSchematic boundary · ${prediction.dataMode === "offline_example" ? "Offline example" : "Conditional model"}`,
          { font: '400 12px "Source Sans 3", sans-serif', pixelOffset: new Cartesian2(0, 0) },
        ),
      });
    }
  }, [props.countyPredictions, ready]);

  const navigate = (action: "in" | "out" | "north" | "tilt") => {
    const viewer = viewerRef.current;
    if (!viewer || flat) return;
    if (action === "in")
      viewer.camera.zoomIn(Math.max(500, viewer.camera.positionCartographic.height * 0.28));
    if (action === "out")
      viewer.camera.zoomOut(Math.max(500, viewer.camera.positionCartographic.height * 0.35));
    if (action === "north")
      viewer.camera.setView({ orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 } });
    if (action === "tilt") setTilted((value) => !value);
  };
  return (
    <div className={`atlas-map ${flat ? "is-flat" : "is-3d"} map-style-${props.mapStyle ?? "field"} ${props.tool === "measure" ? "is-measuring" : ""}`}>
      <div
        ref={mount}
        className="atlas-cesium-mount"
        style={{ visibility: flat ? "hidden" : "visible" }}
      />
      {flat && <FlatMap {...props} measurement={props.tool === "measure" ? measurement : []} onMeasurePoint={placeMeasurement} />}
      {props.tool === "measure" && <MapMeasure points={measurement} onPoint={placeMeasurement} onClear={() => setMeasurement([])} />}
      {flat && <div className="atlas-source-credit">
        <a href="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer" target="_blank" rel="noopener noreferrer">USDA / USGS</a>
        <span>2017–2021 aerial archive</span>
      </div>}
      {!flat && (
        <div className="atlas-distance-scale" role="img" aria-label={`Approximate scale ${scale.km} kilometers at view center`}>
          <span className="atlas-scale-line" style={{ width: scale.pixels }} />
          <span>{scale.km} km</span>
        </div>
      )}
      {(note || (!flat && imageryStatus.warning)) && (
        <div className="atlas-map-notice" role="status">
          {note || imageryStatus.warning}
        </div>
      )}
      <div className="atlas-map-hover" role="status">
        {props.tool === "inspect" || props.tool === "closure" ? hover : ""}
      </div>
      <div className="atlas-view-controls" ref={viewControls} aria-label="Map navigation">
        {!flat && (
          <div className="atlas-zoom-pair" role="group" aria-label="Map zoom">
            <button type="button" aria-label="Zoom in" onClick={() => navigate("in")}>
              +
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => navigate("out")}>
              −
            </button>
          </div>
        )}
        <button
          type="button"
          ref={viewOptionsButton}
          className="atlas-view-trigger"
          aria-label="Map view options"
          aria-expanded={viewOptionsOpen}
          aria-controls="atlas-view-options"
          onClick={() => setViewOptionsOpen((value) => !value)}
        >
          {flat ? "2D view" : "View"}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg>
        </button>
        {viewOptionsOpen && <div className="atlas-view-panel" id="atlas-view-options" role="group" aria-label="Map view options">
          {!flat && <>
            <span className="atlas-view-caption">View angle</span>
            <div className="atlas-view-choices">
              <button type="button" aria-pressed={tilted} onClick={() => setTilted(true)}>Angled</button>
              <button type="button" aria-pressed={!tilted} onClick={() => setTilted(false)}>Top-down</button>
            </div>
            <button type="button" className="atlas-north-action" onClick={() => navigate("north")}>Face north <span aria-hidden="true">↑</span></button>
          </>}
          <span className="atlas-view-caption">Renderer</span>
          <div className="atlas-view-choices">
            <button type="button" aria-pressed={!flat} disabled={rendererUnavailable} onClick={() => {setFlat(false);setNote("");setViewOptionsOpen(false);}}>3D map</button>
            <button type="button" aria-pressed={flat} onClick={() => {setFlat(true);setNote("");setViewOptionsOpen(false);}}>2D map</button>
          </div>
          {props.onResetView && <button type="button" className="atlas-reset-view" onClick={() => { props.onResetView?.(); setViewOptionsOpen(false); }}>Reset Houston view</button>}
          {rendererUnavailable && <p>3D is unavailable on this device</p>}
        </div>}
      </div>
      <div className="atlas-map-a11y" aria-live="polite">
        {rendererUnavailable && "3D is unavailable. The interactive 2D map is active. "}
        {props.tool === "track"
          ? "Click the map to add a waypoint. Drag numbered waypoints to move them."
          : props.tool === "flood"
            ? "Click the map to move the illustrative flood extent. Drag the center or radius handle to edit."
            : props.tool === "measure"
              ? "Click two map points to measure approximate surface distance. Use Enter coordinates for keyboard entry. Leaving Measure clears the measurement."
            : "Select a curated road to inspect it. Road flood exposure is unknown."}
      </div>
    </div>
  );
}
