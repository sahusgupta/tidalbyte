import type { LonLat, SimRequest } from './api'

export type Phase = 'mitigation' | 'response'
export type StrategyID = 'independent' | 'coordinated' | 'bargaining'
export type Outcome = { delay_minutes: number; cut_off: number; blocked_km: number; impaired_km: number }
export type Measurements = {
  phase: Phase
  offset_cm: number
  corridors: { name: string; length_m: number; center: LonLat; nearby?: string | null }[]
  outcomes: Outcome[]
}
export type Settings = {
  budget: number
  crews: number
  health_budget: number
  works_budget: number
  health_access_priority: number
  works_access_priority: number
  information: 'field_reports' | 'full_model'
}
export const defaults: Settings = {
  budget: 36, crews: 2, health_budget: 24, works_budget: 24,
  health_access_priority: 85, works_access_priority: 20, information: 'field_reports',
}

export type Strategy = {
  id: StrategyID; funded: { agency: string; corridor: number; cost: number }[]
  spend: number; crews: number; outcome: Outcome; utilities: number[]
}

export type Comparison = { strategies: Strategy[]; agreement: boolean; equilibrium_verified: boolean }

async function post<T>(path: string, value: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal,
  })
  if (!response.ok) throw new Error(`Planning request failed (${response.status})`)
  return response.json()
}

export function assess(regionId: string, scenario: SimRequest, phase: Phase, signal: AbortSignal) {
  return post<Measurements>(`/api/regions/${encodeURIComponent(regionId)}/adaptation`, { scenario, phase }, signal)
}

export async function compare(measurements: Measurements, settings: Settings, signal: AbortSignal) {
  const response = await post<{ data: Comparison }>('/api/v1/allocation/storm/compare', { measurements, ...settings }, signal)
  return response.data
}
