import { useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import {
  BitmapLayer,
  IconLayer,
  PathLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
  TextLayer,
} from '@deck.gl/layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import { AmbientLight, DirectionalLight, LightingEffect, type PickingInfo } from '@deck.gl/core'
import { Map } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl'

// maplibre-gl 6 resolves its worker relative to its own module, which breaks under Vite's dependency
// pre-bundling. The worker files are copied to /maplibre/ by the plugin in vite.config.ts.
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

import { CUT_OFF, type Buildings, type LonLat, type Meta, type Roads, type SimResult } from '../lib/api'
import { accessColor, buildingFloodColor, roadColor } from '../lib/colors'

// Ground: USGS The National Map orthoimagery (public domain, no key; ~2 m/px over the US at z16).
// Toned down so flood depth, routes and closures stay readable on top of it.
const BASEMAP: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 16,
      attribution:
        'Imagery: <a href="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer" target="_blank" rel="noopener">USDA / USGS The National Map</a>',
    },
  },
  layers: [
    { id: 'ground', type: 'background', paint: { 'background-color': '#0b1016' } },
    {
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      paint: { 'raster-saturation': -0.3, 'raster-brightness-max': 0.68, 'raster-contrast': 0.06, 'raster-fade-duration': 120 },
    },
  ],
}
const ROAD_WIDTH_M = [16, 14, 11, 9, 8, 5.5, 3.5]
const FLAT = { depthWriteEnabled: false, depthCompare: 'always' } as const

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
const HOSPITAL_ICON = svgUrl(
  `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><circle cx='32' cy='32' r='27' fill='#ef4444' stroke='white' stroke-width='5'/><path d='M27 17h10v10h10v10H37v10H27V37H17V27h10z' fill='white'/></svg>`,
)
const HOSPITAL_ICON_DIM = svgUrl(
  `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><circle cx='32' cy='32' r='27' fill='#7f1d1d' stroke='#fca5a5' stroke-width='4'/><path d='M27 17h10v10h10v10H37v10H27V37H17V27h10z' fill='#fecaca'/></svg>`,
)
const DEST_ICON = svgUrl(
  `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='80' viewBox='0 0 64 80'><path d='M32 4C17 4 6 15 6 30c0 19 26 46 26 46s26-27 26-46C58 15 47 4 32 4z' fill='#22d3ee' stroke='white' stroke-width='4'/><circle cx='32' cy='30' r='10' fill='#0b1220'/></svg>`,
)

type Props = {
  meta: Meta
  roads: Roads
  buildings: Buildings
  result: SimResult | null
  buildingMode: 'flood' | 'access'
  showWater: boolean
  storm: number // 0..1 severity for lighting
  onPick: (p: LonLat) => void
}

function useDecodedImage(url?: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    const im = new Image()
    im.src = url
    im.decode()
      .then(() => alive && setImg(im))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [url])
  return img
}

function useRoutePhase(active: boolean) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      if (t - last > 33) {
        setPhase((t / 7000) % 1)
        last = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
  return phase
}

function pointAlong(coords: LonLat[], cum: number[], f: number): LonLat {
  const target = f * cum[cum.length - 1]
  let i = 1
  while (i < cum.length - 1 && cum[i] < target) i++
  const seg = cum[i] - cum[i - 1] || 1
  const t = (target - cum[i - 1]) / seg
  const a = coords[i - 1]
  const b = coords[i]
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

export default function MapView({ meta, roads, buildings, result, buildingMode, showWater, storm, onPick }: Props) {
  const roadIdx = useMemo(() => Array.from({ length: roads.paths.length }, (_, i) => i), [roads])
  const bldIdx = useMemo(() => Array.from({ length: buildings.polys.length }, (_, i) => i), [buildings])
  const overlay = useDecodedImage(result?.overlay)
  const version = useRef(0)
  const resultKey = useMemo(() => ++version.current, [result])

  const clearance = result?.route.clearance_m ?? 0.3
  const edgeDepth = result?.edges
  const bldDepth = result?.buildings
  const access = result?.access

  const effects = useMemo(() => {
    const ambient = new AmbientLight({ color: [255, 255, 255], intensity: 1.05 - 0.4 * storm })
    const sun = new DirectionalLight({ color: [255, 240, 220], intensity: 1.7 - 0.9 * storm, direction: [-3, -8, -3] })
    const sky = new DirectionalLight({ color: [170, 200, 255], intensity: 0.55, direction: [4, 6, -2] })
    return [new LightingEffect({ ambient, sun, sky })]
  }, [storm])

  const baseLayers = useMemo(() => {
    // only create the water layer once its image has decoded (an undefined image breaks texture init)
    const water = overlay
      ? new BitmapLayer({
          id: 'water',
          image: overlay,
          bounds: meta.grid.bounds,
          visible: showWater,
          opacity: 0.92,
          textureParameters: { minFilter: 'linear', magFilter: 'linear' },
          parameters: FLAT,
        })
      : null
    const roadLayer = new PathLayer<number>({
      id: 'roads',
      data: roadIdx,
      getPath: (i) => roads.paths[i],
      getColor: (i) => roadColor((edgeDepth?.[i] ?? 0) / 100, clearance, roads.bridge[i] === 1),
      // dry streets are already visible in the imagery: keep them thin; water-affected roads stand out
      getWidth: (i) => ROAD_WIDTH_M[roads.cls[i]] * ((edgeDepth?.[i] ?? 0) > 3 ? 1.25 : 0.45),
      widthUnits: 'meters',
      widthMinPixels: 0.8,
      capRounded: true,
      jointRounded: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 120],
      parameters: FLAT,
      updateTriggers: { getColor: [resultKey, clearance], getWidth: [resultKey] },
    })
    const bldLayer = new SolidPolygonLayer<number>({
      id: 'buildings',
      data: bldIdx,
      getPolygon: (i) => buildings.polys[i],
      extruded: true,
      getElevation: (i) => buildings.h[i],
      getFillColor: (i) => {
        if (buildingMode === 'access') {
          const a = access?.[i]
          return accessColor(a === undefined ? 0 : a === CUT_OFF ? null : a / 10)
        }
        return buildingFloodColor((bldDepth?.[i] ?? 0) / 100)
      },
      material: { ambient: 0.4, diffuse: 0.65, shininess: 28, specularColor: [70, 80, 100] },
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 90],
      updateTriggers: { getFillColor: [resultKey, buildingMode] },
    })
    return water ? [water, roadLayer, bldLayer] : [roadLayer, bldLayer]
  }, [overlay, showWater, meta, roads, buildings, roadIdx, bldIdx, edgeDepth, bldDepth, access, clearance, buildingMode, resultKey])

  const route = result?.route
  const cur = route?.current
  const routeCum = useMemo(() => {
    if (!cur) return null
    const cum = [0]
    for (let i = 1; i < cur.coords.length; i++) {
      const [x1, y1] = cur.coords[i - 1]
      const [x2, y2] = cur.coords[i]
      cum.push(cum[i - 1] + Math.hypot((x2 - x1) * 0.9, y2 - y1))
    }
    return cum
  }, [cur])
  const phase = useRoutePhase(!!cur)

  const routeLayers = useMemo(() => {
    if (!route) return []
    const layers = []
    if (route.dry) {
      layers.push(
        new PathLayer({
          id: 'route-dry',
          data: [route.dry.coords],
          getPath: (d: LonLat[]) => d,
          getColor: [255, 255, 255, 150],
          getWidth: 3,
          widthUnits: 'pixels',
          getDashArray: [4, 3],
          dashJustified: true,
          extensions: [new PathStyleExtension({ dash: true })],
          parameters: FLAT,
        }),
      )
    }
    if (route.blocked.length) {
      layers.push(
        new PathLayer({
          id: 'route-blocked',
          data: route.blocked,
          getPath: (d: LonLat[]) => d,
          getColor: [255, 64, 64, 255],
          getWidth: 9,
          widthUnits: 'pixels',
          capRounded: true,
          parameters: FLAT,
        }),
        new ScatterplotLayer({
          id: 'route-blocked-pts',
          data: route.blocked.filter((_, i) => i % 3 === 0),
          getPosition: (d: LonLat[]) => d[Math.floor(d.length / 2)],
          getRadius: 7,
          radiusUnits: 'pixels',
          getFillColor: [255, 64, 64, 255],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2,
          stroked: true,
          parameters: FLAT,
        }),
      )
    }
    if (cur) {
      layers.push(
        new PathLayer({
          id: 'route-glow',
          data: [cur.coords],
          getPath: (d: LonLat[]) => d,
          getColor: [52, 211, 153, 70],
          getWidth: 16,
          widthUnits: 'pixels',
          capRounded: true,
          jointRounded: true,
          parameters: FLAT,
        }),
        new PathLayer({
          id: 'route-now',
          data: [cur.coords],
          getPath: (d: LonLat[]) => d,
          getColor: [52, 211, 153, 255],
          getWidth: 6,
          widthUnits: 'pixels',
          capRounded: true,
          jointRounded: true,
          parameters: FLAT,
        }),
      )
    }
    return layers
  }, [route, cur])

  const markerLayers = useMemo(() => {
    const hospitals = meta.hospitals.map((h) => ({ ...h, active: h.id === route?.hospital.id }))
    const dest = route?.dest
    const labels = [
      ...meta.neighborhoods.filter((n) => n.id !== dest?.id).map((n) => ({ text: n.name, pos: [n.lon, n.lat], kind: 'hood' })),
      ...hospitals.filter((h) => h.active).map((h) => ({ text: `Destination · ${h.name}`, pos: [h.lon, h.lat], kind: 'hosp' })),
      ...(dest ? [{ text: `Start · ${dest.name}`, pos: [dest.lon, dest.lat], kind: 'dest' }] : []),
    ]
    return [
      new TextLayer({
        id: 'labels',
        data: labels,
        getText: (d: { text: string }) => d.text,
        getPosition: (d: { pos: number[] }) => d.pos as [number, number],
        getSize: (d: { kind: string }) => (d.kind === 'hood' ? 11 : 13),
        getColor: (d: { kind: string }) => (d.kind === 'hood' ? [203, 213, 225, 200] : [255, 255, 255, 255]),
        getPixelOffset: (d: { kind: string }) => (d.kind === 'hood' ? [0, 0] : [0, -34]),
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontWeight: 600,
        characterSet: 'auto',
        background: true,
        getBackgroundColor: (d: { kind: string }) =>
          d.kind === 'hosp' ? [127, 29, 29, 220] : d.kind === 'dest' ? [8, 51, 68, 230] : [8, 13, 24, 150],
        backgroundPadding: [6, 3],
        parameters: FLAT,
      }),
      new IconLayer({
        id: 'hospitals',
        data: hospitals,
        getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
        getIcon: (d: { active: boolean }) => ({
          url: d.active ? HOSPITAL_ICON : HOSPITAL_ICON_DIM,
          id: d.active ? 'h-on' : 'h-off',
          width: 64,
          height: 64,
        }),
        getSize: (d: { active: boolean }) => (d.active ? 34 : 22),
        sizeUnits: 'pixels',
        parameters: FLAT,
      }),
      ...(dest
        ? [
            new IconLayer({
              id: 'dest',
              data: [dest],
              getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
              getIcon: () => ({ url: DEST_ICON, id: 'dest', width: 64, height: 80, anchorY: 78 }),
              getSize: 40,
              sizeUnits: 'pixels',
              parameters: FLAT,
            }),
          ]
        : []),
    ]
  }, [meta, route])

  const ambulance = useMemo(() => {
    if (!cur || !routeCum || cur.coords.length < 2) return []
    const p = pointAlong(cur.coords, routeCum, 1 - phase)
    return [
      new ScatterplotLayer({
        id: 'ambulance',
        data: [p],
        getPosition: (d: LonLat) => d,
        getRadius: 9,
        radiusUnits: 'pixels',
        getFillColor: [255, 255, 255, 255],
        getLineColor: [16, 185, 129, 255],
        lineWidthMinPixels: 4,
        stroked: true,
        parameters: FLAT,
      }),
    ]
  }, [cur, routeCum, phase])

  const getTooltip = ({ layer, index }: PickingInfo) => {
    if (!layer || index < 0) return null
    const style = {
      background: 'rgba(8,13,24,0.94)',
      color: '#e2e8f0',
      border: '1px solid rgba(148,163,184,0.25)',
      borderRadius: '10px',
      padding: '8px 10px',
      fontSize: '12px',
      fontFamily: 'Inter, ui-sans-serif, system-ui',
      lineHeight: '1.45',
      boxShadow: '0 10px 30px rgba(0,0,0,.4)',
    }
    if (layer.id === 'roads') {
      const d = (edgeDepth?.[index] ?? 0) / 100
      const fii = 1 - Math.exp(-d / 0.25)
      const state = d > clearance ? '⛔ impassable' : d >= 0.03 ? '⚠️ wet, slow' : '✓ dry'
      return {
        html: `<b>${roads.name[index] ?? 'Unnamed road'}</b>${roads.bridge[index] ? ' · bridge' : ''}<br/>
          <span style="color:#94a3b8">${meta.road_classes[roads.cls[index]]} · ${Math.round(roads.len[index])} m</span><br/>
          Water depth <b>${Math.round(d * 100)} cm</b> · Flood index <b>${fii.toFixed(2)}</b><br/>${state}`,
        style,
      }
    }
    if (layer.id === 'buildings') {
      const d = (bldDepth?.[index] ?? 0) / 100
      const a = access?.[index]
      const acc = a === undefined ? '' : a === CUT_OFF ? '<span style="color:#e879f9">cut off from ER</span>' : `ER response ${(a / 10).toFixed(1)} min`
      return {
        html: `<b>${buildings.name[index] ?? buildings.kind[index].replace(/_/g, ' ')}</b><br/>
          <span style="color:#94a3b8">${Math.round(buildings.h[index])} m tall</span><br/>
          Water at lowest wall <b>${Math.round(d * 100)} cm</b><br/>${acc}`,
        style,
      }
    }
    return null
  }

  return (
    <DeckGL
      initialViewState={meta.region.view}
      controller={{ inertia: 250 }}
      layers={[...baseLayers, ...routeLayers, ...ambulance, ...markerLayers]}
      effects={effects}
      getTooltip={getTooltip}
      onClick={(info) => {
        if (info.coordinate) onPick([info.coordinate[0], info.coordinate[1]])
      }}
    >
      <Map reuseMaps mapStyle={BASEMAP} attributionControl={{ compact: true }} />
    </DeckGL>
  )
}
