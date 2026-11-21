import type { BookmarkId, Point } from "../../atlas/domain";

export const BOUNDS: [number, number, number, number] = [-95.8, 29.45, -94.95, 30.05];
export const BOOKMARKS: Record<BookmarkId, { point: Point; range: number }> = {
  houston: { point: [-95.347, 29.748], range: 58000 },
  downtown: { point: [-95.3698, 29.7604], range: 19000 },
  bayou: { point: [-95.443, 29.764], range: 23000 },
  channel: { point: [-95.187, 29.735], range: 31000 },
};
export type DragTarget = { kind: "track"; index: number } | { kind: "center" } | { kind: "radius" };
export function clampPoint(point: Point): Point {
  return [Math.max(BOUNDS[0], Math.min(BOUNDS[2], point[0])), Math.max(BOUNDS[1], Math.min(BOUNDS[3], point[1]))];
}
export function distanceKm(a: Point, b: Point) {
  const radians = Math.PI / 180;
  const dLat = (b[1] - a[1]) * radians;
  const dLon = (b[0] - a[0]) * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
export function pointAtRadius(center: Point, radiusKm: number): Point {
  return clampPoint([center[0] + radiusKm / (111.32 * Math.cos(center[1] * Math.PI / 180)), center[1]]);
}
