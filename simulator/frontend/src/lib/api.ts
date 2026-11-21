export type LonLat = [number, number]

export type POI = { id: string; name: string; lon: number; lat: number; note?: string; node: number }

export type Preset = {
  label: string
  rain: number
  duration: number
  surge: number
  clog: number
  blurb: string
}

export type ModelInfo = {
  model: string
  target: string
  teacher: string
  r2: number
  mae_cm: number
  rmse_cm: number
  n_trees: number
  n_train_rows: number
  n_train_storms: number
  n_val_storms: number
  classification: { threshold_m: number; accuracy: number; precision: number; recall: number; f1: number }[]
  importance: { feature: string; label: string; share: number }[]
  presets: Record<string, { sim_pct_roads_15cm: number; ml_pct_roads_15cm: number }>
}

export type ViewState = { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number }

export type Meta = {
  region: { id: string; name: string; bbox: number[]; view: ViewState; blurb: string; base_water_level: number }
  grid: { bounds: [number, number, number, number]; width: number; height: number; cell_m: number }
  hospitals: POI[]
  neighborhoods: POI[]
  counts: { edges: number; nodes: number; buildings: number; road_km: number }
  road_classes: string[]
  presets: Record<string, Preset>
  vehicles: Record<string, { label: string; clearance_m: number }>
  model: ModelInfo
}

export type Roads = {
  paths: LonLat[][]
  cls: number[]
  bridge: number[]
  name: (string | null)[]
  len: number[]
}

export type Buildings = {
  polys: LonLat[][]
  h: number[]
  name: (string | null)[]
  kind: string[]
}

export type Scenario = { rain: number; duration: number; surge: number; clog: number }

export type RouteGeom = { coords: LonLat[]; time_s: number; length_m: number; n_edges: number }

export type SimResult = {
  scenario: Scenario
  edges: number[] // depth, cm
  buildings: number[] // depth, cm
  access: number[] // response time in 0.1 min units; 65535 = cut off
  overlay?: string
  stats: {
    roads: {
      total_km: number
      wet_km: number
      flooded_km: number
      impassable_km: number
      flooded_pct: number
      impassable_pct: number
      mean_fii: number
    }
    buildings: { total: number; wet: number; flooded: number; severe: number }
    area_km2: number
    max_depth_m: number
    access: { cut_off: number; over_15min: number; median_min: number | null; median_min_dry: number }
    hotspots: { name: string; flooded_km: number; impassable_km: number; max_depth_m: number }[]
  }
  route: {
    status: 'clear' | 'detour' | 'blocked'
    vehicle: string
    clearance_m: number
    hospital: { id: string; name: string; lon: number; lat: number }
    dest: { id: string; name: string; lon: number; lat: number }
    current: RouteGeom | null
    dry: RouteGeom | null
    blocked: LonLat[][]
    delay_s: number | null
  }
  timing_ms: { model: number; routing: number; total: number }
}

export type SimRequest = Scenario & {
  vehicle: string
  hospital: string
  dest?: string
  dest_lonlat?: LonLat
}

export type RegionInfo = { id: string; name: string; bbox: number[]; default: boolean; built: boolean }

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(path, { signal })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

export const api = {
  regions: () => getJSON<RegionInfo[]>('/api/regions'),
  meta: (region: string, signal?: AbortSignal) => getJSON<Meta>(`/api/regions/${region}/meta`, signal),
  roads: (region: string, signal?: AbortSignal) => getJSON<Roads>(`/api/regions/${region}/roads`, signal),
  buildings: (region: string, signal?: AbortSignal) => getJSON<Buildings>(`/api/regions/${region}/buildings`, signal),
  simulate: async (region: string, req: SimRequest, signal?: AbortSignal): Promise<SimResult> => {
    const r = await fetch(`/api/regions/${region}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
    if (!r.ok) throw new Error(`simulate: ${r.status} ${await r.text()}`)
    return r.json()
  },
}

const overlaps = (a: number[], b: number[]) =>
  a.length === 4 && a.every(Number.isFinite) && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

/** Region for an EarthLab zone: same id, else one overlapping its bbox, else the default. */
export function chooseRegion(regions: RegionInfo[], zoneId: string | null, zoneBBox: number[]): RegionInfo | undefined {
  const built = regions.filter((r) => r.built)
  return (
    built.find((r) => r.id === zoneId) ??
    built.find((r) => overlaps(zoneBBox, r.bbox)) ??
    built.find((r) => r.default) ??
    built[0]
  )
}

export { overlaps }

export const CUT_OFF = 65535
