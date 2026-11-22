import { useEffect, useRef, useState } from 'react'
import type { SimRequest } from '../lib/api'
import { assess, compare, defaults, type Comparison, type Measurements, type Phase, type Settings, type StrategyID } from '../lib/stormPlanning'
import './stormPlanning.css'

const names: Record<StrategyID, string> = {
  independent: 'Independent', coordinated: 'Coordinated', bargaining: 'Nash bargaining',
}
const counts = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const km = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Amount({ label, value, max = 100, onChange }: {
  label: string; value: number; max?: number; onChange: (value: number) => void
}) {
  return <label>{label}<input type="number" inputMode="numeric" min={0} max={max} step={1} value={value}
    onChange={e => onChange(Math.min(max, Math.max(0, Math.trunc(Number(e.target.value)) || 0)))} /></label>
}

export default function StormPlanning({ regionId, request }: { regionId: string; request: SimRequest | null }) {
  const [phase, setPhase] = useState<Phase>('mitigation')
  const [settings, setSettings] = useState<Settings>(defaults)
  const [selected, setSelected] = useState<StrategyID>('coordinated')
  const [solved, setSolved] = useState<{ key: string; measurements: Measurements; comparison: Comparison } | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const cache = useRef<{ key: string; value: Measurements } | null>(null)
  const active = useRef<AbortController | null>(null)
  const measurementKey = JSON.stringify([regionId, phase, request])
  const key = JSON.stringify([measurementKey, settings])
  useEffect(() => () => active.current?.abort(), [key])
  const update = <K extends keyof Settings>(field: K, value: Settings[K]) =>
    setSettings(previous => ({ ...previous, [field]: value }))

  async function run() {
    if (!request) return
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setPending(key)
    setFailed(null)
    try {
      const measurements = cache.current?.key === measurementKey ? cache.current.value :
        await assess(regionId, request, phase, controller.signal)
      if (controller.signal.aborted) return
      cache.current = { key: measurementKey, value: measurements }
      const comparison = await compare(measurements, settings, controller.signal)
      if (!controller.signal.aborted) setSolved({ key, measurements, comparison })
    } catch {
      if (!controller.signal.aborted) setFailed({ key, message: 'Planning could not connect. Check the local flood and allocation services and try again.' })
    } finally {
      if (active.current === controller) { active.current = null; setPending(null) }
    }
  }

  const result = solved?.key === key ? solved : null
  const plan = result?.comparison.strategies.find(strategy => strategy.id === selected)
  const before = result?.measurements.outcomes[0]
  return <details className="storm-planning">
    <summary>Plan infrastructure improvements</summary>
    <div className="planning-body">
      <label>Planning phase
        <select value={phase} onChange={e => setPhase(e.target.value as Phase)}>
          <option value="mitigation">Before the storm · improve drainage</option>
          <option value="response">After flooding · stage pumps</option>
        </select>
      </label>
      <details><summary>Budget, crews and agency priorities</summary>
        <div className="planning-inputs">
          <Amount label="Shared budget (units)" value={settings.budget} onChange={v => update('budget', v)} />
          <Amount label="Available crews" value={settings.crews} max={3} onChange={v => update('crews', v)} />
          <Amount label="Health budget" value={settings.health_budget} onChange={v => update('health_budget', v)} />
          <Amount label="Public works budget" value={settings.works_budget} onChange={v => update('works_budget', v)} />
        </div>
        <p>Each agency splits 100 priority points between hospital access and road mobility.</p>
        <div className="planning-inputs">
          <Amount label="Health points for access" value={settings.health_access_priority} onChange={v => update('health_access_priority', v)} />
          <Amount label="Works points for access" value={settings.works_access_priority} onChange={v => update('works_access_priority', v)} />
        </div>
        <label>Information available
          <select value={settings.information} onChange={e => update('information', e.target.value as Settings['information'])}>
            <option value="field_reports">Rounded field reports</option>
            <option value="full_model">Full simulation estimates</option>
          </select>
        </label>
      </details>
      <button className="planning-run" type="button" onClick={run} disabled={!request || pending === key}>
        {pending === key ? 'Comparing plans…' : 'Compare agency plans'}
      </button>
      {!request && <p>Pause playback and wait for the storm result to compare plans.</p>}
      {failed?.key === key && <p role="alert">{failed.message}</p>}
      {result && plan && before && <div className="planning-result">
        <label>Agency strategy
          <select value={selected} onChange={e => setSelected(e.target.value as StrategyID)}>
            {Object.entries(names).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <p>{selected === 'independent' ? (result.comparison.equilibrium_verified ?
          'Neither agency can improve its score by reallocating on its own.' : 'The closest independent outcome still admits a better unilateral choice.') :
          selected === 'coordinated' ? 'The agencies choose the highest combined score within their limits.' :
          result.comparison.agreement ? 'Both agencies improve their scores by accepting this agreement.' :
          'No alternative improves both agency scores. The independent plan stands.'}</p>
        {plan.funded.length ? <ul className="planning-actions">{plan.funded.map(action => {
          const site = result.measurements.corridors[action.corridor]
          return <li key={site.name}><strong>{phase === 'mitigation' ? 'Improve drainage' : 'Stage pumping'} · {site.name}</strong>
            <span>{action.agency} · {site.length_m.toLocaleString()} m of roadway · {action.cost} units</span>
            <span>{site.nearby ? `Near ${site.nearby}` : `Near ${site.center[1].toFixed(4)}°, ${site.center[0].toFixed(4)}°`}</span></li>
        })}</ul> : <p>{result.measurements.corridors.length ?
          'Hold resources. No affordable project improves this strategy’s score enough to cover its cost.' :
          'No named road has modeled travel impairment in this event. Hold resources.'}</p>}
        <table><caption>Service impact with the selected vehicle</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col">No work</th><th scope="col">With plan</th></tr></thead>
          <tbody>
            <tr><th scope="row">Blocked roads (km)</th><td>{km(before.blocked_km)}</td><td>{km(plan.outcome.blocked_km)}</td></tr>
            <tr><th scope="row">Cut-off buildings</th><td>{counts.format(before.cut_off)}</td><td>{counts.format(plan.outcome.cut_off)}</td></tr>
            <tr><th scope="row">Building-delay minutes</th><td>{counts.format(before.delay_minutes)}</td><td>{counts.format(plan.outcome.delay_minutes)}</td></tr>
          </tbody>
        </table>
        <p>{plan.spend} of {settings.budget} budget units · {plan.crews} of {settings.crews} crews</p>
        <details><summary>How this comparison works</summary>
          <p>We screen the three named roads with the greatest modeled loss of travel speed weighted by length. Each project treats wet segments near one point on that road. Routing is recalculated for every combination, using this storm, vehicle and hospital.</p>
          <p>Each treatment assumes {result.measurements.offset_cm} cm less water over its road surface and uses one crew. Regional water movement and building depths stay fixed. Project costs and effects are illustrative.</p>
          <p>Hospital delay is extra travel time summed over buildings reachable in dry weather, capped at 30 minutes per building. Road mobility measures the length-weighted loss of travel speed. Both goals are scored against the improvement available from funding all candidate projects, less 0.1 point per budget unit spent by the agency.</p>
          <p>Field reports round total delay to 50 building-minutes and lost mobility to 0.1 km before agencies choose. The table uses the paired network simulations at full precision.</p>
        </details>
      </div>}
    </div>
  </details>
}
