import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { Droplets, Layers3, LoaderCircle, PanelLeftOpen, PanelRightOpen, Play, Square } from 'lucide-react'
import {
  api,
  chooseRegion,
  overlaps,
  type LonLat,
  type Meta,
  type RegionInfo,
  type Roads,
  type Scenario,
  type SimRequest,
  type SimResult,
} from './lib/api'
import { sameRouteSelection } from './lib/routeSelection'
import ControlPanel from './components/ControlPanel'
import ImpactPanel from './components/ImpactPanel'
import Legend from './components/Legend'
import RainOverlay from './components/RainOverlay'

type Dest = { id?: string; lonlat?: LonLat }
type Scene = {
  MapView: typeof import('./components/MapView').default
  roads: Roads
  buildings: Awaited<ReturnType<typeof api.buildings>>
}
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
  const catalog = useRef<Promise<RegionInfo[]> | null>(null)
  const [region, setRegion] = useState<string | null>(null)
  const regionRef = useRef<string | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [scene, setScene] = useState<Scene | null>(null)
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
  const [panel, setPanel] = useState<'storm' | 'impact' | 'layers' | null>(null)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const openPanel = (next: 'storm' | 'impact' | 'layers') => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPanel((current) => current === next ? null : next)
  }
  const closePanel = useCallback(() => {
    setPanel(null)
    requestAnimationFrame(() => {
      const target = returnFocus.current
      if (target?.isConnected && target !== document.body) target.focus()
      else document.getElementById('show-impact')?.focus()
    })
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!panel) return
    const timer = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('button,select,input')?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closePanel(); return }
      if (!compact || event.key !== 'Tab') return
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input,a[href],summary,[tabindex="0"]') ?? [])
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { cancelAnimationFrame(timer); document.removeEventListener('keydown', keydown) }
  }, [panel, compact, closePanel])

  // Pick the region: EarthLab's zone id, else a region overlapping its bbox, else ?region=, else the default.
  useEffect(() => {
    let active = true
    catalog.current ??= api.regions()
    catalog.current
      .then((rs) => {
        if (!active) return
        setRegions(rs)
        const byParam = rs.find((r) => r.built && r.id === REGION_PARAM)
        const pick = EARTH_ZONE_ID || EARTH_BBOX.length === 4 ? chooseRegion(rs, EARTH_ZONE_ID, EARTH_BBOX) : byParam ?? chooseRegion(rs, null, [])
        if (!pick) throw new Error('No simulation region has been built yet')
        setRegion(pick.id)
      })
      .catch((e) => { if (active) setError(String(e)) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!region) return
    const load = new AbortController()
    regionRef.current = region
    pending.current = null // a queued request carries the old region's hospital/destination ids
    playingRef.current = false
    setPlaying(null)
    setScene(null)
    setMeta(null)
    setResult(null)
    setError(null)
    const failed = (error: unknown) => {
      if (!load.signal.aborted) {
        setError(String(error))
        load.abort()
      }
    }
    // Model inputs only depend on the small catalog entry. Start the scenario
    // while the region's much larger geometry and the 3D renderer are loading.
    api.meta(region, load.signal)
      .then((meta) => {
        if (load.signal.aborted) return
        const key = INITIAL_PRESET in meta.presets ? INITIAL_PRESET : Object.keys(meta.presets)[0]
        const p = meta.presets[key]
        setPreset(key)
        setControls({ rain: p.rain, duration: p.duration, surge: p.surge, clog: p.clog })
        setHospital(meta.hospitals[0]?.id ?? '')
        setDest({ id: meta.neighborhoods[0]?.id })
        setMeta(meta)
      })
      .catch(failed)
    Promise.all([api.roads(region, load.signal), api.buildings(region, load.signal), import('./components/MapView')])
      .then(([roads, buildings, renderer]) => {
        if (!load.signal.aborted) setScene({ roads, buildings, MapView: renderer.default })
      })
      .catch(failed)
    return () => load.abort()
  }, [region])

  // Tell EarthLab the simulator is usable (clears its "Connecting to simulator…" notice).
  useEffect(() => {
    if (!EMBEDDED) return
    if (scene && meta) window.parent.postMessage({ source: 'simulator', type: 'ready' }, '*')
    else if (error) window.parent.postMessage({ source: 'simulator', type: 'status', message: error.includes('No simulation region has been built') ? 'No prepared simulator region is available' : 'Simulator API or region data could not load' }, '*')
  }, [scene, meta, error])

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
      .catch((e) => { if (regionRef.current === forRegion) setError(String(e)) })
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
    if (!meta || meta.region.id !== region || playingRef.current) return
    send({ ...controls, ...routeParams() })
  }, [meta, region, controls, routeParams, send])

  const stop = useCallback(() => {
    playingRef.current = false
    setPlaying(null)
  }, [])

  const play = useCallback(async () => {
    playingRef.current = true
    setPlaying({ k: 0, n: PLAY_FRAMES, t: 0 })
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
    returnFocus.current = document.getElementById('show-impact')
    setPanel('impact')
  }, [stop])

  const onControls = (c: Scenario) => {
    stop()
    setPreset(null)
    setControls(c)
  }
  const onPreset = (key: string) => {
    stop()
    const p = meta!.presets[key]
    setPreset(key)
    setControls({ rain: p.rain, duration: p.duration, surge: p.surge, clog: p.clog })
  }

  if (!meta || meta.region.id !== region || !scene) {
    return <Splash error={error ?? undefined} name={regions.find((r) => r.id === region)?.name} />
  }

  const { MapView, roads, buildings } = scene
  const wind = Math.min(1, (controls.surge / 3) * 0.8 + (controls.rain / 200) * 0.35)
  const p = preset ? meta.presets[preset] : null
  const redirected = EARTH_ZONE_ID ? EARTH_ZONE_ID !== meta.region.id : Boolean(EARTH_ZONE && !overlaps(EARTH_BBOX, meta.region.bbox))

  const modal = compact && panel !== null
  return (
    <div className={`sim-shell ${panel ? 'has-panel' : ''} ${EMBEDDED ? 'is-embedded' : ''}`}>
      <a className="sim-skip" href="#sim-map">Skip to map</a>
      <header className="sim-header" inert={modal}>
        {EMBEDDED ? <div className="sim-embed-title">{p ? p.label : 'Custom storm'}<span>Simulated scenario</span></div> : <div className="sim-brand"><Droplets size={25} aria-hidden="true" /><span>EarthLab</span><span className="sim-product">Houston simulator</span></div>}
        <nav aria-label="Simulator panels">
          <button type="button" aria-label="Storm controls" aria-expanded={panel === 'storm'} aria-controls="sim-panel" onClick={() => openPanel('storm')}><PanelLeftOpen size={18} aria-hidden="true" /><span>Storm controls</span></button>
          <button type="button" id="show-impact" aria-label="Impact and routing" aria-expanded={panel === 'impact'} aria-controls="sim-panel" onClick={() => openPanel('impact')}><PanelRightOpen size={18} aria-hidden="true" /><span>Impact & routing</span></button>
          <button type="button" aria-label="Map layers" aria-expanded={panel === 'layers'} aria-controls="sim-panel" onClick={() => openPanel('layers')}><Layers3 size={18} aria-hidden="true" /><span>Map layers</span></button>
        </nav>
      </header>
      <main className="sim-stage">
        <div id="sim-map" className="sim-map" tabIndex={-1} aria-label="Houston scenario map. Click to choose a starting point, or use the starting point selector in Impact and routing." inert={modal}>
          <MapView key={meta.region.id} meta={meta} roads={roads} buildings={buildings} result={deferredResult} buildingMode={buildingMode} showWater={showWater} storm={mapSeverity}
            onPick={onPick}
          />
          <RainOverlay rain={controls.rain} wind={wind} severity={severity} />
        </div>
        {(!EMBEDDED || redirected) && <div className="sim-summary" inert={modal}>
          {!EMBEDDED && regions.filter((r) => r.built).length > 1 ? (
            <select aria-label="Simulation region" value={meta.region.id} onChange={(event) => setRegion(event.target.value)}>
              {regions.filter((r) => r.built).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ) : !EMBEDDED && <h1>{meta.region.name}</h1>}
          {!EMBEDDED && <p>{p ? p.label : 'Custom storm'} <span>· Simulated scenario</span></p>}
          {redirected && (
            <p className="sim-zone-note">No prepared dataset for “{EARTH_ZONE ?? EARTH_ZONE_ID}”. Showing {meta.region.name}.</p>
          )}
        </div>}
        {modal && <button type="button" className="sim-backdrop" tabIndex={-1} aria-label="Close simulator panel" onClick={closePanel} />}
        {panel && <div ref={panelRef} id="sim-panel" className="sim-panel-host" role={compact ? 'dialog' : 'region'} aria-modal={compact || undefined} aria-labelledby={`${panel}-panel-title`}>
          {panel === 'storm' && <ControlPanel meta={meta} controls={controls} preset={preset} onControls={onControls} onPreset={onPreset} playing={playing} onPlay={play} onStop={stop} onCollapse={closePanel} embedded={EMBEDDED} />}
          {panel === 'impact' && <ImpactPanel meta={meta} result={result} vehicle={vehicle} onVehicle={setVehicle} hospital={hospital} onHospital={(id) => { stop(); setResult(null); setHospital(id) }} dest={dest} onDest={(id) => { if (id !== 'custom') { stop(); setResult(null); setDest({ id }) } }} onCollapse={closePanel} />}
          {panel === 'layers' && <Legend buildingMode={buildingMode} onBuildingMode={setBuildingMode} showWater={showWater} onShowWater={setShowWater} onCollapse={closePanel} />}
        </div>}
        {error && <div className="sim-error" role="alert">{error}</div>}
      </main>
      <footer className="sim-transport" inert={modal}>
        <button type="button" className="sim-play" onClick={playing ? stop : play} disabled={!playing && controls.rain === 0 && controls.surge === 0} aria-label={playing ? 'Stop storm playback' : 'Play storm hour by hour'}>
          {playing ? <Square size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
          <span>{playing ? 'Stop' : 'Play storm'}</span>
        </button>
        <div className="sim-time">
          <div><strong>{playing ? `T+${playing.t.toFixed(1)} h` : `${controls.duration} h scenario`}</strong><span>{controls.rain.toFixed(0)} mm/h rain · +{controls.surge.toFixed(2)} m surge</span></div>
          <progress aria-label="Storm playback progress" max={PLAY_FRAMES} value={playing?.k ?? (result ? PLAY_FRAMES : 0)} />
        </div>
        <p>Model scenario estimates<br /><span>Not operational navigation</span></p>
      </footer>
    </div>
  )
}

function Splash({ error, name }: { error?: string; name?: string }) {
  const missingData = error?.includes('No simulation region has been built')
  return (
    <main className="sim-splash">
      <div className="sim-splash-content">
        <Droplets size={32} aria-hidden="true" />
        <span>EarthLab · Houston simulator</span>
        <h1>{error ? missingData ? 'No prepared Houston dataset' : 'Simulation service unavailable' : 'Opening the Houston scene'}</h1>
        {error ? <>
          <p>{missingData ? 'The API is connected, but no simulation region has been built. Prepare or supply a Houston dataset, then retry.' : 'The simulator could not load its API or region data. Check the local service, then retry.'}</p>
          <button type="button" onClick={() => window.location.reload()}>Retry connection</button>
          <details><summary>Connection details</summary><p>{error}</p></details>
        </> : <p role="status"><LoaderCircle size={16} className="sim-spinner" aria-hidden="true" /> Loading {name ?? 'city'} roads and buildings…</p>}
      </div>
      <p className="sim-splash-credit">USDA / USGS · 2017–2021 aerial archive · Display reference only</p>
    </main>
  )
}
