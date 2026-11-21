import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Point } from "../../atlas/domain";
import { FLOOD_RADIUS_LIMITS, HOUSTON_ROADS, SEED_TRACK, getFloodPolygon } from "../../atlas/domain";
import { offlineCounties } from "@earthlab/contracts";
import type { AtlasMapProps } from "./Globe";
import {
  BOUNDS,
  BOOKMARKS,
  clampPoint,
  distanceKm,
  pointAtRadius,
  type DragTarget,
} from "./mapGeometry";

const X = (point: Point) => ((point[0] - BOUNDS[0]) / (BOUNDS[2] - BOUNDS[0])) * 1000;
const Y = (point: Point) => ((BOUNDS[3] - point[1]) / (BOUNDS[3] - BOUNDS[1])) * 760;
const path = (points: Point[]) => points.map((point) => `${X(point)},${Y(point)}`).join(" ");
const dark = "#202c28";
const boundStart = (start: number, size: number, extent: number, padding: number) =>
  Math.max(Math.min(-padding, extent + padding - size), Math.min(Math.max(-padding, extent + padding - size), start));
const overviewPoints = [...SEED_TRACK, ...HOUSTON_ROADS.flatMap((road) => road.points)];
/** Fixed authored study extent; user edits never trigger automatic reframing. */
export const HOUSTON_OVERVIEW_CENTER: Point = [
  (Math.min(...overviewPoints.map((point) => point[0])) + Math.max(...overviewPoints.map((point) => point[0]))) / 2,
  (Math.min(...overviewPoints.map((point) => point[1])) + Math.max(...overviewPoints.map((point) => point[1]))) / 2,
];

export function FlatMap(props: AtlasMapProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, width: 1000, height: 760 });
  const [local, setLocal] = useState<{ track: Point[]; center: Point; radius: number } | null>(
    null,
  );
  const [hoveredRoad, setHoveredRoad] = useState<string | null>(null);
  const [scaleFactor, setScaleFactor] = useState(1);
  const drag = useRef<{
    target: DragTarget | { kind: "pan" };
    start: Point;
    screen: Point;
    scale: Point;
    view: typeof view;
    track: Point[];
    center: Point;
    radius: number;
    moved: boolean;
  } | null>(null);
  const track = local?.track ?? props.track;
  const center = local?.center ?? props.floodCenter;
  const ratio = props.currentFloodRadiusKm / Math.max(0.1, props.floodRadiusKm);
  const radius = local ? local.radius * ratio : props.currentFloodRadiusKm;

  useEffect(() => {
    const target = BOOKMARKS[props.bookmark];
    const aspect = (svg.current?.clientWidth || 1000) / (svg.current?.clientHeight || 760);
    const scale = props.bookmark === "houston" ? Math.min(1.8, Math.max(.88, .82 / aspect)) : props.bookmark === "downtown" ? 0.35 : 0.45;
    const point = props.bookmark === "houston" ? HOUSTON_OVERVIEW_CENTER : target.point;
    setView({
      x: X(point) - 500 * scale,
      y: Y(point) - 380 * scale,
      width: 1000 * scale,
      height: 760 * scale,
    });
  }, [props.bookmark, props.cameraRevision]);

  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const update = () => setScaleFactor(node.getScreenCTM()?.a || 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view]);

  const eventPoint = (event: { clientX: number; clientY: number }): Point => {
    const node = svg.current;
    if (!node) return props.floodCenter;
    const matrix = node.getScreenCTM();
    if (!matrix) return props.floodCenter;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return clampPoint([
      BOUNDS[0] + (point.x / 1000) * (BOUNDS[2] - BOUNDS[0]),
      BOUNDS[3] - (point.y / 760) * (BOUNDS[3] - BOUNDS[1]),
    ]);
  };
  const begin = (event: ReactPointerEvent<SVGElement>, target: DragTarget | { kind: "pan" }) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const matrix = svg.current?.getScreenCTM();
    drag.current = {
      target,
      start: eventPoint(event),
      screen: [event.clientX, event.clientY],
      scale: [1 / (matrix?.a || 1), 1 / (matrix?.d || 1)],
      view,
      track: props.track.map((point) => [...point] as Point),
      center: [...props.floodCenter],
      radius: props.floodRadiusKm,
      moved: false,
    };
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const value = drag.current;
    if (!value) return;
    const point = eventPoint(event);
    if (distanceKm(value.start, point) > 0.03) value.moved = true;
    if (value.target.kind === "pan") {
      const dx = (event.clientX - value.screen[0]) * value.scale[0],
        dy = (event.clientY - value.screen[1]) * value.scale[1];
      setView({
        ...value.view,
        x: boundStart(value.view.x - dx, value.view.width, 1000, 100),
        y: boundStart(value.view.y - dy, value.view.height, 760, 75),
      });
      return;
    }
    if (value.target.kind === "track") value.track[value.target.index] = point;
    if (value.target.kind === "center") value.center = point;
    if (value.target.kind === "radius")
      value.radius = Math.max(
        FLOOD_RADIUS_LIMITS.min,
        Math.min(FLOOD_RADIUS_LIMITS.max, distanceKm(value.center, point) / Math.max(0.05, ratio)),
      );
    setLocal({
      track: value.track.map((point) => [...point] as Point),
      center: [...value.center],
      radius: value.radius,
    });
  };
  const end = (event: ReactPointerEvent<SVGSVGElement>) => {
    const value = drag.current;
    drag.current = null;
    if (!value) return;
    if (value.target.kind === "track") props.onTrackChange(value.track);
    else if (value.target.kind !== "pan") props.onFloodChange(value.center, value.radius);
    else if (!value.moved && (props.tool === "track" || props.tool === "flood"))
      props.onMapPoint(eventPoint(event));
    setLocal(null);
  };
  const zoom = (factor: number) =>
    setView((current) => {
      const width = Math.max(160, Math.min(1800, current.width * factor));
      const height = width * 0.76;
      return {
        x: current.x + (current.width - width) / 2,
        y: current.y + (current.height - height) / 2,
        width,
        height,
      };
    });
  const nudgeTrack = (index: number, key: string) => {
    const direction = (
      {
        ArrowLeft: [-0.005, 0],
        ArrowRight: [0.005, 0],
        ArrowUp: [0, 0.005],
        ArrowDown: [0, -0.005],
      } as Record<string, Point>
    )[key];
    if (!direction) return;
    props.onTrackChange(
      props.track.map((point, at) =>
        at === index ? clampPoint([point[0] + direction[0], point[1] + direction[1]]) : point,
      ),
    );
  };
  const footprint = getFloodPolygon(center, radius);
  const radiusPoint = pointAtRadius(center, radius);
  const pixelsPerKm =
    (scaleFactor * 1000) / (0.85 * 111.32 * Math.cos((props.floodCenter[1] * Math.PI) / 180));
  const scalePixels = (svg.current?.clientWidth || 390) < 360 ? 52 : (svg.current?.clientWidth || 390) < 580 ? 80 : 100;
  const scaleKm = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].reduce(
    (best, value) => (value <= scalePixels / pixelsPerKm ? value : best),
    0.1,
  );
  return (
    <>
      <svg
        ref={svg}
        className="atlas-flat-map"
        style={{ "--atlas-map-scale-factor": scaleFactor } as CSSProperties}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid slice"
        role="application"
        tabIndex={0}
        aria-label="Interactive 2D Houston aerial atlas. Arrow keys pan; plus and minus zoom. Tab to roads and waypoints."
        onPointerDown={(event) => begin(event, { kind: "pan" })}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onWheel={(event) => {
          zoom(event.deltaY > 0 ? 1.12 : 0.89);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const direction = (
            {
              ArrowLeft: [-30, 0],
              ArrowRight: [30, 0],
              ArrowUp: [0, -30],
              ArrowDown: [0, 30],
            } as Record<string, number[]>
          )[event.key];
          if (direction) {
            event.preventDefault();
            setView((value) => ({
              ...value,
              x: boundStart(value.x + (direction[0] * value.width) / 1000, value.width, 1000, 100),
              y: boundStart(value.y + (direction[1] * value.height) / 1000, value.height, 760, 75),
            }));
          }
          if (event.key === "+" || event.key === "=") zoom(0.8);
          if (event.key === "-") zoom(1.25);
        }}
      >
        <image
          className="flat-aerial"
          href="/map/houston-usgs.webp"
          x={X([-95.9, 0])}
          y={Y([0, 30.200078125])}
          width={(1.2 / 0.85) * 1000}
          height={(0.95015625 / 0.6) * 760}
          preserveAspectRatio="none"
        />
        <image
          className="flat-aerial"
          href="/map/houston-detail-usgs.webp"
          x={X([-95.570036869, 0])}
          y={Y([0, 29.96])}
          width={(0.490073738 / 0.85) * 1000}
          height={(0.36 / 0.6) * 760}
          preserveAspectRatio="none"
        />
        {props.showRoads !== false &&
          props.roads.map((road) => {
            const selected = props.selectedRoadId === road.id || hoveredRoad === road.id;
            const closed = props.closedRoadIds.includes(road.id);
            const disconnected = props.disconnectedRoadIds?.includes(road.id);
            const color = closed
                ? "#d58b76"
                : disconnected
                  ? "#b2a4c1"
                  : selected ? "#fff5dc" : "#c9cec3";
            const middle = road.points[Math.floor(road.points.length / 2)];
            return (
              <g key={road.id}>
                <polyline
                  points={path(road.points)}
                  fill="none"
                  stroke={dark}
                  strokeWidth={selected ? 6.5 : 4.5}
                  strokeOpacity={0.85}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <polyline
                  className="flat-road"
                  role="button"
                  tabIndex={0}
                  aria-label={`${road.name}. ${closed ? "Hypothetical closure." : "Flood exposure unknown."} Select to inspect.`}
                  points={path(road.points)}
                  fill="none"
                  stroke={color}
                  strokeWidth={selected ? 3.75 : 2.25}
                  strokeDasharray={closed || disconnected ? "8 6" : undefined}
                  vectorEffect="non-scaling-stroke"
                  onPointerEnter={() => setHoveredRoad(road.id)}
                  onPointerLeave={() => setHoveredRoad(null)}
                  onFocus={() => setHoveredRoad(road.id)}
                  onBlur={() => setHoveredRoad(null)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (props.tool === "track" || props.tool === "flood")
                      props.onMapPoint(eventPoint(event));
                    else props.onRoadSelect(road.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      props.onRoadSelect(road.id);
                    }
                  }}
                >
                  <title>{road.name} · flood exposure unknown</title>
                </polyline>
                {hoveredRoad === road.id && (
                  <text
                    x={X(middle)}
                    y={Y(middle) + 17 / scaleFactor}
                    textAnchor="middle"
                    style={{ fill: color }}
                  >
                    {closed ? "× " : ""}
                    {road.name}
                  </text>
                )}
                {selected && [road.points[0], road.points[road.points.length - 1]].map((point, index) => (
                  <circle
                    key={index}
                    cx={X(point)}
                    cy={Y(point)}
                    r={2.5 / scaleFactor}
                    fill="#e9e6d0"
                    stroke={dark}
                    strokeWidth={1 / scaleFactor}
                    pointerEvents="none"
                  />
                ))}
              </g>
            );
          })}
        <text
          className="flat-place-major"
          x={X([-95.3698, 29.7604]) + 14 / scaleFactor}
          y={Y([-95.3698, 29.7604]) - 20 / scaleFactor}
          fontWeight="500"
        >
          Downtown Houston
        </text>
        <text
          x={X([-95.446, 29.777]) - 16 / scaleFactor}
          y={Y([-95.446, 29.777]) - 24 / scaleFactor}
          textAnchor="end"
        >
          Buffalo Bayou
        </text>
        <text
          x={X([-95.185, 29.735]) + 12 / scaleFactor}
          y={Y([-95.185, 29.735]) + 20 / scaleFactor}
        >
          Ship Channel
        </text>
        {props.showFlood !== false && (
          <>
            {props.comparison && props.mode === "hurricane" && props.baselineTrack && (
              <polyline
                points={path(props.baselineTrack)}
                fill="none"
                stroke="#f5f0df"
                strokeWidth="3"
                strokeDasharray="12 9"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {props.comparison &&
              props.mode === "flood" &&
              props.baselineFloodCenter &&
              props.baselineFloodRadiusKm && (
                <polygon
                  points={path(
                    getFloodPolygon(props.baselineFloodCenter, props.baselineFloodRadiusKm),
                  )}
                  fill="none"
                  stroke="#f5f0df"
                  strokeWidth="3"
                  strokeDasharray="12 9"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )}
            {props.mode === "hurricane" ? (
              <>
                <polyline
                  points={path(track)}
                  fill="none"
                  stroke="#e6aa63"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <ellipse
                  cx={X(props.stormPosition)}
                  cy={Y(props.stormPosition)}
                  rx={X(pointAtRadius(props.stormPosition, 6)) - X(props.stormPosition)}
                  ry={(6 / 111.32 / 0.6) * 760}
                  fill="#e6ae65"
                  fillOpacity=".06"
                  stroke="#efc58d"
                  strokeOpacity=".5"
                  pointerEvents="none"
                />
                {track.map((point, index) => (
                  <g key={index}>
                    <circle
                      className="flat-handle"
                      role="button"
                      tabIndex={0}
                      aria-label={`Waypoint ${index + 1}. Drag or use arrow keys to reposition.`}
                      cx={X(point)}
                      cy={Y(point)}
                      r={(props.tool === "track" ? 7 : 5) / scaleFactor}
                      fill="transparent"
                      stroke="#f0b977"
                      strokeWidth={2.5 / scaleFactor}
                      onPointerDown={(event) => {
                        if (props.tool === "track") begin(event, { kind: "track", index });
                      }}
                      onKeyDown={(event) => {
                        if (props.tool === "track" && event.key.startsWith("Arrow")) {
                          event.preventDefault();
                          event.stopPropagation();
                          nudgeTrack(index, event.key);
                        }
                      }}
                    />
                    {props.tool === "track" && (
                      <text
                        x={X(point) + (index % 2 ? 14 : -14) / scaleFactor}
                        y={Y(point) + 20 / scaleFactor}
                        textAnchor="middle"
                      >
                        {index + 1}
                      </text>
                    )}
                  </g>
                ))}
                <image
                  href="/map/storm-eye.svg"
                  x={X(props.stormPosition) - 14 / scaleFactor}
                  y={Y(props.stormPosition) - 14 / scaleFactor}
                  width={28 / scaleFactor}
                  height={28 / scaleFactor}
                  pointerEvents="none"
                />
                {props.tool === "track" && (
                  <text
                    x={X(props.stormPosition)}
                    y={Y(props.stormPosition) - 31 / scaleFactor}
                    textAnchor="middle"
                    fontWeight="500"
                  >
                    Storm center
                  </text>
                )}
              </>
            ) : (
              <>
                <polygon
                  points={path(footprint)}
                  fill="#9ecbc9"
                  fillOpacity=".3"
                  stroke="#c0deda"
                  strokeWidth="2"
                  strokeDasharray="9 6"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <circle
                  className="flat-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Illustrative flood center. Drag or use arrow keys to move."
                  cx={X(center)}
                  cy={Y(center)}
                  r={8 / scaleFactor}
                  fill="#b9ddda"
                  stroke={dark}
                  strokeWidth={4 / scaleFactor}
                  onPointerDown={(event) => {
                    if (props.tool === "flood") begin(event, { kind: "center" });
                  }}
                  onKeyDown={(event) => {
                    const delta = (
                      {
                        ArrowLeft: [-0.005, 0],
                        ArrowRight: [0.005, 0],
                        ArrowUp: [0, 0.005],
                        ArrowDown: [0, -0.005],
                      } as Record<string, Point>
                    )[event.key];
                    if (props.tool === "flood" && delta) {
                      event.preventDefault();
                      event.stopPropagation();
                      props.onFloodChange(
                        clampPoint([center[0] + delta[0], center[1] + delta[1]]),
                        props.floodRadiusKm,
                      );
                    }
                  }}
                />
                <circle
                  className="flat-handle"
                  role="slider"
                  tabIndex={0}
                  aria-label="Illustrative footprint maximum radius in kilometers"
                  aria-valuemin={FLOOD_RADIUS_LIMITS.min}
                  aria-valuemax={FLOOD_RADIUS_LIMITS.max}
                  aria-valuenow={props.floodRadiusKm}
                  cx={X(radiusPoint)}
                  cy={Y(radiusPoint)}
                  r={6 / scaleFactor}
                  fill="#f4e9ce"
                  stroke="#487276"
                  strokeWidth={3 / scaleFactor}
                  onPointerDown={(event) => {
                    if (props.tool === "flood") begin(event, { kind: "radius" });
                  }}
                  onKeyDown={(event) => {
                    if (props.tool === "flood" && event.key.startsWith("Arrow")) {
                      event.preventDefault();
                      event.stopPropagation();
                      props.onFloodChange(
                        center,
                        Math.max(
                          FLOOD_RADIUS_LIMITS.min,
                          Math.min(
                            FLOOD_RADIUS_LIMITS.max,
                            props.floodRadiusKm +
                              (event.key === "ArrowRight" || event.key === "ArrowUp" ? 0.5 : -0.5),
                          ),
                        ),
                      );
                    }
                  }}
                />
                {props.tool === "flood" && (
                  <text
                    x={X(center) - 12 / scaleFactor}
                    y={Y(center) - 12 / scaleFactor}
                    textAnchor="end"
                    fontWeight="500"
                  >
                    Extent center
                  </text>
                )}
              </>
            )}
          </>
        )}
        {(props.countyPredictions ?? []).map((prediction) => {
          const feature = offlineCounties.features.find(
            (item) => item.properties.countyFips === prediction.countyFips,
          );
          if (!feature) return null;
          const ring = feature.geometry.coordinates[0] as Point[];
          const midpoint = clampPoint([
            ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
            ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
          ]);
          const labelX = Math.max(view.x + 12, Math.min(view.x + view.width - 220, X(midpoint)));
          const labelY = Math.max(view.y + 35, Math.min(view.y + view.height - 32, Y(midpoint)));
          return (
            <g key={prediction.countyFips} pointerEvents="none">
              <polyline
                points={path(ring)}
                fill="none"
                stroke="#d9ddc8"
                strokeOpacity=".6"
                strokeWidth="2"
                strokeDasharray="12 10"
                vectorEffect="non-scaling-stroke"
              />
              <text x={labelX} y={labelY} fontSize="10">
                <tspan x={labelX}>
                  {feature.properties.name} · {prediction.predictedSeverity}{" "}
                  {prediction.severityUnit}
                </tspan>
                <tspan x={labelX} dy={14 / scaleFactor}>
                  Schematic ·{" "}
                  {prediction.dataMode === "offline_example"
                    ? "Offline example"
                    : "Conditional model"}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <div className="atlas-distance-scale" role="img" aria-label={`Approximate scale ${scaleKm} kilometers at view center`}>
        <span className="atlas-scale-line" style={{ width: Math.min(scalePixels, Math.max(10, scaleKm * pixelsPerKm)) }} />
        <span>{scaleKm} km</span>
      </div>
      <div className="atlas-zoom-pair atlas-flat-zoom" role="group" aria-label="2D map zoom">
        <button type="button" aria-label="Zoom 2D map in" onClick={() => zoom(0.8)}>
          +
        </button>
        <button type="button" aria-label="Zoom 2D map out" onClick={() => zoom(1.25)}>
          −
        </button>
      </div>
    </>
  );
}
