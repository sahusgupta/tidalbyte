import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  DistanceDisplayCondition,
  Entity,
  HeadingPitchRange,
  LabelStyle,
  Math as CesiumMath,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
} from "cesium";
import { Icon } from "../../app/Icon";
import {
  addPhotorealTiles,
  photorealConfigured,
  sharpenRendering,
  installEarthImagery,
  type ImageryStatus,
} from "./imagery";
import { RegionInset } from "./RegionInset";
import {
  REGIONS,
  findZone,
  regionBBox,
  zoneSizeKm,
  type BBox,
  type Region,
  type Zone,
} from "./zones";
import "./earth.css";

export interface EarthViewProps {
  /** Zone the route says is open (the simulator is shown on top), or null for the Earth view. */
  activeZoneId: string | null;
  /** Called once the camera has flown into a zone; the parent then opens the simulator. */
  onZoneEntered: (zoneId: string) => void;
  onOpenAtlas: () => void;
  /** The open simulator fully covers the globe: stop rendering (and fetching tiles) until it closes. */
  paused?: boolean;
  children?: ReactNode;
}

const HOME = Cartesian3.fromDegrees(-95, 24, 11_800_000);
const ZONE_LABEL_MAX_M = 260_000;
const REGION_MARKER_MIN_M = 220_000;
const amber = Color.fromCssColorString("#edb576");
const paper = Color.fromCssColorString("#efece1");
const ink = Color.fromCssColorString("#19231f");
const fill = (hot: boolean) => new ColorMaterialProperty(amber.withAlpha(hot ? 0.16 : 0.07));
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function sphereFor(bbox: BBox) {
  const [w, s, e, n] = bbox;
  return BoundingSphere.fromPoints(Cartesian3.fromDegreesArray([w, s, e, s, e, n, w, n]));
}

type Photoreal = "off" | "loading" | "on" | "error";

export default function EarthView({
  activeZoneId,
  onZoneEntered,
  onOpenAtlas,
  paused = false,
  children,
}: EarthViewProps) {
  const mount = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const zoneEntities = useRef(new Map<string, Entity>());
  const rotating = useRef(!reducedMotion());
  const flightToken = useRef(0);
  /** Zone the camera is already framing, so the route change after a fly-in does not fly again. */
  const atZone = useRef<string | null>(null);
  const callbacks = useRef({ onZoneEntered });
  callbacks.current = { onZoneEntered };
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [orbiting, setOrbiting] = useState(rotating.current);
  const [flying, setFlying] = useState<string | null>(null);
  const [photoreal, setPhotoreal] = useState<Photoreal>(photorealConfigured() ? "loading" : "off");
  const [failed, setFailed] = useState(false);
  const [imagery, setImagery] = useState<ImageryStatus | null>(null);
  const previousZone = useRef(activeZoneId);
  useEffect(() => {
    if (!activeZoneId && previousZone.current) {
      document.getElementById(`earth-zone-${previousZone.current}`)?.focus();
    }
    previousZone.current = activeZoneId;
  }, [activeZoneId]);

  const stopOrbit = () => {
    rotating.current = false;
    setOrbiting(false);
  };

  /** Fly the camera to a bounding box; resolves false if a newer flight replaced it. */
  const flyTo = (bbox: BBox, pitchDeg: number, rangeFactor: number, slow = false) =>
    new Promise<boolean>((resolve) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return resolve(false);
      const token = ++flightToken.current;
      const sphere = sphereFor(bbox);
      const far = viewer.camera.positionCartographic.height > 1_500_000;
      viewer.camera.cancelFlight();
      viewer.camera.flyToBoundingSphere(sphere, {
        offset: new HeadingPitchRange(
          0,
          CesiumMath.toRadians(pitchDeg),
          sphere.radius * rangeFactor,
        ),
        duration: reducedMotion() ? 0 : far || slow ? 3.6 : 1.8,
        complete: () => {
          if (!viewer.isDestroyed()) viewer.camera.lookAtTransform(Matrix4.IDENTITY);
          resolve(token === flightToken.current);
        },
        cancel: () => resolve(false),
      });
    });

  const enterZone = async (zone: Zone) => {
    stopOrbit();
    if (failed || !viewerRef.current) {
      callbacks.current.onZoneEntered(zone.id);
      return;
    }
    setFlying(zone.id);
    const arrived = await flyTo(zone.bbox, -50, 1.9);
    setFlying(null);
    if (arrived) {
      atZone.current = zone.id;
      callbacks.current.onZoneEntered(zone.id);
    }
  };
  const showRegion = (region: Region) => {
    stopOrbit();
    void flyTo(regionBBox(region), -66, 2.0);
  };
  const latestActions = useRef({ enterZone, showRegion });
  latestActions.current = { enterZone, showRegion };

  useEffect(() => {
    if (!mount.current) return;
    let viewer: Viewer;
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
        skyBox: false,
        skyAtmosphere: false,
        baseLayer: false,
        showRenderLoopErrors: false,
        contextOptions: { webgl: { alpha: false, preserveDrawingBuffer: true } },
      });
    } catch {
      mount.current.replaceChildren();
      setFailed(true);
      return;
    }
    viewerRef.current = viewer;
    sharpenRendering(viewer);
    const scene = viewer.scene;
    const stopImagery = installEarthImagery(viewer, setImagery);
    const stopRenderError = scene.renderError.addEventListener(() => {
      rotating.current = false;
      setFlying(null);
      setFailed(true);
    });
    scene.backgroundColor = Color.fromCssColorString("#161c19");
    scene.globe.baseColor = Color.fromCssColorString("#2a332d");
    scene.globe.enableLighting = false;
    scene.fog.enabled = false;
    scene.screenSpaceCameraController.minimumZoomDistance = 350;
    scene.screenSpaceCameraController.maximumZoomDistance = 30_000_000;
    viewer.camera.setView({ destination: HOME });

    for (const region of REGIONS) {
      viewer.entities.add({
        id: `region:${region.id}`,
        position: Cartesian3.fromDegrees(...region.anchor),
        point: {
          pixelSize: 11,
          color: amber,
          outlineColor: ink,
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(
            REGION_MARKER_MIN_M,
            Number.MAX_VALUE,
          ),
        },
        label: {
          text: `${region.name.toUpperCase()} · ${region.zones.length} ZONES`,
          font: "600 12px Arial",
          fillColor: paper,
          outlineColor: ink,
          outlineWidth: 4,
          style: LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: ink.withAlpha(0.86),
          backgroundPadding: new Cartesian2(7, 5),
          pixelOffset: new Cartesian2(0, -18),
          verticalOrigin: VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(
            REGION_MARKER_MIN_M,
            Number.MAX_VALUE,
          ),
        },
      });
      for (const zone of region.zones) {
        const [w, s, e, n] = zone.bbox;
        const ring = [w, s, e, s, e, n, w, n, w, s];
        zoneEntities.current.set(
          zone.id,
          viewer.entities.add({
            id: `zone:${zone.id}`,
            polygon: {
              hierarchy: Cartesian3.fromDegreesArray(ring.slice(0, 8)),
              material: fill(false),
            },
          }),
        );
        viewer.entities.add({
          id: `zone-edge:${zone.id}`,
          polyline: {
            positions: Cartesian3.fromDegreesArray(ring),
            width: 2,
            material: amber,
            clampToGround: true,
          },
        });
        viewer.entities.add({
          id: `zone-label:${zone.id}`,
          position: Cartesian3.fromDegrees((w + e) / 2, n),
          label: {
            text: zone.name,
            font: "600 12px Arial",
            fillColor: paper,
            outlineColor: ink,
            outlineWidth: 4,
            style: LabelStyle.FILL_AND_OUTLINE,
            showBackground: true,
            backgroundColor: ink.withAlpha(0.86),
            backgroundPadding: new Cartesian2(6, 4),
            pixelOffset: new Cartesian2(0, -8),
            verticalOrigin: VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new DistanceDisplayCondition(0, ZONE_LABEL_MAX_M),
          },
        });
      }
    }

    const pickId = (position: Cartesian2): string | null => {
      const hit = scene.pick(position) as { id?: unknown } | undefined;
      return hit?.id instanceof Entity ? String(hit.id.id) : null;
    };
    const target = (id: string | null) => {
      if (!id) return null;
      const [kind, key] = id.split(":");
      if (kind.startsWith("zone")) return { zone: findZone(key) };
      if (kind === "region") return { region: REGIONS.find((r) => r.id === key) };
      return null;
    };
    const handler = new ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      const hit = target(pickId(event.endPosition));
      const name = hit?.zone?.name ?? hit?.region?.name;
      setHovered(hit?.zone?.id ?? null);
      viewer.canvas.style.cursor = name ? "pointer" : "";
      setTooltip(
        name
          ? {
              x: Math.min(
                event.endPosition.x + (mount.current?.offsetLeft ?? 0),
                (mount.current?.parentElement?.clientWidth ?? Infinity) - 180,
              ),
              y: event.endPosition.y,
              text: hit?.zone ? name : `${name} · show study zones`,
            }
          : null,
      );
    }, ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const hit = target(pickId(event.position));
      if (hit?.zone) void latestActions.current.enterZone(hit.zone);
      else if (hit?.region) latestActions.current.showRegion(hit.region);
    }, ScreenSpaceEventType.LEFT_CLICK);
    for (const type of [
      ScreenSpaceEventType.LEFT_DOWN,
      ScreenSpaceEventType.RIGHT_DOWN,
      ScreenSpaceEventType.MIDDLE_DOWN,
      ScreenSpaceEventType.WHEEL,
      ScreenSpaceEventType.PINCH_START,
    ])
      handler.setInputAction(() => stopOrbit(), type);

    const spin = viewer.clock.onTick.addEventListener(() => {
      if (rotating.current && viewer.camera.positionCartographic.height > 3_000_000)
        viewer.camera.rotate(Cartesian3.UNIT_Z, -0.0009);
    });

    let disposed = false;
    if (photorealConfigured())
      addPhotorealTiles(viewer)
        .then((tileset) => {
          if (disposed) return;
          setPhotoreal(tileset ? "on" : "off");
          if (tileset) scene.screenSpaceCameraController.minimumZoomDistance = 60;
        })
        .catch(() => !disposed && setPhotoreal("error"));
    setReady(true);
    return () => {
      disposed = true;
      spin();
      stopImagery();
      stopRenderError();
      handler.destroy();
      viewerRef.current = null;
      zoneEntities.current.clear();
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  // Hover highlight shared by the globe and the zone list.
  useEffect(() => {
    for (const [id, entity] of zoneEntities.current)
      if (entity.polygon) entity.polygon.material = fill(id === hovered || id === activeZoneId);
  }, [hovered, activeZoneId, ready]);

  // Hidden globe: hand the main thread and GPU to the simulator. Declared before the camera effect so
  // rendering resumes before the fly-back to the region starts.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    viewer.useDefaultRenderLoop = !paused;
  }, [paused, ready]);

  // Route-driven camera: deep links open a zone directly; leaving a zone returns to its region.
  const lastActive = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const previous = lastActive.current;
    lastActive.current = activeZoneId;
    const zone = findZone(activeZoneId);
    if (zone && atZone.current !== zone.id && previous !== zone.id) {
      stopOrbit();
      atZone.current = zone.id;
      void flyTo(zone.bbox, -50, 1.9);
    } else if (!zone && previous) {
      atZone.current = null;
      const region = REGIONS.find((r) => r.zones.some((z) => z.id === previous));
      if (region) void flyTo(regionBBox(region), -66, 2.0);
    }
    // flyTo/stopOrbit are stable in behaviour; re-running on their identity would refly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZoneId, ready]);

  const zoom = (dir: "in" | "out") => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    stopOrbit();
    const h = viewer.camera.positionCartographic.height;
    if (dir === "in") viewer.camera.zoomIn(Math.max(200, h * 0.45));
    else viewer.camera.zoomOut(Math.max(200, h * 0.8));
  };
  const goHome = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.cancelFlight();
    viewer.camera.flyTo({ destination: HOME, duration: reducedMotion() ? 0 : 2.2 });
  };
  const toggleOrbit = () => {
    rotating.current = !rotating.current;
    setOrbiting(rotating.current);
  };

  const inZone = activeZoneId !== null;
  return (
    <div className={`earth-shell ${inZone ? "zone-open" : ""} ${paused ? "simulator-open" : ""}`}>
      {!inZone && (
        <a
          className="skip"
          href="#earth-zones"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("earth-zones")?.focus();
          }}
        >
          Skip to zone list
        </a>
      )}
      <header className="mast">
        <div className="brand">
          <Icon name="atlas" size={34} />
          <b>EarthLab</b>
        </div>
        <span className="brand-divider" />
        <h1 className="product-title">Earth overview</h1>
        <div className="header-end">
          <span className="study-location">
            <Icon name="pin" size={14} />
            Texas Gulf Coast
          </span>
          <span
            className="demo-status earth-imagery-status"
            title={
              failed ? "Bundled USDA / USGS aerial reference" : photorealHelp(photoreal, imagery)
            }
          >
            <i className={`photoreal-${photoreal}`} />
            {failed
              ? "Aerial reference"
              : photoreal === "on"
                ? "Photoreal 3D"
                : photoreal === "loading"
                  ? "Loading 3D tiles"
                  : (imagery?.label ?? "Basemap")}
          </span>
          <button onClick={onOpenAtlas}>
            <Icon name="layers" size={15} />
            Houston atlas
          </button>
        </div>
      </header>
      <div className="earth-stage">
        <div
          ref={mount}
          className="earth-cesium"
          hidden={failed}
          aria-label="Interactive globe"
          role="application"
        />
        {failed && (
          <div className="earth-failed" role="status">
            <span>
              Houston aerial reference · USDA / USGS
              <br />
              3D view unavailable on this device
            </span>
          </div>
        )}
        {tooltip && !inZone && (
          <div className="earth-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
            {tooltip.text}
          </div>
        )}
        {!inZone && (
          <nav className="earth-zones" id="earth-zones" tabIndex={-1} aria-label="Study zones">
            {REGIONS.map((region) => (
              <section key={region.id}>
                <div className="earth-zones-head">
                  <h2>{region.name}</h2>
                  <p className="earth-locator">
                    Texas Gulf Coast{" "}
                    <span>
                      {region.anchor[1].toFixed(2)}° N · {Math.abs(region.anchor[0]).toFixed(2)}° W
                    </span>
                  </p>
                </div>
                <RegionInset region={region} highlighted={hovered} />
                <div className="earth-index-head">
                  <h3>
                    Study zones <span>({region.zones.length})</span>
                  </h3>
                  {!failed && (
                    <button className="earth-region-link" onClick={() => showRegion(region)}>
                      Show on globe
                    </button>
                  )}
                </div>
                <ul>
                  {region.zones.map((zone, index) => {
                    const [x, y] = zoneSizeKm(zone);
                    return (
                      <li key={zone.id}>
                        <button
                          id={`earth-zone-${zone.id}`}
                          className={`earth-zone ${hovered === zone.id ? "is-hot" : ""}`}
                          onMouseEnter={() => setHovered(zone.id)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(zone.id)}
                          onBlur={() => setHovered(null)}
                          onClick={() => void enterZone(zone)}
                          disabled={flying !== null}
                          aria-label={`Open ${zone.name}`}
                        >
                          <span className="earth-zone-ref" aria-hidden="true">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className="earth-zone-description">
                            <span className="earth-zone-name">{zone.name}</span>
                            <span className="earth-zone-meta">
                              {flying === zone.id ? "Opening zone…" : zone.area} · {x.toFixed(0)} ×{" "}
                              {y.toFixed(0)} km
                            </span>
                          </span>
                          <Icon name="down" size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
        )}
        {!failed && (
          <div className="earth-controls" aria-label="Globe navigation">
            <button type="button" aria-label="Zoom in" onClick={() => zoom("in")}>
              +
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => zoom("out")}>
              −
            </button>
            {!inZone && (
              <>
                <span className="earth-rule" />
                <button type="button" aria-label="Whole Earth" title="Whole Earth" onClick={goHome}>
                  <Icon name="reset" size={16} />
                </button>
              </>
            )}
            {!inZone && (
              <button
                type="button"
                aria-pressed={orbiting}
                aria-label={orbiting ? "Pause orbit" : "Resume orbit"}
                title={orbiting ? "Pause orbit" : "Resume orbit"}
                onClick={toggleOrbit}
              >
                <Icon name={orbiting ? "pause" : "play"} size={14} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function photorealHelp(state: Photoreal, imagery: ImageryStatus | null) {
  if (state === "on") return "Google Photorealistic 3D Tiles (display only)";
  if (state === "error")
    return "Photoreal tiles unavailable · " + (imagery?.label ?? "standard basemap");
  if (state === "loading") return "Loading Google Photorealistic 3D Tiles";
  return imagery?.warning ?? imagery?.credit ?? "Geographic display reference";
}
