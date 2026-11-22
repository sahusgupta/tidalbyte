import {
  CloudSun,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  Droplets,
  Hourglass,
  PanelLeftClose,
  Play,
  Square,
  Sun,
  Tornado,
  Waves,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import type { Meta, Scenario } from '../lib/api'
import type { ReactNode } from 'react'
import { Panel, SectionTitle, Slider } from './ui'

const PRESET_ICON: Record<string, LucideIcon> = {
  clear: Sun,
  current: CloudSun,
  kingtide: Waves,
  thunderstorm: CloudLightning,
  '100yr': CloudRainWind,
  cat2: Wind,
  cat4: Tornado,
  memorial: CloudLightning,
  taxday: CloudRainWind,
  harvey: Tornado,
}

type Props = {
  eventControls: ReactNode
  meta: Meta
  weatherLabel: string
  controls: Scenario
  preset: string | null
  onControls: (c: Scenario) => void
  onPreset: (key: string) => void
  playing: { k: number; n: number; t: number } | null
  onPlay: () => void
  onStop: () => void
  onCollapse: () => void
  /** Running inside EarthLab: its top bar already names the product, so skip the brand block. */
  embedded: boolean
}

export default function ControlPanel({ meta, weatherLabel, controls, preset, onControls, onPreset, playing, onPlay, onStop, onCollapse, embedded, eventControls }: Props) {
  const set = (k: keyof Scenario) => (v: number) => onControls({ ...controls, [k]: v })
  const total = controls.rain * controls.duration
  const scenarios = Object.entries(meta.presets).filter(([key]) => key !== 'shower')
  return (
    <Panel className="storm-console">
      <header className="flex items-center gap-2.5 border-b border-white/[0.06] px-3.5 py-2.5">
        {!embedded && (
          <div className="sim-panel-symbol">
            <Droplets className="h-4 w-4 text-white" strokeWidth={2.4} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 id="storm-panel-title" className="text-[15px] font-semibold text-white">Storm controls</h2>
          <p className="text-[12px] text-slate-400">Explore a modeled weather scenario</p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
          aria-label="Collapse storm controls"
          title="Collapse"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-4 overflow-y-auto px-3.5 py-3">
        {eventControls}
        <section>
          <button type="button" className="storm-weather" onClick={() => onPreset('current')}
            aria-label="Current Weather" aria-pressed={preset === 'current'}>
            <CloudSun size={32} strokeWidth={1.35} aria-hidden="true" />
            <span>Current Weather<strong>{weatherLabel}</strong></span>
            <i aria-hidden="true" />
          </button>
          <div className="storm-table">
            <div className="storm-columns"><span>Storm presets</span><span>Rainfall</span></div>
            {scenarios.map(([key, p]) => {
              const Icon = PRESET_ICON[key] ?? CloudRain
              return <button type="button" key={key} title={p.blurb} aria-label={p.label}
                aria-pressed={preset === key} onClick={() => onPreset(key)}>
                <Icon size={16} aria-hidden="true" /><span>{p.label}</span>
                <small>{p.rain} mm/h</small>
              </button>
            })}
          </div>
        </section>

        <section>
          <SectionTitle right={<span className="font-mono text-[10.5px] text-slate-500">{preset ? 'preset' : 'custom'}</span>}>
            Scenario parameters
          </SectionTitle>
          <div className="space-y-4">
            <Slider
              icon={CloudRain}
              label="Rainfall"
              value={controls.rain}
              min={0}
              max={200}
              step={1}
              display={`${controls.rain.toFixed(0)} mm/h`}
              sub={`${(controls.rain / 25.4).toFixed(1)} in/h`}
              accent="#83b6dd"
              onChange={set('rain')}
            />
            <Slider
              icon={Hourglass}
              label="Duration"
              value={controls.duration}
              min={0.25}
              max={24}
              step={0.25}
              display={`${controls.duration.toFixed(controls.duration < 10 ? 2 : 1).replace(/\.?0+$/, '')} h`}
              sub={`${(total / 25.4).toFixed(1)} in total`}
              accent="#83b6dd"
              onChange={set('duration')}
            />
            <Slider
              icon={Waves}
              label="Sea surge"
              value={controls.surge}
              min={0}
              max={3}
              step={0.05}
              display={`+${controls.surge.toFixed(2)} m`}
              sub={`${(controls.surge * 3.281).toFixed(1)} ft`}
              accent="#6fa6b6"
              onChange={set('surge')}
            />
            <Slider
              icon={Droplets}
              label="Drain clog"
              value={controls.clog * 100}
              min={0}
              max={100}
              step={1}
              display={`${Math.round(controls.clog * 100)}%`}
              sub="capacity lost"
              accent="#9dbbd5"
              onChange={(v) => onControls({ ...controls, clog: v / 100 })}
            />
          </div>
        </section>

        <section>
          {playing ? (
            <button
              type="button"
              onClick={onStop}
              className="relative w-full overflow-hidden rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2.5 text-[13px] font-semibold text-sky-100"
            >
              <span
                className="absolute inset-y-0 left-0 bg-sky-400/20 transition-[width] duration-200"
                style={{ width: `${(playing.k / playing.n) * 100}%` }}
              />
              <span className="relative flex items-center justify-center gap-2">
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop · T+{playing.t.toFixed(1)} h
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onPlay}
              disabled={controls.rain === 0 && controls.surge === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-3 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(37,99,235,0.8)] transition hover:brightness-110 disabled:opacity-40"
            >
              <Play className="h-4 w-4 fill-current" />
              Play the storm hour by hour
            </button>
          )}
          <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
            Re-predicts {meta.counts.edges.toLocaleString()} roads and {meta.counts.buildings.toLocaleString()} buildings on every change.
          </p>
        </section>
      </div>
    </Panel>
  )
}
