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
import { addPhotorealTiles, photorealConfigured, sharpenRendering, usgsImageryLayer } from "./imagery";
import { REGIONS, findZone, regionBBox, zoneSizeKm, type BBox, type Region, type Zone } from "./zones";
import "./earth.css";

export interface EarthViewProps {
  /** Zone the route says is open (the simulator is shown on top), or null for the Earth view. */
  activeZoneId: string | null;
  /** Called once the camera has flown into a zone; the parent then opens the simulator. */
  onZoneEntered: (zoneId: string) => void;
  onOpenAtlas: () => void;
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

/**
 * Widen a box on one side so the subject lands in the part of the screen not covered by a panel:
 * the zone list sits on the left of the region view, the simulator panel on the right of a zone.
 */
function framed(bbox: BBox, side: "west" | "east", fraction: number): BBox {
  const [w, s, e, n] = bbox;
  const pad = (e - w) * fraction;
  return side === "west" ? [w - pad, s, e, n] : [w, s, e + pad, n];
}
const zoneFrame = (zone: Zone) => framed(zone.bbox, "east", 0.75);
const regionFrame = (region: Region) => framed(regionBBox(region), "west", 0.5);

function sphereFor(bbox: BBox) {
  const [w, s, e, n] = bbox;
  return BoundingSphere.fromPoints(Cartesian3.fromDegreesArray([w, s, e, s, e, n, w, n]));
}

type Photoreal = "off" | "loading" | "on" | "error";

export default function EarthView({ activeZoneId, onZoneEntered, onOpenAtlas, children }: EarthViewProps) {
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
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(pitchDeg), sphere.radius * rangeFactor),
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
    setFlying(zone.id);
    const arrived = await flyTo(zoneFrame(zone), -50, 1.9);
    setFlying(null);
    if (arrived) {
      atZone.current = zone.id;
      callbacks.current.onZoneEntered(zone.id);
    }
  };
  const showRegion = (region: Region) => {
    stopOrbit();
    void flyTo(regionFrame(region), -66, 2.0);
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
        baseLayer: usgsImageryLayer(),
        contextOptions: { webgl: { alpha: false, preserveDrawingBuffer: true } },
      });
    } catch {
      setFailed(true);
      return;
    }
    viewerRef.current = viewer;
    sharpenRendering(viewer);
    const scene = viewer.scene;
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
          distanceDisplayCondition: new DistanceDisplayCondition(REGION_MARKER_MIN_M, Number.MAX_VALUE),
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
          distanceDisplayCondition: new DistanceDisplayCondition(REGION_MARKER_MIN_M, Number.MAX_VALUE),
        },
      });
      for (const zone of region.zones) {
        const [w, s, e, n] = zone.bbox;
        const ring = [w, s, e, s, e, n, w, n, w, s];
        zoneEntities.current.set(
          zone.id,
          viewer.entities.add({
            id: `zone:${zone.id}`,
            polygon: { hierarchy: Cartesian3.fromDegreesArray(ring.slice(0, 8)), material: fill(false) },
          }),
        );
        viewer.entities.add({
          id: `zone-edge:${zone.id}`,
          polyline: { positions: Cartesian3.fromDegreesArray(ring), width: 2, material: amber, clampToGround: true },
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
              x: event.endPosition.x,
              y: event.endPosition.y,
              text: hit?.zone ? `${name} · open the street & flood simulator` : `${name} · show simulation zones`,
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
      void flyTo(zoneFrame(zone), -50, 1.9);
    } else if (!zone && previous) {
      atZone.current = null;
      const region = REGIONS.find((r) => r.zones.some((z) => z.id === previous));
      if (region) void flyTo(regionFrame(region), -66, 2.0);
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
    <div className={`earth-shell ${inZone ? "zone-open" : ""}`}>
      <a className="skip" href="#earth-zones">
        Skip to zone list
      </a>
      <header className="mast">
        <div className="brand">
          <Icon name="atlas" size={34} />
          <b>EarthLab</b>
        </div>
        <span className="brand-divider" />
        <h1 className="product-title">Earth</h1>
        <div className="header-end">
          <span className="study-location">
            <Icon name="pin" size={14} />
            {REGIONS.length} study region · {REGIONS.reduce((n, r) => n + r.zones.length, 0)} zones
          </span>
          <span className="demo-status earth-imagery-status" title={photorealHelp(photoreal)}>
            <i className={`photoreal-${photoreal}`} />
            {photoreal === "on" ? "Photoreal 3D" : photoreal === "loading" ? "Loading 3D tiles" : "Aerial imagery"}
          </span>
          <button onClick={onOpenAtlas}>
            <Icon name="layers" size={15} />
            Houston scenario atlas
          </button>
        </div>
      </header>
      <div className="earth-stage">
        <div ref={mount} className="earth-cesium" aria-label="Interactive globe" role="application" />
        {failed && (
          <div className="earth-failed" role="alert">
            3D globe unavailable on this device. Pick a zone from the list to open the simulator.
          </div>
        )}
        {tooltip && !inZone && (
          <div className="earth-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
            {tooltip.text}
          </div>
        )}
        {!inZone && (
          <nav className="earth-zones" id="earth-zones" aria-label="Simulation zones">
            {REGIONS.map((region) => (
              <section key={region.id}>
                <div className="earth-zones-head">
                  <span className="earth-eyebrow">Study region</span>
                  <h2>{region.name}</h2>
                  <button className="earth-link" onClick={() => showRegion(region)}>
                    Show zones on the map
                  </button>
                </div>
                <p className="earth-hint">Pick a zone to fly in and open the street &amp; flood simulator.</p>
                <ul>
                  {region.zones.map((zone) => {
                    const [x, y] = zoneSizeKm(zone);
                    return (
                      <li key={zone.id}>
                        <button
                          className={`earth-zone ${hovered === zone.id ? "is-hot" : ""}`}
                          onMouseEnter={() => setHovered(zone.id)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(zone.id)}
                          onBlur={() => setHovered(null)}
                          onClick={() => void enterZone(zone)}
                          disabled={flying !== null}
                          aria-describedby={`zone-sum-${zone.id}`}
                        >
                          <span className="earth-zone-name">{zone.name}</span>
                          <span className="earth-zone-meta">
                            {zone.area} · {x.toFixed(0)} × {y.toFixed(0)} km
                          </span>
                          <span className="earth-zone-sum" id={`zone-sum-${zone.id}`}>
                            {zone.summary}
                          </span>
                          <span className="earth-zone-go" aria-hidden="true">
                            {flying === zone.id ? "Flying in…" : "Open simulator →"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
        )}
        <div className="earth-controls" aria-label="Globe navigation">
          <button type="button" aria-label="Zoom in" onClick={() => zoom("in")}>
            +
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoom("out")}>
            −
          </button>
          <span className="earth-rule" />
          <button type="button" aria-label="Whole Earth" title="Whole Earth" onClick={goHome}>
            ◯
          </button>
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
        {children}
      </div>
    </div>
  );
}

function photorealHelp(state: Photoreal) {
  if (state === "on") return "Google Photorealistic 3D Tiles (display only)";
  if (state === "error") return "3D tiles failed to load; showing USGS aerial imagery";
  if (state === "loading") return "Loading Google Photorealistic 3D Tiles";
  return "USGS aerial imagery. Add VITE_GOOGLE_MAPS_TILES_KEY or VITE_CESIUM_ION_TOKEN to .env for photoreal 3D streets.";
}
