import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { Droplets, LoaderCircle, PanelLeftOpen, PanelRightOpen } from 'lucide-react'
import {
  api,
  chooseRegion,
  overlaps,
  type Buildings,
  type LonLat,
  type Meta,
  type RegionInfo,
  type Roads,
  type Scenario,
  type SimRequest,
  type SimResult,
} from './lib/api'
import MapView from './components/MapView'
import { sameRouteSelection } from './lib/routeSelection'
import ControlPanel from './components/ControlPanel'
import ImpactPanel from './components/ImpactPanel'
import Legend from './components/Legend'
import RainOverlay from './components/RainOverlay'

type Dest = { id?: string; lonlat?: LonLat }
const INITIAL_PRESET = 'thunderstorm'
const PLAY_FRAMES = 24

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const smooth = (x: number) => x * x * (3 - 2 * x)

/** Running inside EarthLab's simulator host (an iframe). */
const EMBEDDED = window.self !== window.top
/** Zone EarthLab handed over in the query string (see EarthLab's simulator contract). */
const query = new URLSearchParams(window.location.search)
const EARTH_ZONE = query.get('name')
const EARTH_ZONE_ID = query.get('zone')
const EARTH_BBOX = (query.get('bbox') ?? '').split(',').map(Number)
/** Standalone deep link: ?region=<id>. */
const REGION_PARAM = query.get('region')

export default function App() {
  const [regions, setRegions] = useState<RegionInfo[]>([])
  const [region, setRegion] = useState<string | null>(null)
  const regionRef = useRef<string | null>(null)
  const [data, setData] = useState<{ meta: Meta; roads: Roads; buildings: Buildings } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [controls, setControls] = useState<Scenario>({ rain: 0, duration: 1, surge: 0, clog: 0.1 })
  const [preset, setPreset] = useState<string | null>(INITIAL_PRESET)
  const [vehicle, setVehicle] = useState('ambulance')
  const [hospital, setHospital] = useState('')
  const [dest, setDest] = useState<Dest>({})
  const [buildingMode, setBuildingMode] = useState<'flood' | 'access'>('flood')
  const [showWater, setShowWater] = useState(true)
  const [result, setResult] = useState<SimResult | null>(null)
  const [playing, setPlaying] = useState<{ k: number; n: number; t: number } | null>(null)
  const playingRef = useRef(false)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  // Pick the region: EarthLab's zone id, else a region overlapping its bbox, else ?region=, else the default.
  useEffect(() => {
    api
      .regions()
      .then((rs) => {
        setRegions(rs)
        const byParam = rs.find((r) => r.built && r.id === REGION_PARAM)
        const pick = EARTH_ZONE_ID || EARTH_BBOX.length === 4 ? chooseRegion(rs, EARTH_ZONE_ID, EARTH_BBOX) : byParam ?? chooseRegion(rs, null, [])
        if (!pick) throw new Error('No simulation region has been built yet')
        setRegion(pick.id)
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!region) return
    let live = true
    regionRef.current = region
    pending.current = null // a queued request carries the old region's hospital/destination ids
    playingRef.current = false
    setPlaying(null)
    setData(null)
    setResult(null)
    setError(null)
    Promise.all([api.meta(region), api.roads(region), api.buildings(region)])
      .then(([meta, roads, buildings]) => {
        if (!live) return
        const key = INITIAL_PRESET in meta.presets ? INITIAL_PRESET : Object.keys(meta.presets)[0]
        const p = meta.presets[key]
        setPreset(key)
        setControls({ rain: p.rain, duration: p.duration, surge: p.surge, clog: p.clog })
        setHospital(meta.hospitals[0]?.id ?? '')
        setDest({ id: meta.neighborhoods[0]?.id })
        setData({ meta, roads, buildings })
      })
      .catch((e) => live && setError(String(e)))
    return () => {
      live = false
    }
  }, [region])

  // Tell EarthLab the simulator is usable (clears its "Connecting to simulator…" notice).
  useEffect(() => {
    if (!EMBEDDED) return
    if (data) window.parent.postMessage({ source: 'simulator', type: 'ready' }, '*')
    else if (error) window.parent.postMessage({ source: 'simulator', type: 'status', message: 'Simulator API unreachable' }, '*')
  }, [data, error])

  // Stream completed scenario results while dragging; retain only the newest queued request.
  const inflight = useRef(false)
  const pending = useRef<SimRequest | null>(null)
  const send = useCallback((req: SimRequest) => {
    if (inflight.current) {
      pending.current = req
      return
    }
    const forRegion = regionRef.current
    if (!forRegion) return
    inflight.current = true
    api
      .simulate(forRegion, req)
      .then((r) => {
        // A newer storm value must not starve rendering during continuous dragging.
        // A changed route endpoint/vehicle must still discard the old route.
        if (!playingRef.current && regionRef.current === forRegion &&
            (!pending.current || sameRouteSelection(req, pending.current))) setResult(r)
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        inflight.current = false
        const next = pending.current
        pending.current = null
        if (next && !playingRef.current) send(next)
      })
  }, [])

  const routeParams = useCallback(
    () => ({ vehicle, hospital, ...(dest.lonlat ? { dest_lonlat: dest.lonlat } : { dest: dest.id }) }),
    [vehicle, hospital, dest],
  )

  useEffect(() => {
    if (!data || playingRef.current) return
    send({ ...controls, ...routeParams() })
  }, [data, controls, routeParams, send])

  const stop = useCallback(() => {
    playingRef.current = false
    setPlaying(null)
  }, [])

  const play = useCallback(async () => {
    playingRef.current = true
    const params = routeParams()
    const forRegion = regionRef.current!
    for (let k = 1; k <= PLAY_FRAMES && playingRef.current; k++) {
      const f = k / PLAY_FRAMES
      const sc = {
        rain: controls.rain,
        duration: Math.max(0.1, controls.duration * f),
        surge: controls.surge * smooth(Math.min(1, f * 1.3)),
        clog: controls.clog,
      }
      const t0 = performance.now()
      try {
        const r = await api.simulate(forRegion, { ...sc, ...params })
        if (!playingRef.current || regionRef.current !== forRegion) break
        setResult(r)
        setPlaying({ k, n: PLAY_FRAMES, t: sc.duration })
      } catch (e) {
        setError(String(e))
        break
      }
      await sleep(Math.max(0, 260 - (performance.now() - t0)))
    }
    playingRef.current = false
    setPlaying(null)
  }, [controls, routeParams])

  // Keep input urgent; expensive map updates can yield while the slider moves.
  const deferredResult = useDeferredValue(result)
  const severity = Math.min(1, controls.rain / 170 + (controls.surge / 3) * 0.6) * 0.85
  const mapSeverity = useDeferredValue(severity)
  const onPick = useCallback((lonlat: LonLat) => {
    stop()
    setResult(null)
    setDest({ lonlat })
    setRightOpen(true)
  }, [stop])

  const onControls = (c: Scenario) => {
    stop()
    setPreset(null)
    setControls(c)
  }
  const onPreset = (key: string) => {
    stop()
    const p = data!.meta.presets[key]
    setPreset(key)
    setControls({ rain: p.rain, duration: p.duration, surge: p.surge, clog: p.clog })
  }

  if (error && !data) return <Splash error={error} />
  if (!data) return <Splash name={regions.find((r) => r.id === region)?.name} />

  const { meta, roads, buildings } = data
  const wind = Math.min(1, (controls.surge / 3) * 0.8 + (controls.rain / 200) * 0.35)
  const p = preset ? meta.presets[preset] : null

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05080f]">
      <MapView
        key={meta.region.id}
        meta={meta}
        roads={roads}
        buildings={buildings}
        result={deferredResult}
        buildingMode={buildingMode}
        showWater={showWater}
        storm={mapSeverity}
        onPick={onPick}
      />
      <RainOverlay rain={controls.rain} wind={wind} severity={severity} />

      <div className="pointer-events-none absolute inset-0 flex justify-between gap-3 p-3">
        <div className="flex max-h-full flex-col">
          {leftOpen ? (
            <ControlPanel
              meta={meta}
              controls={controls}
              preset={preset}
              onControls={onControls}
              onPreset={onPreset}
              playing={playing}
              onPlay={play}
              onStop={stop}
              onCollapse={() => setLeftOpen(false)}
              embedded={EMBEDDED}
            />
          ) : (
            <Rail side="left" label="Storm controls" onClick={() => setLeftOpen(true)} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-between">
          <div className="pointer-events-auto max-w-[460px] rounded-xl border border-white/[0.08] bg-[#0a1120]/80 px-3 py-1.5 text-center shadow-lg backdrop-blur-xl">
            <div className="flex items-center justify-center gap-2 text-[12px] font-semibold text-white">
              {playing && <span className="font-mono text-sky-300">T+{playing.t.toFixed(1)}h</span>}
              {p ? p.label : 'Custom storm'}
              <span className="font-normal text-slate-500">·</span>
              <span className="font-normal text-slate-400">{meta.region.name}</span>
            </div>
            {!EMBEDDED && regions.filter((r) => r.built).length > 1 && (
              <select
                aria-label="Simulation region"
                value={meta.region.id}
                onChange={(e) => setRegion(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] text-slate-200 outline-none focus:border-sky-400/60"
              >
                {regions
                  .filter((r) => r.built)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            )}
            <div className="mt-0.5 text-[11px] text-slate-400">
              {p
                ? p.blurb
                : `${controls.rain.toFixed(0)} mm/h for ${controls.duration} h, +${controls.surge.toFixed(2)} m surge, ${Math.round(controls.clog * 100)}% drains clogged`}
            </div>
            {EARTH_ZONE && EARTH_ZONE_ID !== meta.region.id && !overlaps(EARTH_BBOX, meta.region.bbox) && (
              <div className="mt-1 border-t border-white/[0.06] pt-1 text-[11px] text-amber-300">
                “{EARTH_ZONE}” is outside this simulator&apos;s data · showing {meta.region.name.split(':')[0]}
              </div>
            )}
          </div>
          <Legend
            buildingMode={buildingMode}
            onBuildingMode={setBuildingMode}
            showWater={showWater}
            onShowWater={setShowWater}
          />
        </div>

        <div className="flex max-h-full flex-col items-end">
          {rightOpen ? (
            <ImpactPanel
              meta={meta}
              result={result}
              vehicle={vehicle}
              onVehicle={setVehicle}
              hospital={hospital}
              onHospital={(id) => { stop(); setResult(null); setHospital(id) }}
              dest={dest}
              onDest={(id) => { if (id !== 'custom') { stop(); setResult(null); setDest({ id }) } }}
              onCollapse={() => setRightOpen(false)}
            />
          ) : (
            <Rail side="right" label="Impact" onClick={() => setRightOpen(true)} />
          )}
        </div>
      </div>

      {error && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-lg border border-rose-500/40 bg-rose-950/90 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}
    </div>
  )
}

function Rail({ side, label, onClick }: { side: 'left' | 'right'; label: string; onClick: () => void }) {
  const Icon = side === 'left' ? PanelLeftOpen : PanelRightOpen
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${label}`}
      className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0a1120]/85 px-2.5 py-2 text-[12px] font-medium text-slate-200 shadow-lg backdrop-blur-xl hover:text-white"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function Splash({ error, name }: { error?: string; name?: string }) {
  return (
    <div className="grid h-full place-items-center bg-[#05080f] text-slate-300">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600">
          <Droplets className="h-6 w-6 text-white" />
        </div>
        <div className="text-[15px] font-semibold text-white">AquaGrid AI</div>
        {error ? (
          <div className="max-w-md text-center text-[12px] text-rose-300">
            Could not reach the simulation API. Is the backend running on :8000?
            <div className="mt-1 font-mono text-[11px] text-rose-400/80">{error}</div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Loading {name ?? 'city'} roads and buildings…
          </div>
        )}
      </div>
    </div>
  )
}
