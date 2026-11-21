/** Local editor data only. These shapes are not backend or ML wire contracts. */
export type Point = [number, number];
export type AtlasMode = "hurricane" | "flood";
export type EditorTool = "inspect" | "track" | "flood" | "closure" | "measure";
export type BookmarkId = "houston" | "downtown" | "bayou" | "channel";

export interface RoadSegment {
  id: string;
  name: string;
  points: Point[];
  from: string;
  to: string;
  sourceId: string;
  provenance: string;
}

export interface ScenarioAssumptions {
  intensity: number;
  rainfallMm: number;
  durationHours: number;
}

export interface AtlasSnapshot {
  mode: AtlasMode;
  track: Point[];
  floodCenter: Point;
  floodRadiusKm: number;
  progress: number;
  closedRoadIds: string[];
  assumptions: ScenarioAssumptions;
}

export interface RoadNetworkSummary {
  connectedComponents: number;
  reachableNodeCount: number;
  totalNodeCount: number;
  openRoadCount: number;
  disconnectedRoadIds: string[];
  closedRoadIds: string[];
}

/** [west, south, east, north]; scenario inputs stay in the Houston study area. */
export const HOUSTON_BOUNDS = [-95.8, 29.45, -94.95, 30.05] as const;
export const TRACK_POINT_LIMITS = { min: 2, max: 8 } as const;
export const FLOOD_RADIUS_LIMITS = { min: 0.5, max: 15 } as const;
export const ASSUMPTION_LIMITS = {
  intensity: { min: 1, max: 5, step: 1 },
  rainfallMm: { min: 0, max: 300, step: 5 },
  durationHours: { min: 1, max: 48, step: 1 },
} as const;
export const ILLUSTRATIVE_STORM_RADIUS_KM = 6;
export const ROAD_SOURCE_ID = "earthlab:houston-schematic-roads-v1";
export const ROAD_PROVENANCE =
  "EarthLab original CC0 schematic road fixture. Geometry and topology are invented for interaction; not a street survey, official road inventory, or road-condition feed.";
export const GEOMETRY_ASSUMPTIONS =
  "Geometric intersection with a drawn circle only. Flood radius grows linearly from 35% to 100% across the timeline; the hurricane marker has an arbitrary 6 km display footprint. Intensity and rainfall are display assumptions, not inputs to flood physics, road safety, or outage inference.";
export const CONNECTIVITY_ASSUMPTIONS =
  "Reachability from the schematic downtown junction after manually assumed closures. These are ordinary illustrative road connections, not emergency routes or verified street connectivity.";

export const HOUSTON_BOOKMARKS: Record<BookmarkId, { label: string; point: Point; range: number }> =
  {
    houston: { label: "Greater Houston", point: [-95.347, 29.748], range: 58_000 },
    downtown: { label: "Downtown Houston", point: [-95.3698, 29.7604], range: 19_000 },
    bayou: { label: "Buffalo Bayou", point: [-95.443, 29.764], range: 23_000 },
    channel: { label: "Ship Channel", point: [-95.187, 29.735], range: 31_000 },
  };

// Hand-authored ordinary junctions. There are no utility assets or facilities.
const junctions: Record<string, Point> = {
  downtown: [-95.3698, 29.7604],
  north: [-95.364, 29.79],
  northwest: [-95.407, 29.809],
  bayou: [-95.422, 29.765],
  west: [-95.487, 29.761],
  park: [-95.532, 29.777],
  midtown: [-95.376, 29.733],
  south: [-95.369, 29.683],
  east: [-95.313, 29.756],
  channel: [-95.252, 29.74],
  channelEast: [-95.195, 29.722],
  southeast: [-95.127, 29.698],
};

function road(
  id: string,
  name: string,
  from: string,
  to: string,
  bends: Point[] = [],
): RoadSegment {
  return {
    id,
    name,
    from,
    to,
    points: [[...junctions[from]], ...bends, [...junctions[to]]],
    sourceId: ROAD_SOURCE_ID,
    provenance: ROAD_PROVENANCE,
  };
}

export const HOUSTON_ROADS: RoadSegment[] = [
  road("downtown-north", "Downtown north link", "downtown", "north"),
  road("northwest-link", "Northwest connection", "north", "northwest", [[-95.384, 29.803]]),
  road("bayou-return", "Bayou return link", "northwest", "bayou"),
  road("downtown-bayou", "Downtown–Bayou link", "downtown", "bayou", [[-95.396, 29.755]]),
  road("bayou-crossing", "West Bayou crossing", "bayou", "west", [[-95.45, 29.772]]),
  road("park-approach", "Western park approach", "west", "park"),
  road("midtown-link", "Midtown connection", "downtown", "midtown"),
  road("south-link", "South neighborhood link", "midtown", "south"),
  road("east-connector", "East downtown connection", "downtown", "east"),
  road("channel-bridge", "Channel approach crossing", "east", "channel", [[-95.283, 29.752]]),
  road("channel-east", "East Channel connection", "channel", "channelEast"),
  road("coastal-connector", "Southeast neighborhood link", "channelEast", "southeast"),
];

export const SEED_TRACK: Point[] = [
  [-95.085, 29.665],
  [-95.255, 29.725],
  [-95.37, 29.765],
  [-95.505, 29.845],
];

export const BASELINE: AtlasSnapshot = {
  mode: "hurricane",
  track: SEED_TRACK.map((point) => [...point]),
  floodCenter: [-95.392, 29.759],
  floodRadiusKm: 5,
  progress: 0.5,
  closedRoadIds: [],
  assumptions: { intensity: 2, rainfallMm: 100, durationHours: 12 },
};

export const SEED_SCENARIO: AtlasSnapshot = {
  ...structuredClone(BASELINE),
  closedRoadIds: ["channel-bridge"],
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export function isFinitePoint(point: unknown): point is Point {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    point.every((value) => typeof value === "number" && Number.isFinite(value))
  );
}
export function clampPoint(point: Point): Point {
  if (!isFinitePoint(point))
    throw new RangeError("Map points must contain two finite longitude/latitude values.");
  return [
    clamp(point[0], HOUSTON_BOUNDS[0], HOUSTON_BOUNDS[2]),
    clamp(point[1], HOUSTON_BOUNDS[1], HOUSTON_BOUNDS[3]),
  ];
}

function kmOffset(point: Point, origin: Point): Point {
  return [
    (point[0] - origin[0]) * 111.32 * Math.cos((origin[1] * Math.PI) / 180),
    (point[1] - origin[1]) * 111.32,
  ];
}
function distanceKm(a: Point, b: Point): number {
  const [x, y] = kmOffset(b, a);
  return Math.hypot(x, y);
}

/** Constant visual travel speed along a hand-drawn path, not a storm forecast. */
export function getStormPosition(track: Point[], progress: number): Point {
  if (track.length === 0) return [...SEED_TRACK[0]];
  if (track.length === 1) return [...track[0]];
  const boundedProgress = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;
  const lengths = track.slice(1).map((point, index) => distanceKm(track[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0 || boundedProgress === 0) return [...track[0]];
  if (boundedProgress === 1) return [...track[track.length - 1]];
  let remaining = boundedProgress * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length && length > 0) {
      const fraction = remaining / length;
      return [
        track[index][0] + (track[index + 1][0] - track[index][0]) * fraction,
        track[index][1] + (track[index + 1][1] - track[index][1]) * fraction,
      ];
    }
    remaining -= length;
  }
  return [...track[track.length - 1]];
}

export function getFloodRadiusAtProgress(radiusKm: number, progress: number): number {
  const bounded = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;
  return Math.max(0, Number.isFinite(radiusKm) ? radiusKm : 0) * (0.35 + 0.65 * bounded);
}

/** Closed display ring; units are WGS84 degrees and the radius is in km. */
export function getFloodPolygon(center: Point, radiusKm: number, progress = 1): Point[] {
  const radius = getFloodRadiusAtProgress(radiusKm, progress);
  const latitudeRadius = radius / 111.32;
  const longitudeRadius = latitudeRadius / Math.cos((center[1] * Math.PI) / 180);
  const ring: Point[] = Array.from({ length: 48 }, (_, index) => {
    const angle = (index * Math.PI * 2) / 48;
    return [
      center[0] + Math.cos(angle) * longitudeRadius,
      center[1] + Math.sin(angle) * latitudeRadius,
    ];
  });
  return [...ring, [...ring[0]]];
}

/** Pure geometry only; intersection never changes a road's closure/safety status. */
export function polylineIntersectsCircle(
  points: Point[],
  center: Point,
  radiusKm: number,
): boolean {
  if (points.length === 0 || radiusKm < 0 || !Number.isFinite(radiusKm)) return false;
  if (points.length === 1) return distanceKm(center, points[0]) <= radiusKm;
  for (let index = 1; index < points.length; index += 1) {
    const a = kmOffset(points[index - 1], center);
    const b = kmOffset(points[index], center);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const fraction =
      lengthSquared === 0 ? 0 : clamp(-(a[0] * dx + a[1] * dy) / lengthSquared, 0, 1);
    if (Math.hypot(a[0] + fraction * dx, a[1] + fraction * dy) <= radiusKm + 1e-8) return true;
  }
  return false;
}

export function getOverlayIntersections(snapshot: AtlasSnapshot, roads = HOUSTON_ROADS): string[] {
  const center =
    snapshot.mode === "flood"
      ? snapshot.floodCenter
      : getStormPosition(snapshot.track, snapshot.progress);
  const radius =
    snapshot.mode === "flood"
      ? getFloodRadiusAtProgress(snapshot.floodRadiusKm, snapshot.progress)
      : ILLUSTRATIVE_STORM_RADIUS_KM;
  return roads
    .filter((segment) => polylineIntersectsCircle(segment.points, center, radius))
    .map((segment) => segment.id);
}

export function analyzeRoadNetwork(closedIds: string[], roads = HOUSTON_ROADS): RoadNetworkSummary {
  const knownIds = new Set(roads.map((segment) => segment.id));
  const closed = new Set(closedIds.filter((id) => knownIds.has(id)));
  const nodes = new Set(roads.flatMap((segment) => [segment.from, segment.to]));
  const adjacency = new Map([...nodes].map((id) => [id, new Set<string>()]));
  for (const segment of roads) {
    if (!closed.has(segment.id)) {
      adjacency.get(segment.from)!.add(segment.to);
      adjacency.get(segment.to)!.add(segment.from);
    }
  }
  const visit = (start: string): Set<string> => {
    const visited = new Set<string>();
    const pending = [start];
    while (pending.length) {
      const node = pending.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      for (const neighbor of adjacency.get(node) ?? [])
        if (!visited.has(neighbor)) pending.push(neighbor);
    }
    return visited;
  };
  const reachable = nodes.has("downtown") ? visit("downtown") : new Set<string>();
  const unvisited = new Set(nodes);
  let connectedComponents = 0;
  for (const node of nodes) {
    if (!unvisited.has(node)) continue;
    connectedComponents += 1;
    for (const member of visit(node)) unvisited.delete(member);
  }
  return {
    connectedComponents,
    reachableNodeCount: reachable.size,
    totalNodeCount: nodes.size,
    openRoadCount: roads.length - closed.size,
    disconnectedRoadIds: roads
      .filter(
        (segment) =>
          !closed.has(segment.id) && (!reachable.has(segment.from) || !reachable.has(segment.to)),
      )
      .map((segment) => segment.id),
    closedRoadIds: [...closed],
  };
}

export function deriveAtlas(
  snapshot: AtlasSnapshot,
  network = analyzeRoadNetwork(snapshot.closedRoadIds),
) {
  const stormPosition = getStormPosition(snapshot.track, snapshot.progress);
  const currentFloodRadiusKm = getFloodRadiusAtProgress(snapshot.floodRadiusKm, snapshot.progress);
  return {
    stormPosition,
    currentFloodRadiusKm,
    footprint:
      snapshot.mode === "flood"
        ? getFloodPolygon(snapshot.floodCenter, currentFloodRadiusKm)
        : getFloodPolygon(stormPosition, ILLUSTRATIVE_STORM_RADIUS_KM),
    intersectedRoadIds: getOverlayIntersections(snapshot),
    network,
  };
}
