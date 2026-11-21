import { clampPoint, type Point } from "../../atlas/domain";
export {
  HOUSTON_BOUNDS as BOUNDS,
  HOUSTON_BOOKMARKS as BOOKMARKS,
  clampPoint,
} from "../../atlas/domain";
export type DragTarget = { kind: "track"; index: number } | { kind: "center" } | { kind: "radius" };
export function distanceKm(a: Point, b: Point) {
  const radians = Math.PI / 180;
  const dLat = (b[1] - a[1]) * radians;
  const dLon = (b[0] - a[0]) * radians;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
export function pointAtRadius(center: Point, radiusKm: number): Point {
  return clampPoint([
    center[0] + radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180)),
    center[1],
  ]);
}
