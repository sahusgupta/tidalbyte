import { MapPinned, Undo2 } from 'lucide-react'
import type { LonLat, Meta, StormEvent } from '../lib/api'

export const MAX_TRACK_POINTS = 8
export type EventSettings = Pick<StormEvent, 'kind' | 'radius_km'>

export function insideRegion([lon, lat]: LonLat, [west, south, east, north]: number[]) {
  return lon >= west && lon <= east && lat >= south && lat <= north
}

type Props = {
  meta: Meta
  event: StormEvent | null
  settings: EventSettings
  onSettings: (settings: EventSettings) => void
  onTrack: (points: LonLat[]) => void
  onDraw: () => void
}

export default function EventControls({ meta, event, settings, onSettings, onTrack, onDraw }: Props) {
  const points = event?.track ?? []
  const places = meta.neighborhoods.filter(p => insideRegion([p.lon, p.lat], meta.region.bbox))
  const origin = points[0]
  const originPlace = origin && places.find(p => p.lon === origin[0] && p.lat === origin[1])
  function usePlace(id: string, extend: boolean) {
    const p = places.find(item => item.id === id)
    if (!p) return
    const point: LonLat = [p.lon, p.lat]
    onTrack(extend ? [...points, point] : [point, ...points.slice(1)])
  }
  return <details className="storm-event">
    <summary>Event origin &amp; path <small>{event ? `${points.length} ${points.length === 1 ? 'point' : 'points'}` : 'Whole region'}</small></summary>
    <div>
      <label>Event type<select aria-label="Event type" value={settings.kind} onChange={e => onSettings({ ...settings, kind: e.target.value as StormEvent['kind'] })}>
        <option value="flood">Rain-driven flood</option><option value="hurricane">Hurricane rainfall &amp; coastal surge</option>
      </select></label>
      <label>Rain radius<select aria-label="Rain radius" value={settings.radius_km} onChange={e => onSettings({ ...settings, radius_km: Number(e.target.value) })}>
        {[0.5, 1, 2, 3, 5, 10].map(km => <option key={km} value={km}>{km} km</option>)}
      </select></label>
      <p>Rain tapers from the traveled path. Surface runoff follows the terrain. Coastal surge applies in the Ship Channel hurricane scenario.</p>
      <label>Storm origin<select aria-label="Storm origin" value={originPlace?.id ?? (origin ? 'map' : '')} onChange={e => usePlace(e.target.value, false)}>
        <option value="" disabled>Choose a place</option>
        {origin && !originPlace && <option value="map">Map point ({origin[1].toFixed(3)}, {origin[0].toFixed(3)})</option>}
        {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      {event && points.length < MAX_TRACK_POINTS && <label>Extend path through<select aria-label="Extend path through" value="" onChange={e => usePlace(e.target.value, true)}>
        <option value="" disabled>Choose the next place</option>
        {places.filter(p => p.lon !== points.at(-1)?.[0] || p.lat !== points.at(-1)?.[1]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>}
      {event && <ol aria-label="Storm path points">{points.map(([lon, lat], i) =>
        <li key={i}>{places.find(p => p.lon === lon && p.lat === lat)?.name ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`}</li>)}</ol>}
      <button type="button" onClick={onDraw}><MapPinned size={15} aria-hidden="true" />Draw a path on the map</button>
      {event && <button type="button" onClick={() => onTrack([])}><Undo2 size={14} aria-hidden="true" />Use whole region</button>}
    </div>
  </details>
}
