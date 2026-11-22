/**
 * "Relief money": where a donation would reach the most people in need under the storm on screen.
 *
 * Census tracts (public/relief/<region>.json, built by ml/relief/build_relief.py) carry residents
 * and CDC/ATSDR Social Vulnerability Index measures. Each modeled result gives every building a
 * water depth and ambulance access from the selected hospital. Residents are assumed to be spread
 * evenly over a tract's buildings, so a tract's share of flooded buildings estimates how many of
 * its residents are in flooded homes.
 *
 * Need = residents in flooded homes (> 15 cm), plus one more for each who is also in deep water
 * (> 50 cm), lives without a car, or is 65+ / disabled and cut off from the hospital. Need is
 * weighted by vulnerability (1 - p .. 1 + p by SVI percentile) and the budget is split in
 * proportion across the highest-need places. An exploratory rule, not a needs assessment.
 */

export type ReliefTract = {
  geoid: string
  label: string
  name: string | null
  population: number
  svi: number | null
  poverty: number | null
  noVehicle: number | null
  age65: number | null
  disability: number | null
  uninsured: number | null
  limitedEnglish: number | null
  anchor: [number, number]
  outline: [number, number][][]
}
export type ReliefData = {
  version: number
  region: string
  generated: string
  sources: { name: string; detail: string; url: string }[]
  tracts: ReliefTract[]
}

export const FLOODED_CM = 15
export const DEEP_CM = 50
const CUT_OFF = 65535

/** Tract index for each building (by its first vertex); -1 when it lies outside every tract. */
export function assignBuildings(
  firstVertex: (i: number) => [number, number],
  count: number,
  tracts: Pick<ReliefTract, 'outline'>[],
): Int16Array {
  const boxes = tracts.map((t) => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
    for (const ring of t.outline) for (const [x, y] of ring) {
      if (x < w) w = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
    }
    return [w, s, e, n]
  })
  const out = new Int16Array(count).fill(-1)
  for (let i = 0; i < count; i++) {
    const [x, y] = firstVertex(i)
    for (let t = 0; t < tracts.length; t++) {
      const b = boxes[t]
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue
      if (tracts[t].outline.some((ring) => inside(x, y, ring))) {
        out[i] = t
        break
      }
    }
  }
  return out
}

function inside(x: number, y: number, ring: [number, number][]) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

export type Needs = { flooded: number; deep: number; noCar: number; cutOff: number }

/** Residents by kind of need in each tract, from one modeled result. */
export function tractNeeds(tracts: ReliefTract[], assign: Int16Array, depthCm: ArrayLike<number>, access: ArrayLike<number>): Needs[] {
  const n = new Float64Array(tracts.length)
  const flooded = new Float64Array(tracts.length)
  const deep = new Float64Array(tracts.length)
  const cut = new Float64Array(tracts.length)
  for (let i = 0; i < assign.length; i++) {
    const t = assign[i]
    if (t < 0) continue
    n[t] += 1
    const d = depthCm[i] ?? 0
    if (d > FLOODED_CM) flooded[t] += 1
    if (d > DEEP_CM) deep[t] += 1
    if (access[i] === CUT_OFF) cut[t] += 1
  }
  return tracts.map((tract, t) => {
    if (!n[t]) return { flooded: 0, deep: 0, noCar: 0, cutOff: 0 }
    const share = (count: number) => (tract.population * count) / n[t]
    const inFlood = share(flooded[t])
    return {
      flooded: inFlood,
      deep: share(deep[t]),
      noCar: inFlood * pct(tract.noVehicle),
      cutOff: share(cut[t]) * Math.min(1, pct(tract.age65) + pct(tract.disability)),
    }
  })
}

const pct = (value: number | null) => Math.max(0, value ?? 0) / 100

export const needUnits = (n: Needs) => n.flooded + n.deep + n.noCar + n.cutOff

/** 1 at priority 0; from 1 - priority (least vulnerable) to 1 + priority (most vulnerable). */
export function vulnerabilityWeight(svi: number | null, priority: number) {
  const p = Math.min(1, Math.max(0, priority))
  return 1 + p * (2 * (svi ?? 0.5) - 1)
}

/** Split `total` by `weights` in whole `unit`s, keeping the exact total (largest remainder). */
export function splitDollars(total: number, weights: number[], unit = 100): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!(total > 0) || !(sum > 0)) return weights.map(() => 0)
  const units = Math.round(total / unit)
  const exact = weights.map((w) => (w / sum) * units)
  const floors = exact.map(Math.floor)
  let left = units - floors.reduce((a, b) => a + b, 0)
  for (const [, i] of exact.map((v, i) => [v - floors[i], i] as const).sort((a, b) => b[0] - a[0])) {
    if (left-- <= 0) break
    floors[i] += 1
  }
  return floors.map((f) => f * unit)
}

export type Place = { rank: number; tract: ReliefTract; needs: Needs; dollars: number; share: number; reasons: string[] }

export function reliefPlan(tracts: ReliefTract[], needs: Needs[], budget: number, priority: number, top = 5) {
  const scored = tracts
    .map((tract, i) => ({ tract, needs: needs[i], score: vulnerabilityWeight(tract.svi, priority) * needUnits(needs[i]) }))
    .filter((r) => r.score >= 1)
    .sort((a, b) => b.score - a.score || a.tract.geoid.localeCompare(b.tract.geoid))
    .slice(0, top)
  const dollars = splitDollars(budget, scored.map((r) => r.score))
  const total = scored.reduce((a, r) => a + r.score, 0)
  const places: Place[] = scored
    .map((r, i) => ({ rank: i + 1, tract: r.tract, needs: r.needs, dollars: dollars[i], share: r.score / total, reasons: reasons(r.tract, r.needs) }))
    .filter((p) => p.dollars > 0)
  return { places, flooded: needs.reduce((a, n) => a + n.flooded, 0) }
}

/** Up to two plain-language reasons, strongest first. */
export function reasons(t: ReliefTract, n: Needs): string[] {
  const out: [number, string][] = []
  if (n.flooded >= 1 && n.deep / n.flooded >= 0.1) out.push([n.deep / n.flooded, 'homes in deep water'])
  if ((t.noVehicle ?? 0) >= 15) out.push([(t.noVehicle ?? 0) / 100, 'many households have no car'])
  if ((t.poverty ?? 0) >= 35) out.push([(t.poverty ?? 0) / 100, 'low incomes'])
  if (n.cutOff >= 25) out.push([0.3, 'older residents cut off from the hospital'])
  if ((t.uninsured ?? 0) >= 30) out.push([(t.uninsured ?? 0) / 100, 'many without health insurance'])
  return out.sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, text]) => text)
}

export const placeName = (t: ReliefTract) => t.name ?? t.label

/** "$1,250,000", "750k" or "2.5m" -> dollars; NaN when it is not an amount. */
export function parseAmount(text: string): number {
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(text.trim().toLowerCase().replace(/[$,\s]/g, ''))
  return m ? Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1) : Number.NaN
}
