import { WebMercatorViewport } from '@math.gl/web-mercator'
import type { LonLat, ViewState } from './api'

export function fitEventTrack(view: ViewState, track: LonLat[], width: number, height: number, rail: number, top: number): ViewState {
  if (!track.length || width < 150 || height < 150) return view
  const bounds = { left: 24, right: width - rail - 44, top, bottom: height - 60 }
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return view
  const camera = (v: ViewState) => new WebMercatorViewport({ ...v, width, height })
  const fits = (viewport: WebMercatorViewport) => track.every(point => {
    const [x, y] = viewport.project(point)
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
  })
  if (fits(camera(view))) return view
  const xs = track.map(p => p[0]), ys = track.map(p => p[1])
  const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const target = [(bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2]
  let next = view
  for (let zoom = view.zoom; zoom >= 6; zoom -= 0.5) {
    const centered = { ...view, longitude: center[0], latitude: center[1], zoom }
    const [longitude, latitude] = camera(centered).getMapCenterByLngLatPosition({ lngLat: center, pos: target })
    next = { ...centered, longitude, latitude }
    if (fits(camera(next))) break
  }
  return next
}
