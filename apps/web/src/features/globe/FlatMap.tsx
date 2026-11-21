import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Point } from "../../atlas/domain";
import { FLOOD_RADIUS_LIMITS, getFloodPolygon } from "../../atlas/domain";
import { offlineCounties } from "@earthlab/contracts";
import type { AtlasMapProps } from "./Globe";
import { BOUNDS, BOOKMARKS, clampPoint, distanceKm, pointAtRadius, type DragTarget } from "./mapGeometry";

const X = (point: Point) => (point[0] - BOUNDS[0]) / (BOUNDS[2] - BOUNDS[0]) * 1000;
const Y = (point: Point) => (BOUNDS[3] - point[1]) / (BOUNDS[3] - BOUNDS[1]) * 760;
const path = (points: Point[]) => points.map((point) => `${X(point)},${Y(point)}`).join(" ");
const dark = "#172b30";

export function FlatMap(props: AtlasMapProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, width: 1000, height: 760 });
  const [local, setLocal] = useState<{ track: Point[]; center: Point; radius: number } | null>(null);
  const drag = useRef<{ target: DragTarget | { kind: "pan" }; start: Point; screen: Point; scale: Point; view: typeof view; track: Point[]; center: Point; radius: number; moved: boolean } | null>(null);
  const track = local?.track ?? props.track;
  const center = local?.center ?? props.floodCenter;
  const ratio = props.currentFloodRadiusKm / Math.max(0.1, props.floodRadiusKm);
  const radius = local ? local.radius * ratio : props.currentFloodRadiusKm;

  useEffect(() => {
    const target = BOOKMARKS[props.bookmark];
    const scale = props.bookmark === "houston" ? 1 : props.bookmark === "downtown" ? 0.35 : 0.45;
    setView({ x: X(target.point) - 500 * scale, y: Y(target.point) - 380 * scale, width: 1000 * scale, height: 760 * scale });
  }, [props.bookmark, props.cameraRevision]);

  const eventPoint = (event: { clientX: number; clientY: number }): Point => {
    const node = svg.current;
    if (!node) return props.floodCenter;
    const matrix = node.getScreenCTM();
    if (!matrix) return props.floodCenter;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return clampPoint([BOUNDS[0] + point.x / 1000 * (BOUNDS[2] - BOUNDS[0]), BOUNDS[3] - point.y / 760 * (BOUNDS[3] - BOUNDS[1])]);
  };
  const begin = (event: ReactPointerEvent<SVGElement>, target: DragTarget | { kind: "pan" }) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const matrix = svg.current?.getScreenCTM();
    drag.current = { target, start: eventPoint(event), screen: [event.clientX, event.clientY], scale: [1 / (matrix?.a || 1), 1 / (matrix?.d || 1)], view, track: props.track.map((point) => [...point] as Point), center: [...props.floodCenter], radius: props.floodRadiusKm, moved: false };
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const value = drag.current;
    if (!value) return;
    const point = eventPoint(event);
    if (distanceKm(value.start, point) > 0.03) value.moved = true;
    if (value.target.kind === "pan") {
      const dx = (event.clientX - value.screen[0]) * value.scale[0], dy = (event.clientY - value.screen[1]) * value.scale[1];
      setView({ ...value.view, x: Math.max(-100, Math.min(1100 - value.view.width, value.view.x - dx)), y: Math.max(-75, Math.min(835 - value.view.height, value.view.y - dy)) });
      return;
    }
    if (value.target.kind === "track") value.track[value.target.index] = point;
    if (value.target.kind === "center") value.center = point;
    if (value.target.kind === "radius") value.radius = Math.max(FLOOD_RADIUS_LIMITS.min, Math.min(FLOOD_RADIUS_LIMITS.max, distanceKm(value.center, point) / Math.max(0.05, ratio)));
    setLocal({ track: value.track.map((point) => [...point] as Point), center: [...value.center], radius: value.radius });
  };
  const end = (event: ReactPointerEvent<SVGSVGElement>) => {
    const value = drag.current;
    drag.current = null;
    if (!value) return;
    if (value.target.kind === "track") props.onTrackChange(value.track);
    else if (value.target.kind !== "pan") props.onFloodChange(value.center, value.radius);
    else if (!value.moved && (props.tool === "track" || props.tool === "flood")) props.onMapPoint(eventPoint(event));
    setLocal(null);
  };
  const zoom = (factor: number) => setView((current) => {
    const width = Math.max(160, Math.min(1100, current.width * factor));
    const height = width * .76;
    return { x: current.x + (current.width - width) / 2, y: current.y + (current.height - height) / 2, width, height };
  });
  const nudgeTrack = (index: number, key: string) => {
    const direction = ({ ArrowLeft: [-.005, 0], ArrowRight: [.005, 0], ArrowUp: [0, .005], ArrowDown: [0, -.005] } as Record<string, Point>)[key];
    if (!direction) return;
    props.onTrackChange(props.track.map((point, at) => at === index ? clampPoint([point[0] + direction[0], point[1] + direction[1]]) : point));
  };
  const footprint = getFloodPolygon(center, radius);
  const radiusPoint = pointAtRadius(center, radius);
  return <>
    <svg ref={svg} className="atlas-flat-map" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="xMidYMid slice" role="application" tabIndex={0} aria-label="Interactive 2D Houston aerial atlas. Arrow keys pan; plus and minus zoom. Tab to roads and waypoints." onPointerDown={(event) => begin(event, { kind: "pan" })} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onWheel={(event) => { zoom(event.deltaY > 0 ? 1.12 : .89); }} onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      const direction = ({ ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] } as Record<string, number[]>)[event.key];
      if (direction) { event.preventDefault(); setView((value) => ({ ...value, x: Math.max(-100, Math.min(1000 - value.width + 100, value.x + direction[0] * value.width / 1000)), y: Math.max(-75, Math.min(760 - value.height + 75, value.y + direction[1] * value.width / 1000)) })); }
      if (event.key === "+" || event.key === "=") zoom(.8);
      if (event.key === "-") zoom(1.25);
    }}>
      <image className="flat-aerial" href="/map/houston-usgs.webp" x={X([-95.9, 0])} y={Y([0, 30.200078125])} width={1.2 / .85 * 1000} height={.95015625 / .6 * 760} preserveAspectRatio="none" />
      <image className="flat-aerial" href="/map/houston-detail-usgs.webp" x={X([-95.570036869, 0])} y={Y([0, 29.96])} width={.490073738 / .85 * 1000} height={.36 / .6 * 760} preserveAspectRatio="none" />
      {props.showRoads !== false && props.roads.map((road) => {
        const selected = props.selectedRoadId === road.id;
        const closed = props.closedRoadIds.includes(road.id);
        const disconnected = props.disconnectedRoadIds?.includes(road.id);
        const color = selected ? "#f7ce83" : closed ? "#ef8b74" : disconnected ? "#bf9fce" : "#d3d4bd";
        const middle = road.points[Math.floor(road.points.length / 2)];
        return <g key={road.id}>
          <polyline points={path(road.points)} fill="none" stroke={dark} strokeWidth={selected ? 9 : 6} vectorEffect="non-scaling-stroke" />
          <polyline className="flat-road" role="button" tabIndex={0} aria-label={`${road.name}. ${closed ? "Hypothetical closure." : "Flood exposure unknown."} Select to inspect.`} points={path(road.points)} fill="none" stroke={color} strokeWidth={selected ? 5 : 3} strokeDasharray={closed || disconnected ? "8 6" : undefined} vectorEffect="non-scaling-stroke" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (props.tool === "track" || props.tool === "flood") props.onMapPoint(eventPoint(event)); else props.onRoadSelect(road.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onRoadSelect(road.id); } }}><title>{road.name} · flood exposure unknown</title></polyline>
          {(selected || view.width < 650) && <text x={X(middle)} y={Y(middle) + 17} textAnchor="middle" fontSize="11" style={{ fill: color }}>{closed ? "× " : ""}{road.name}</text>}
          {[road.points[0], road.points[road.points.length - 1]].map((point, index) => <circle key={index} cx={X(point)} cy={Y(point)} r="3" fill="#e9e6d0" stroke={dark} strokeWidth="1.5" />)}
        </g>;
      })}
      <text x={X([-95.3698, 29.7604])} y={Y([-95.3698, 29.7604]) - 20} fontSize="16" fontWeight="700" textAnchor="middle">DOWNTOWN HOUSTON</text>
      <text x={X([-95.446, 29.777])} y={Y([-95.446, 29.777])} fontSize="12" textAnchor="middle">BUFFALO BAYOU</text>
      <text x={X([-95.185, 29.735])} y={Y([-95.185, 29.735])} fontSize="12" textAnchor="middle">SHIP CHANNEL</text>
      {props.showFlood !== false && <>
        {props.comparison && props.mode === "hurricane" && props.baselineTrack && <polyline points={path(props.baselineTrack)} fill="none" stroke="#f5f0df" strokeWidth="3" strokeDasharray="12 9" vectorEffect="non-scaling-stroke" />}
        {props.comparison && props.mode === "flood" && props.baselineFloodCenter && props.baselineFloodRadiusKm && <polygon points={path(getFloodPolygon(props.baselineFloodCenter, props.baselineFloodRadiusKm))} fill="none" stroke="#f5f0df" strokeWidth="3" strokeDasharray="12 9" vectorEffect="non-scaling-stroke" />}
        {props.mode === "hurricane" ? <>
          <polyline points={path(track)} fill="none" stroke="#e2b475" strokeOpacity=".18" strokeWidth="16" vectorEffect="non-scaling-stroke" />
          <polyline points={path(track)} fill="none" stroke="#f2c487" strokeWidth="4" vectorEffect="non-scaling-stroke" />
          <ellipse cx={X(props.stormPosition)} cy={Y(props.stormPosition)} rx={X(pointAtRadius(props.stormPosition, 6)) - X(props.stormPosition)} ry={6 / 111.32 / .6 * 760} fill="#e6ae65" fillOpacity=".17" stroke="#efc58d" strokeOpacity=".7" />
          {track.map((point, index) => <g key={index}><circle className="flat-handle" role="button" tabIndex={0} aria-label={`Waypoint ${index + 1}. Drag or use arrow keys to reposition.`} cx={X(point)} cy={Y(point)} r="7" fill="#213b40" stroke="#f4ce92" strokeWidth="3" onPointerDown={(event) => { if (props.tool === "track") begin(event, { kind: "track", index }); }} onKeyDown={(event) => { if (props.tool === "track" && event.key.startsWith("Arrow")) { event.preventDefault(); event.stopPropagation(); nudgeTrack(index, event.key); } }} /><text x={X(point)} y={Y(point) - 16} fontSize="11" textAnchor="middle">W{index + 1}</text></g>)}
          <circle cx={X(props.stormPosition)} cy={Y(props.stormPosition)} r="12" fill="#efc28a" stroke={dark} strokeWidth="5" />
          <text x={X(props.stormPosition)} y={Y(props.stormPosition) - 26} textAnchor="middle" fontSize="11" fontWeight="700">HYPOTHETICAL STORM</text>
        </> : <>
          <polygon points={path(footprint)} fill="#9ecbc9" fillOpacity=".3" stroke="#c0deda" strokeWidth="2" strokeDasharray="9 6" vectorEffect="non-scaling-stroke" />
          <circle className="flat-handle" role="button" tabIndex={0} aria-label="Illustrative flood center. Drag or use arrow keys to move." cx={X(center)} cy={Y(center)} r="8" fill="#b9ddda" stroke={dark} strokeWidth="4" onPointerDown={(event) => { if (props.tool === "flood") begin(event, { kind: "center" }); }} onKeyDown={(event) => { const delta = ({ ArrowLeft: [-.005, 0], ArrowRight: [.005, 0], ArrowUp: [0, .005], ArrowDown: [0, -.005] } as Record<string, Point>)[event.key]; if (props.tool === "flood" && delta) { event.preventDefault(); event.stopPropagation(); props.onFloodChange(clampPoint([center[0] + delta[0], center[1] + delta[1]]), props.floodRadiusKm); } }} />
          <circle className="flat-handle" role="slider" tabIndex={0} aria-label="Illustrative footprint maximum radius in kilometers" aria-valuemin={FLOOD_RADIUS_LIMITS.min} aria-valuemax={FLOOD_RADIUS_LIMITS.max} aria-valuenow={props.floodRadiusKm} cx={X(radiusPoint)} cy={Y(radiusPoint)} r="6" fill="#f4e9ce" stroke="#487276" strokeWidth="3" onPointerDown={(event) => { if (props.tool === "flood") begin(event, { kind: "radius" }); }} onKeyDown={(event) => { if (props.tool === "flood" && event.key.startsWith("Arrow")) { event.preventDefault(); event.stopPropagation(); props.onFloodChange(center, Math.max(FLOOD_RADIUS_LIMITS.min, Math.min(FLOOD_RADIUS_LIMITS.max, props.floodRadiusKm + (event.key === "ArrowRight" || event.key === "ArrowUp" ? .5 : -.5)))); } }} />
          <text x={X(center)} y={Y(center) - 24} fontSize="11" textAnchor="middle" fontWeight="700">ILLUSTRATIVE EXTENT</text>
        </>}
      </>}
      {(props.countyPredictions ?? []).map((prediction) => {
        const feature = offlineCounties.features.find((item) => item.properties.countyFips === prediction.countyFips);
        if (!feature) return null;
        const ring = feature.geometry.coordinates[0] as Point[];
        const midpoint = ring[Math.floor(ring.length / 2)];
        return <g key={prediction.countyFips} pointerEvents="none"><polyline points={path(ring)} fill="none" stroke="#d9ddc8" strokeOpacity=".6" strokeWidth="2" strokeDasharray="12 10" vectorEffect="non-scaling-stroke" /><text x={X(midpoint)} y={Y(midpoint)} fontSize="10">{feature.properties.name} · {prediction.predictedSeverity} {prediction.severityUnit} · SCHEMATIC</text></g>;
      })}
    </svg>
    <div className="atlas-flat-controls" aria-label="2D map zoom"><button type="button" aria-label="Zoom 2D map in" onClick={() => zoom(.8)}>+</button><button type="button" aria-label="Zoom 2D map out" onClick={() => zoom(1.25)}>−</button></div>
  </>;
}
