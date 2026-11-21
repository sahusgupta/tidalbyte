import { useEffect, useRef, useState } from "react";
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  CustomDataSource,
  DistanceDisplayCondition,
  Entity,
  HeadingPitchRange,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  Matrix4,
  PolygonHierarchy,
  PolylineDashMaterialProperty,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  Viewer,
} from "cesium";
import { offlineCounties, type Prediction } from "@earthlab/contracts";
import { installZoomDetail, sharpenRendering, type ImageryStatus } from "../earth/imagery";
import type { AtlasMode, BookmarkId, EditorTool, Point, RoadSegment } from "../../atlas/domain";
import { FLOOD_RADIUS_LIMITS, getFloodPolygon } from "../../atlas/domain";
import { FlatMap } from "./FlatMap";
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
}

const colors = {
  road: "#ced1b5",
  selected: "#f7ce83",
  closed: "#ef8b74",
  disconnected: "#bf9fce",
  ink: "#19262b",
};
const c = (hex: string, alpha = 1) => Color.fromCssColorString(hex).withAlpha(alpha);
const positions = (points: Point[], height = 65) =>
  points.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, height));
const label = (text: string, extra: object = {}) => ({
  text,
  font: "600 11px Arial",
  fillColor: c("#f5f0dc"),
  outlineColor: c("#142329"),
  outlineWidth: 4,
  style: LabelStyle.FILL_AND_OUTLINE,
  showBackground: true,
  backgroundColor: c("#18272b", 0.82),
  backgroundPadding: new Cartesian2(6, 4),
  pixelOffset: new Cartesian2(0, -13),
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
  ...extra,
});
const sourceCredit = new Credit(
  '<a href="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer" target="_blank" rel="noopener">USDA / USGS The National Map</a> · archival aerial reference',
  true,
);

export default function Globe(props: AtlasMapProps) {
  const mount = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const sources = useRef<{
    roads: CustomDataSource;
    hazard: CustomDataSource;
    reference: CustomDataSource;
    counties: CustomDataSource;
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
  const [imageryStatus, setImageryStatus] = useState<ImageryStatus>({
    kind: "local",
    label: "Bundled aerial archive",
    credit: "USDA / USGS The National Map",
  });

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
      setNote("3D unavailable · interactive 2D aerial map");
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
    const initial = BOOKMARKS[latest.current.bookmark];
    viewer.camera.lookAt(
      Cartesian3.fromDegrees(...initial.point),
      new HeadingPitchRange(0, CesiumMath.toRadians(-66), initial.range),
    );
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    const group = {
      roads: new CustomDataSource("curated-roads"),
      hazard: new CustomDataSource("hypothetical-scenario"),
      reference: new CustomDataSource("local-reference-labels"),
      counties: new CustomDataSource("schematic-counties"),
    };
    sources.current = group;
    Object.values(group).forEach((source) => {
      void viewer.dataSources.add(source);
    });

    const addAerial = (url: string, bounds: [number, number, number, number]) => {
      const layer = ImageryLayer.fromProviderAsync(
        SingleTileImageryProvider.fromUrl(url, {
          rectangle: Rectangle.fromDegrees(...bounds),
          credit: sourceCredit,
        }),
      );
      layer.saturation = 0.48;
      layer.brightness = 0.79;
      layer.contrast = 1.13;
      layer.gamma = 1.12;
      removers.push(
        layer.errorEvent.addEventListener(() => {
          if (!disposed)
            setNote("Bundled aerial reference unavailable; scenario geometry remains usable.");
        }),
      );
      viewer.imageryLayers.add(layer);
    };
    addAerial("/map/houston-usgs.webp", [-95.9, 29.249921875, -94.7, 30.200078125]);
    addAerial("/map/houston-detail-usgs.webp", [-95.570036869, 29.6, -95.079963131, 29.96]);
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
      { point: [-95.3698, 29.7604] as Point, name: "DOWNTOWN HOUSTON", size: 15 },
      { point: [-95.446, 29.767] as Point, name: "BUFFALO BAYOU", size: 11 },
      { point: [-95.185, 29.735] as Point, name: "SHIP CHANNEL", size: 11 },
      { point: [-95.395, 29.711] as Point, name: "MEDICAL CENTER", size: 10 },
      { point: [-95.12, 29.68] as Point, name: "PASADENA", size: 10 },
    ])
      group.reference.entities.add({
        position: Cartesian3.fromDegrees(...place.point, 120),
        label: label(place.name, {
          font: `600 ${place.size}px Arial`,
          pixelOffset: new Cartesian2(
            place.name === "BUFFALO BAYOU" ? -24 : 0,
            place.name === "BUFFALO BAYOU" ? -18 : 0,
          ),
          distanceDisplayCondition: new DistanceDisplayCondition(
            0,
            place.size < 12 ? 90000 : 180000,
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
      setHover(
        road
          ? `${road.name} · ${state.closedRoadIds.includes(road.id) ? "hypothetical closure" : "flood exposure unknown"}`
          : "",
      );
      viewer.canvas.style.cursor = road
        ? "pointer"
        : id?.includes("handle") || id?.startsWith("flood-")
          ? "grab"
          : state.tool === "track" || state.tool === "flood"
            ? "crosshair"
            : "";
    }, ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction(commitDrag, ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (performance.now() < suppressClickUntil.current) return;
      const id = pick(event.position);
      const state = latest.current;
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
          setNote("3D renderer stopped · interactive 2D aerial map");
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
          const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].reduce(
            (best, value) => (value <= km ? value : best),
            0.1,
          );
          setScale({ km: nice, pixels: Math.max(10, Math.min(150, (nice / km) * 100)) });
        }
      }),
    );
    setReady(true);
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
    if (!viewer || !ready || flat) return;
    const target = BOOKMARKS[props.bookmark];
    const request = `${props.bookmark}:${props.cameraRevision}:${tilted}`;
    const changed = lastCameraRequest.current !== null && lastCameraRequest.current !== request;
    lastCameraRequest.current = request;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offset = new HeadingPitchRange(0, CesiumMath.toRadians(tilted ? -66 : -90), target.range);
    viewer.camera.cancelFlight();
    if (changed && !reducedMotion) {
      viewer.camera.flyToBoundingSphere(
        new BoundingSphere(Cartesian3.fromDegrees(...target.point), 1),
        {
          duration: 0.8,
          offset,
          complete: () => {
            if (!viewer.isDestroyed()) viewer.camera.lookAtTransform(Matrix4.IDENTITY);
          },
        },
      );
    } else {
      viewer.camera.lookAt(Cartesian3.fromDegrees(...target.point), offset);
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    }
  }, [props.bookmark, props.cameraRevision, ready, tilted, flat]);

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
      const stroke = selected
        ? colors.selected
        : closed
          ? colors.closed
          : disconnected
            ? colors.disconnected
            : colors.road;
      source.entities.add({
        id: `road-casing:${road.id}`,
        polyline: {
          positions: positions(road.points, 45),
          width: selected ? 9 : 6,
          material: c(colors.ink, 0.93),
        },
      });
      source.entities.add({
        id: `road:${road.id}`,
        polyline: {
          positions: positions(road.points, 68),
          width: selected ? 5 : 3,
          material:
            closed || disconnected
              ? new PolylineDashMaterialProperty({ color: c(stroke), dashLength: 13 })
              : c(stroke),
        },
      });
      const midpoint = road.points[Math.floor(road.points.length / 2)];
      if (road.id === hoveredRoad)
        source.entities.add({
          id: `road-label:${road.id}`,
          position: Cartesian3.fromDegrees(...midpoint, 130),
          label: label(`${closed ? "× " : ""}${road.name}`, {
            fillColor: c(stroke),
            font: "600 11px Arial",
            pixelOffset: new Cartesian2(0, 20),
          }),
        });
      for (const [index, point] of [
        road.points[0],
        road.points[road.points.length - 1],
      ].entries()) {
        const key = point.join(",");
        if (seenNodes.has(key)) continue;
        seenNodes.add(key);
        source.entities.add({
          id: `junction:${road.id}:${index}`,
          position: Cartesian3.fromDegrees(...point, 95),
          point: {
            pixelSize: 6,
            color: c("#f1ead6"),
            outlineColor: c(colors.ink),
            outlineWidth: 2,
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
            positions: positions(props.baselineTrack, 100),
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
            positions: positions([...ring, ring[0]], 105),
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
        id: "track-ribbon",
        polyline: { positions: positions(track, 130), width: 16, material: c("#d5aa69", 0.16) },
      });
      source.entities.add({
        id: "active-track",
        polyline: { positions: positions(track, 160), width: 4, material: c("#f3c783") },
      });
      track.forEach((point, index) =>
        source.entities.add({
          id: `track-handle:${index}`,
          position: Cartesian3.fromDegrees(...point, 190),
          point: {
            pixelSize: props.tool === "track" ? 13 : 8,
            color: c("#233c41"),
            outlineColor: c("#f5d6a0"),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: label(`W${index + 1}`, {
            show: props.tool === "track",
            pixelOffset: new Cartesian2(index % 2 ? 18 : -18, 20),
            font: "700 10px Arial",
          }),
        }),
      );
      source.entities.add({
        id: "storm-area",
        position: Cartesian3.fromDegrees(...props.stormPosition, 80),
        ellipse: {
          semiMajorAxis: 6000,
          semiMinorAxis: 6000,
          material: c("#dca55f", 0.16),
          outline: true,
          outlineColor: c("#edbc7a", 0.75),
          height: 80,
        },
      });
      source.entities.add({
        id: "storm-marker",
        position: Cartesian3.fromDegrees(...props.stormPosition, 240),
        billboard: {
          image: "/map/storm-eye.svg",
          width: 47,
          height: 47,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: label("HYPOTHETICAL STORM", {
          show: props.tool === "track",
          pixelOffset: new Cartesian2(0, -37),
          font: "700 10px Arial",
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
          positions: positions([...polygon, polygon[0]], 115),
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
        label: label("ILLUSTRATIVE EXTENT", {
          show: props.tool === "flood",
          pixelOffset: new Cartesian2(0, -27),
          font: "700 10px Arial",
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
          font: "500 10px Arial",
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
          positions: positions(ring, 110),
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
          `${feature.properties.name} · ${prediction.predictedSeverity} ${prediction.severityUnit}\nSCHEMATIC BOUNDARY · ${prediction.dataMode === "offline_example" ? "OFFLINE EXAMPLE" : "CONDITIONAL MODEL"}`,
          { font: "500 10px Arial", pixelOffset: new Cartesian2(0, 0) },
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
    <div className={`atlas-map ${flat ? "is-flat" : "is-3d"}`}>
      <div
        ref={mount}
        className="atlas-cesium-mount"
        style={{ visibility: flat ? "hidden" : "visible" }}
      />
      {flat && <FlatMap {...props} />}
      <div className="atlas-map-credit">
        {flat || imageryStatus.kind !== "detail"
          ? "USDA / USGS aerial reference"
          : imageryStatus.credit}
        <span>
          {flat || imageryStatus.kind !== "detail" ? "2017–2021 archive" : "Tiled archival imagery"}{" "}
          · display only
        </span>
      </div>
      {!flat && (
        <div className="atlas-map-scale">
          <span style={{ width: scale.pixels }} />≈ {scale.km} km
        </div>
      )}
      {(note || (!flat && imageryStatus.warning)) && (
        <div className="atlas-map-notice" role="status">
          {note || imageryStatus.warning}
        </div>
      )}
      <div className="atlas-map-hover" role="status">
        {hover}
      </div>
      <div className="atlas-map-navigation" aria-label="Map navigation">
        {!flat && (
          <>
            <button type="button" aria-label="Zoom in" onClick={() => navigate("in")}>
              +
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => navigate("out")}>
              −
            </button>
            <span className="atlas-nav-rule" />
            <button type="button" aria-label="Face north" onClick={() => navigate("north")}>
              N
            </button>
            <button
              type="button"
              aria-label="Toggle map tilt"
              aria-pressed={tilted}
              onClick={() => navigate("tilt")}
            >
              {tilted ? "3D" : "2D"}
            </button>
          </>
        )}
        <button
          type="button"
          className="atlas-flat-toggle"
          disabled={rendererUnavailable}
          onClick={() => {
            setFlat((value) => !value);
            setNote("");
          }}
          title={
            rendererUnavailable
              ? "3D renderer unavailable on this device"
              : flat
                ? "Use 3D renderer"
                : "Open accessible 2D atlas"
          }
        >
          {rendererUnavailable ? "2D active" : flat ? "Use 3D" : "2D atlas"}
        </button>
      </div>
      <div className="atlas-map-a11y" aria-live="polite">
        {props.tool === "track"
          ? "Click the map to add a waypoint. Drag numbered waypoints to move them."
          : props.tool === "flood"
            ? "Click the map to move the illustrative flood extent. Drag the center or radius handle to edit."
            : "Select a curated road to inspect it. Road flood exposure is unknown."}
      </div>
    </div>
  );
}
