import { PathStyleExtension, type PathStyleExtensionProps } from '@deck.gl/extensions'
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { LonLat } from '../lib/api'
import { directionMarks } from '../lib/floodMapGeometry'

const GROUND = { depthWriteEnabled: false, depthCompare: 'always' } as const
const STORM = [255, 193, 100, 255] as const
const RUNOFF = [173, 245, 249, 255] as const
const ARROW = {
  url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="m5 23 11-14 11 14" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  id: 'ground-direction', width: 32, height: 32, mask: true,
}
const DASH = new PathStyleExtension({ dash: true })

export function stormMapLayers(track: LonLat[], active: LonLat[], flow: LonLat[][], picking: boolean) {
  if (!track.length) return []
  const marks = [
    ...flow.flatMap(path => directionMarks(path, 650, 3).map(mark => ({ ...mark, runoff: true }))),
    ...directionMarks(track, 800, 5).map(mark => ({ ...mark, runoff: false })),
  ]
  return [
    flow.length > 0 && new PathLayer<LonLat[]>({
      id: 'runoff-casing', data: flow, getPath: p => p, getColor: [12, 44, 58, 225],
      getWidth: 4.5, widthUnits: 'pixels', jointRounded: true, parameters: GROUND,
    }),
    flow.length > 0 && new PathLayer<LonLat[]>({
      id: 'terrain-runoff', data: flow, getPath: p => p, getColor: RUNOFF,
      getWidth: 2, widthUnits: 'pixels', jointRounded: true, parameters: GROUND,
    }),
    track.length > 1 && new PathLayer<LonLat[], PathStyleExtensionProps<LonLat[]>>({
      id: 'planned-storm-track', data: [track], getPath: p => p, getColor: STORM,
      getWidth: 2.5, widthUnits: 'pixels', getDashArray: [5, 4],
      extensions: [DASH], parameters: GROUND,
    }),
    active.length > 1 && new PathLayer<LonLat[]>({
      id: 'traversed-storm-track', data: [active], getPath: p => p, getColor: STORM,
      getWidth: 3, widthUnits: 'pixels', jointRounded: true, parameters: GROUND,
    }),
    marks.length > 0 && new IconLayer({
      id: 'storm-and-runoff-arrows', data: marks, getPosition: d => d.position,
      getIcon: () => ARROW, getAngle: d => d.angle, getColor: d => d.runoff ? RUNOFF : STORM,
      getSize: d => d.runoff ? 14 : 18, billboard: false, parameters: GROUND,
    }),
    new ScatterplotLayer<LonLat>({
      id: 'storm-track-points', data: picking ? track : [track[0]],
      getPosition: p => p, getRadius: (_, { index }) => index === 0 ? 6 : 3,
      radiusUnits: 'pixels', stroked: true, getFillColor: [47, 39, 29, 255],
      getLineColor: STORM, lineWidthUnits: 'pixels', getLineWidth: 2, parameters: GROUND,
    }),
    new TextLayer<LonLat>({
      id: 'storm-origin-label', data: [track[0]], getPosition: p => p,
      getText: () => 'Storm origin', getTextAnchor: 'start', getSize: 12, getPixelOffset: [12, 10],
      getColor: STORM, fontFamily: '"Source Sans 3 Variable", sans-serif', fontWeight: 600,
      background: true, getBackgroundColor: [36, 31, 25, 235], backgroundPadding: [5, 3],
      characterSet: 'auto', parameters: GROUND,
    }),
  ]
}
