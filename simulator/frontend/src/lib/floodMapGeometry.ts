import type { LonLat } from './api'

// Approximate carriageway widths by the road classes in regional metadata, in meters.
const CARRIAGEWAY_M = [16, 14, 11, 9, 8, 5.5, 3.5]

export function streetWidth(roadClass: number, depthCm: number, showWater: boolean): number {
  const width = CARRIAGEWAY_M[roadClass] ?? 5.5
  if (depthCm < 3) return width * 0.45
  if (!showWater) return width * 0.55
  // Shallow ponding covers less of the carriageway. At 15 cm, use the full street width.
  return width * (0.55 + 0.45 * Math.min(1, (depthCm - 3) / 12))
}

export type WaterSymbol = [number, number]

export function decodeClosures(encoded?: string): Uint8Array | undefined {
  return encoded === undefined ? undefined : Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
}

// Routing uses the original floating point depth. The public depth array rounds to centimeters.
export function isRoadClosed(mask: Uint8Array | undefined, index: number, depthCm: number, clearanceM: number) {
  if (!mask) return depthCm / 100 > clearanceM
  return (mask[index >> 3] & (1 << (index & 7))) !== 0
}

export function streetWater(depthCm: number, closed: boolean): WaterSymbol {
  if (depthCm < 3) return [0, 0]
  return [depthCm / 100, Number(closed)]
}

export type DirectionMark = { position: LonLat; angle: number }

// Sample by distance so dense DEM vertices do not pile up arrows. deck.gl's north-facing
// ground icon rotates counterclockwise, hence the negative geographic bearing.
export function directionMarks(path: LonLat[], spacingMeters: number, limit: number): DirectionMark[] {
  const segments: { a: LonLat; b: LonLat; start: number; length: number; angle: number }[] = []
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    const east = (b[0] - a[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360)
    const north = b[1] - a[1]
    const length = Math.hypot(east, north) * 111_195
    if (length <= 0) continue
    segments.push({ a, b, start: total, length, angle: -Math.atan2(east, north) * 180 / Math.PI })
    total += length
  }
  if (total < 45) return []
  const count = Math.min(limit, Math.max(1, Math.floor(total / spacingMeters)))
  let s = 0
  return Array.from({ length: count }, (_, i) => {
    const at = total * (i + 0.5) / count
    while (s < segments.length - 1 && at > segments[s].start + segments[s].length) s++
    const { a, b, start, length, angle } = segments[s]
    const t = (at - start) / length
    return { position: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], angle }
  })
}
