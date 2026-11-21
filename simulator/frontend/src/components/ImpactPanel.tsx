import { useState } from 'react'
import {
  Ambulance,
  Ban,
  Brain,
  Building2,
  Car,
  ChevronDown,
  Hospital,
  MapPin,
  MousePointerClick,
  PanelRightClose,
  Route,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Truck,
  Waves,
} from 'lucide-react'
import type { LonLat, Meta, SimResult } from '../lib/api'
import { Kpi, Panel, SectionTitle, Segmented, Select } from './ui'

type Props = {
  meta: Meta
  result: SimResult | null
  vehicle: string
  onVehicle: (v: string) => void
  hospital: string
  onHospital: (v: string) => void
  dest: { id?: string; lonlat?: LonLat }
  onDest: (id: string) => void
  onCollapse: () => void
}

const fmtMin = (s: number) => `${(s / 60).toFixed(1)} min`
const fmtKm = (m: number) => `${(m / 1000).toFixed(1)} km`

export default function ImpactPanel({ meta, result, vehicle, onVehicle, hospital, onHospital, dest, onDest, onCollapse }: Props) {
  const s = result?.stats
  const r = result?.route
  const vehLabel = meta.vehicles[vehicle]?.label.toLowerCase() ?? vehicle
  return (
    <Panel>
      <header className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2.5">
        <h2 id="impact-panel-title" className="text-[15px] font-semibold text-white">Impact &amp; routing</h2>
        <button
          type="button"
          onClick={onCollapse}
          className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
          aria-label="Collapse impact panel"
          title="Collapse"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </header>
      <div className="space-y-4 overflow-y-auto px-3.5 py-3">
        <section>
          <SectionTitle icon={Waves}>Scenario impact</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Kpi
              icon={Waves}
              label="Roads flooded"
              tone={s && s.roads.flooded_pct > 5 ? 'water' : 'neutral'}
              value={s ? s.roads.flooded_km.toFixed(0) : '–'}
              unit="km"
              sub={s ? `${s.roads.flooded_pct}% of ${s.roads.total_km.toFixed(0)} km, >15 cm` : ' '}
            />
            <Kpi
              icon={Ban}
              label={`Closed to ${vehicle === 'sedan' ? 'cars' : vehicle === 'truck' ? 'trucks' : 'ambulances'}`}
              tone={s && s.roads.impassable_km > 0.5 ? 'danger' : 'neutral'}
              value={s ? s.roads.impassable_km.toFixed(1) : '–'}
              unit="km"
              sub={s ? `${s.roads.impassable_pct}% of network` : ' '}
            />
            <Kpi
              icon={Building2}
              label="Buildings flooded"
              tone={s && s.buildings.flooded > 0 ? 'water' : 'neutral'}
              value={s ? s.buildings.flooded.toLocaleString() : '–'}
              sub={s ? `${s.buildings.severe.toLocaleString()} with >50 cm` : ' '}
            />
            <Kpi
              icon={Siren}
              label="Cut off from ER"
              tone={s && s.access.cut_off > 0 ? 'danger' : 'neutral'}
              value={s ? s.access.cut_off.toLocaleString() : '–'}
              unit="bldgs"
              sub={
                s && s.access.median_min !== null
                  ? `median response ${s.access.median_min} min (dry ${s.access.median_min_dry})`
                  : ' '
              }
            />
          </div>
          {s && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-white/[0.025] px-3 py-1.5 font-mono text-[11px] text-slate-400">
              <span>
                flooded area <span className="text-slate-200">{s.area_km2} km²</span>
              </span>
              <span>
                max depth <span className="text-slate-200">{s.max_depth_m} m</span>
              </span>
            </div>
          )}
        </section>

        <section>
          <SectionTitle icon={Route}>Modeled route</SectionTitle>
          <div className="space-y-2">
            <p className="px-1 text-[12px] font-semibold text-cyan-200">From · Starting point</p>
            <Select icon={MapPin} label="Starting point" value={dest.id ?? 'custom'} onChange={onDest}>
              {dest.lonlat && (
                <option value="custom" className="bg-slate-900">
                  Dropped pin ({dest.lonlat[1].toFixed(4)}, {dest.lonlat[0].toFixed(4)})
                </option>
              )}
              {meta.neighborhoods.map((n) => (
                <option key={n.id} value={n.id} className="bg-slate-900">
                  {n.name}
                </option>
              ))}
            </Select>
            <p className="px-1 text-[12px] font-semibold text-rose-200">To · Destination hospital</p>
            <Select icon={Hospital} label="Destination hospital" value={hospital} onChange={onHospital}>
              {meta.hospitals.map((h) => (
                <option key={h.id} value={h.id} className="bg-slate-900">
                  {h.name}
                </option>
              ))}
            </Select>
            <p className="flex items-center gap-1.5 px-1 text-[11px] text-slate-500">
              <MousePointerClick className="h-3.5 w-3.5" /> Drop a starting pin; we calculate the fastest available route to your selected hospital.
            </p>
            <Segmented
              value={vehicle}
              onChange={onVehicle}
              options={[
                { value: 'sedan', label: 'Car', icon: Car, hint: '15 cm' },
                { value: 'ambulance', label: 'Ambulance', icon: Ambulance, hint: '30 cm' },
                { value: 'truck', label: 'Rescue', icon: Truck, hint: '75 cm' },
              ]}
            />
            {r ? <RouteStatus r={r} vehLabel={vehLabel} /> : <p role="status" className="px-1 text-[12px] text-emerald-200">Calculating route and estimated travel time…</p>}
          </div>
        </section>

        {s && s.hotspots.length > 0 && (
          <section>
            <SectionTitle icon={TriangleAlert}>Worst-hit streets</SectionTitle>
            <ul className="space-y-1.5">
              {s.hotspots.map((h) => {
                const maxKm = s.hotspots[0].flooded_km || 1
                return (
                  <li key={h.name} className="text-[12px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-slate-200">{h.name}</span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-400">
                        {h.flooded_km.toFixed(1)} km · {Math.round(h.max_depth_m * 100)} cm
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-sky-500/70" style={{ width: `${(h.flooded_km / maxKm) * 100}%` }}>
                        <div
                          className="h-full rounded-full bg-rose-500"
                          style={{ width: `${(h.impassable_km / Math.max(h.flooded_km, 1e-6)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <ModelCard meta={meta} result={result} />
      </div>
    </Panel>
  )
}

function RouteStatus({ r, vehLabel }: { r: NonNullable<SimResult['route']>; vehLabel: string }) {
  if (r.status === 'blocked') {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-rose-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
          No available modeled route
        </div>
        <p className="mt-1 text-[12px] leading-snug text-rose-100/80">
          {r.dest.name} is cut off from {r.hospital.name.split(' (')[0]} for an {vehLabel}.{' '}
          {r.blocked.length > 0 && `${r.blocked.length} segments of the usual route are under water.`}
        </p>
        {r.dry && <p className="mt-1.5 font-mono text-[11px] text-rose-200/60">dry-weather trip: {fmtMin(r.dry.time_s)}</p>}
      </div>
    )
  }
  const cur = r.current!
  const detour = r.status === 'detour'
  return (
    <div
      className={`rounded-xl border p-3 ${detour ? 'border-amber-400/40 bg-amber-400/10' : 'border-emerald-400/30 bg-emerald-400/[0.07]'}`}
    >
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-2 text-[13px] font-semibold ${detour ? 'text-amber-200' : 'text-emerald-200'}`}>
          {detour ? <TriangleAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          {detour ? 'Fastest available detour' : 'Fastest available route'}
        </span>
        <span className="font-mono text-[15px] font-semibold tabular-nums text-white">{fmtMin(cur.time_s)} est.</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-slate-300"><dt className="font-semibold text-cyan-200">From</dt><dd>{r.dest.name}</dd><dt className="font-semibold text-rose-200">To</dt><dd>{r.hospital.name}</dd></dl>
      <p className="mt-1 text-[10px] text-slate-400">Scenario estimate; excludes live traffic and assumes two-way travel.</p>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400">
        <span>{fmtKm(cur.length_m)}</span>
        {r.dry && (
          <span>
            dry {fmtMin(r.dry.time_s)} ·{' '}
            <span className={r.delay_s && r.delay_s > 20 ? 'text-amber-300' : ''}>+{((r.delay_s ?? 0) / 60).toFixed(1)} min</span>
          </span>
        )}
      </div>
      {detour && r.blocked.length > 0 && (
        <p className="mt-1 text-[11.5px] text-amber-100/70">Avoiding {r.blocked.length} flooded segments of the usual route.</p>
      )}
    </div>
  )
}

function ModelCard({ meta, result }: { meta: Meta; result: SimResult | null }) {
  const [open, setOpen] = useState(false)
  const m = meta.model
  const f1 = m.classification.find((c) => c.threshold_m === 0.3)?.f1 ?? 0
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-200">
          <Brain className="h-4 w-4 text-violet-300" />
          Inference engine
        </span>
        <span className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          {result && <span className="text-emerald-300">{Math.round(result.timing_ms.total)} ms</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div className="grid grid-cols-4 gap-1 border-t border-white/[0.05] px-3 py-2 text-center">
        {[
          ['R²', m.r2.toFixed(3)],
          ['MAE', `${m.mae_cm} cm`],
          ['F1@30cm', f1.toFixed(3)],
          ['trees', String(m.n_trees)],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="font-mono text-[12px] font-semibold text-slate-100">{v}</div>
            <div className="text-[10px] text-slate-500">{k}</div>
          </div>
        ))}
      </div>
      {open && (
        <div className="space-y-3 border-t border-white/[0.05] px-3 py-3 text-[11.5px] leading-relaxed text-slate-400">
          <p>
            <span className="text-slate-200">XGBoost surrogate</span> predicting water depth at the lowest point of every
            road segment, building footprint and 17 m ground cell. Trained on {(m.n_train_rows / 1e6).toFixed(1)}M samples
            from {m.n_train_storms} simulated storms ({m.teacher}); scored on {m.n_val_storms} held-out storms.
          </p>
          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">What drives the prediction</div>
            <div className="space-y-1">
              {m.importance.slice(0, 7).map((f) => (
                <div key={f.feature} className="flex items-center gap-2">
                  <span className="w-[132px] shrink-0 truncate text-slate-300">{f.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-violet-400/80" style={{ width: `${Math.max(2, Math.sqrt(f.share) * 100)}%` }} />
                  </div>
                  <span className="w-9 text-right font-mono text-[10.5px] tabular-nums">{(f.share * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10.5px] text-slate-500">
            Terrain: USGS 3DEP lidar DEM → depression filling, flow accumulation, TWI, HAND, sea-connectivity. Roads &
            buildings: Overture Maps (OpenStreetMap). Routing: NetworkX A* + SciPy Dijkstra. {meta.counts.road_km} km of road,{' '}
            {meta.counts.nodes.toLocaleString()} intersections.
          </p>
          {result && (
            <p className="font-mono text-[10.5px] text-slate-500">
              last run: model {result.timing_ms.model} ms · routing {result.timing_ms.routing} ms
            </p>
          )}
        </div>
      )}
    </section>
  )
}
