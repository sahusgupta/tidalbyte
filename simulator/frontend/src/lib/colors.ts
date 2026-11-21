export type RGBA = [number, number, number, number]

type Stop = [number, number, number, number, number?]

function ramp(stops: Stop[], v: number): RGBA {
  if (v <= stops[0][0]) {
    const s = stops[0]
    return [s[1], s[2], s[3], s[4] ?? 255]
  }
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]
    const b = stops[i]
    if (v <= b[0]) {
      const t = (v - a[0]) / (b[0] - a[0])
      const lerp = (x: number, y: number) => x + (y - x) * t
      return [lerp(a[1], b[1]), lerp(a[2], b[2]), lerp(a[3], b[3]), lerp(a[4] ?? 255, b[4] ?? 255)]
    }
  }
  const s = stops[stops.length - 1]
  return [s[1], s[2], s[3], s[4] ?? 255]
}

// depth in metres
const ROAD_WET: Stop[] = [
  [0.03, 103, 232, 249, 230],
  [0.15, 56, 189, 248, 245],
  [0.3, 59, 130, 246, 255],
  [0.75, 99, 102, 241, 255],
]

export const ROAD_DRY: RGBA = [236, 232, 222, 70]
export const ROAD_BRIDGE: RGBA = [236, 232, 222, 120]
export const ROAD_BLOCKED: RGBA = [248, 82, 82, 255]

export function roadColor(depthM: number, clearance: number, bridge: boolean): RGBA {
  if (depthM > clearance) return ROAD_BLOCKED
  if (depthM < 0.03) return bridge ? ROAD_BRIDGE : ROAD_DRY
  return ramp(ROAD_WET, depthM)
}

const BLD_FLOOD: Stop[] = [
  [0.0, 206, 200, 188],
  [0.05, 165, 222, 250],
  [0.15, 96, 186, 250],
  [0.5, 47, 120, 240],
  [1.2, 37, 72, 200],
  [2.5, 30, 41, 130],
]

export function buildingFloodColor(depthM: number): RGBA {
  if (depthM < 0.03) return [206, 200, 188, 225]
  return ramp(BLD_FLOOD, depthM)
}

const ACCESS: Stop[] = [
  [0, 52, 211, 153],
  [5, 163, 230, 53],
  [10, 250, 204, 21],
  [15, 251, 146, 60],
  [25, 239, 68, 68],
]
export const CUT_OFF_COLOR: RGBA = [192, 38, 211, 255]

export function accessColor(minutes: number | null): RGBA {
  if (minutes === null) return CUT_OFF_COLOR
  return ramp(ACCESS, minutes)
}

export const WATER_LEGEND = [
  { label: '3 cm', color: 'rgb(120,220,255)' },
  { label: '15 cm', color: 'rgb(70,175,255)' },
  { label: '30 cm', color: 'rgb(40,130,245)' },
  { label: '60 cm', color: 'rgb(30,90,220)' },
  { label: '1.2 m', color: 'rgb(25,55,175)' },
  { label: '2.5 m+', color: 'rgb(20,30,120)' },
]

export const ACCESS_LEGEND = [
  { label: '<5', color: 'rgb(52,211,153)' },
  { label: '10', color: 'rgb(250,204,21)' },
  { label: '15', color: 'rgb(251,146,60)' },
  { label: '25+', color: 'rgb(239,68,68)' },
  { label: 'cut off', color: 'rgb(192,38,211)' },
]
