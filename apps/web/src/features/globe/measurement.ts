import type { Point } from "../../atlas/domain";
import { BOUNDS } from "./mapGeometry";

export function parseMeasurementPoint(longitude: string, latitude: string): Point | null {
  if (!longitude.trim() || !latitude.trim()) return null;
  const point: Point = [Number(longitude), Number(latitude)];
  return point.every(Number.isFinite) &&
    point[0] >= BOUNDS[0] && point[0] <= BOUNDS[2] &&
    point[1] >= BOUNDS[1] && point[1] <= BOUNDS[3]
    ? point : null;
}

/** A third point starts a fresh measurement; scenario geometry is never changed. */
export function addMeasurementPoint(points: Point[], point: Point): Point[] {
  if (!parseMeasurementPoint(String(point[0]), String(point[1]))) return points;
  return points.length === 1 ? [points[0], [...point]] : [[...point]];
}
