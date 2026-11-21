import {
  CloudDrizzle,
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
import { Panel, SectionTitle, Slider } from './ui'
import { WEATHER_PRESET, MAX_SCENARIO_RAIN, rainRate, weatherTime, type WeatherPreset } from '../useWeatherPreset'
import { weatherDescription } from '../lib/currentWeather'

const PRESET_ICON: Record<string, LucideIcon> = {
  clear: Sun,
  shower: CloudDrizzle,
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
  meta: Meta
  controls: Scenario
  preset: string | null
  weather: WeatherPreset
  onControls: (c: Scenario) => void
  onPreset: (key: string) => void
  playing: { k: number; n: number; t: number } | null
  onPlay: () => void
  onStop: () => void
  onCollapse: () => void
  /** Running inside EarthLab: its top bar already names the product, so skip the brand block. */
  embedded: boolean
}

export default function ControlPanel({ meta, controls, preset, weather, onControls, onPreset, playing, onPlay, onStop, onCollapse, embedded }: Props) {
  const set = (k: keyof Scenario) => (v: number) => onControls({ ...controls, [k]: v })
  const total = controls.rain * controls.duration
  return (
    <Panel>
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
        <section>
          <SectionTitle>Storm presets</SectionTitle>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className="sim-weather-preset"
              aria-pressed={preset === WEATHER_PRESET}
              disabled={weather.loading}
              onClick={weather.refresh}
            >
              <CloudRainWind size={17} aria-hidden="true" />
              {weather.loading ? 'Getting current weather…' : weather.reading ? 'Refresh live weather' : 'Live weather'}
            </button>
            {(weather.loading || weather.reading || weather.message) && (
              <div className="sim-weather-details" role="status">
                {weather.reading && <>
                  <strong>{weatherDescription(weather.reading.weatherCode)} · {rainRate(weather.reading.rainMmPerHour)} mm/h</strong>
                  <p>{!weather.fresh || weather.message ? 'Last available estimate' : 'Weather estimate'} for {meta.region.name} · <time dateTime={new Date(weather.reading.validAt).toISOString()}>{weatherTime(weather.reading)}</time></p>
                  <p>{[
                    weather.reading.temperatureC !== null && `${weather.reading.temperatureC} °C`,
                    weather.reading.windKph !== null && `Wind ${weather.reading.windKph} km/h`,
                  ].filter(Boolean).join(' · ')}</p>
                  <p>Simulates one hour at this rain rate with 0 m added surge and 10% drain capacity loss.</p>
                  <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · Refreshes every 15 min
                </>}
                {weather.loading && <p>Requesting weather for the center of {meta.region.name}.</p>}
                {weather.message && <p>Weather update unavailable. {weather.message} {weather.reading ? 'Showing the last applied scenario.' : 'The previous scenario is still selected.'}</p>}
              </div>
            )}
            {Object.entries(meta.presets).map(([key, p]) => {
              const Icon = PRESET_ICON[key] ?? CloudRain
              const active = preset === key
              const extreme = key === 'cat4' || key === 'harvey'
              return (
                <button
                  key={key}
                  type="button"
                  title={p.blurb}
                  aria-pressed={active}
                  onClick={() => onPreset(key)}
                  className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11.5px] font-medium transition-all ${
                    extreme ? 'col-span-2' : ''
                  } ${
                    active
                      ? extreme
                        ? 'border-rose-400/60 bg-rose-500/15 text-white shadow-[0_0_20px_-6px_rgba(244,63,94,0.7)]'
                        : 'border-sky-400/60 bg-sky-400/10 text-white shadow-[0_0_20px_-8px_rgba(56,189,248,0.8)]'
                      : 'border-white/[0.06] bg-white/[0.02] text-slate-300 hover:border-white/15 hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? (extreme ? 'text-rose-300' : 'text-sky-300') : 'text-slate-500 group-hover:text-slate-300'}`}
                  />
                  <span className="leading-tight">{p.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <SectionTitle right={<span className="font-mono text-[10.5px] text-slate-500">{preset === WEATHER_PRESET ? 'weather input' : preset ? 'preset' : 'custom'}</span>}>
            Scenario parameters
          </SectionTitle>
          <div className="space-y-4">
            <Slider
              icon={CloudRain}
              label="Rainfall"
              value={controls.rain}
              min={0}
              max={MAX_SCENARIO_RAIN}
              step={1}
              display={`${rainRate(controls.rain)} mm/h`}
              sub={`${(controls.rain / 25.4).toFixed(1)} in/h`}
              accent="#d99a43"
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
              accent="#d99a43"
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
              accent="#f59e0b"
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
              disabled={preset !== WEATHER_PRESET && controls.rain === 0 && controls.surge === 0}
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
