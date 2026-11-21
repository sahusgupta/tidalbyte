import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import DeckGL, { type DeckGLRef } from '@deck.gl/react'
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
import { ScaleControl } from 'react-map-gl/maplibre'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl'

// maplibre-gl 6 resolves its worker relative to its own module, which breaks under Vite's dependency
// pre-bundling. The worker files are copied to /maplibre/ by the plugin in vite.config.ts.
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

import { CUT_OFF, type LonLat, type Meta, type Roads, type SimResult, type ViewState } from '../lib/api'
import type { PreparedBuildings } from '../lib/buildingGeometry'
import { useRouteMarker } from './useRouteMarker'
import { accessColor, buildingFloodColor, roadColor } from '../lib/colors'

// Ground: USGS The National Map orthoimagery (public domain, no key; ~2 m/px over the US at z16).
// Toned down so flood depth, routes and closures stay readable on top of it.
const BASEMAP: StyleSpecification = {
  version: 8,
  sources: {
    archive: {
      type: 'image', url: '/map/houston-usgs.webp',
      coordinates: [[-95.9, 30.200078125], [-94.7, 30.200078125], [-94.7, 29.249921875], [-95.9, 29.249921875]],
    },
    archiveDetail: {
      type: 'image', url: '/map/houston-detail-usgs.webp',
      coordinates: [[-95.570036869, 29.96], [-95.079963131, 29.96], [-95.079963131, 29.6], [-95.570036869, 29.6]],
    },
    satellite: {
      type: 'raster',
      tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 16,
      minzoom: 16,
      attribution:
        'Imagery: <a href="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer" target="_blank" rel="noopener">USDA / USGS The National Map</a>',
    },
  },
  layers: [
    { id: 'ground', type: 'background', paint: { 'background-color': '#181a18' } },
    { id: 'archive', type: 'raster', source: 'archive', paint: { 'raster-saturation': -0.65, 'raster-brightness-max': 0.55, 'raster-contrast': 0.1, 'raster-fade-duration': 0 } },
    { id: 'archive-detail', type: 'raster', source: 'archiveDetail', paint: { 'raster-saturation': -0.65, 'raster-brightness-max': 0.55, 'raster-contrast': 0.1, 'raster-fade-duration': 0 } },
    {
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      minzoom: 16,
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
  buildings: PreparedBuildings
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

function MapView({ meta, roads, buildings, result, buildingMode, showWater, storm, onPick }: Props) {
  const deckRef = useRef<DeckGLRef>(null)
  const pointers = useRef(new Set<number>())
  const groundTap = useRef<{ id: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const release = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId)
      if (groundTap.current?.id === event.pointerId) groundTap.current = null
    }
    const reset = () => {
      pointers.current.clear()
      groundTap.current = null
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', reset)
    }
  }, [])

  const startGroundTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element) || event.target.closest('button,a,input,select,.maplibregl-control-container')) return
    pointers.current.add(event.pointerId)
    groundTap.current = pointers.current.size === 1 && event.isPrimary && event.button === 0
      ? { id: event.pointerId, x: event.clientX, y: event.clientY }
      : null
  }
  const moveGroundTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    const tap = groundTap.current
    if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 6) groundTap.current = null
  }
  const finishGroundTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    const tap = groundTap.current
    pointers.current.delete(event.pointerId)
    groundTap.current = null
    if (!tap || tap.id !== event.pointerId || pointers.current.size || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 6) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const viewport = deckRef.current?.deck?.getViewports({ x, y })[0]
    if (!viewport) return
    // Route pins belong on the ground even when the user taps the roof of a building.
    const [lon, lat] = viewport.unproject([x - viewport.x, y - viewport.y], { targetZ: 0 })
    if (Number.isFinite(lon) && Number.isFinite(lat)) onPick([lon, lat])
  }

  const [view, setView] = useState<ViewState>(meta.region.view)
  const [openingStage, setOpeningStage] = useState(0)
  const nextStage = useRef<number | undefined>(undefined)
  useEffect(() => () => {
    if (nextStage.current !== undefined) cancelAnimationFrame(nextStage.current)
    nextStage.current = undefined
  }, [])
  const [viewOptions, setViewOptions] = useState(false)
  const [imageryWarning, setImageryWarning] = useState(false)
  const controlsRef = useRef<HTMLDivElement>(null)
  const viewButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!viewOptions) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlsRef.current?.contains(event.target)) setViewOptions(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setViewOptions(false); viewButton.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [viewOptions])
  const roadIdx = useMemo(() => Array.from({ length: roads.paths.length }, (_, i) => i), [roads])
  const overlay = useDecodedImage(result?.overlay)
  const version = useRef(0)
  const resultKey = useMemo(() => ++version.current, [result])

  const clearance = result?.route.clearance_m ?? 0.3
  const edgeDepth = result?.edges
  const bldDepth = result?.buildings
  const access = result?.access

  const lighting = useMemo(() => {
    const ambient = new AmbientLight({ color: [255, 255, 255], intensity: 1.05 })
    const sun = new DirectionalLight({ color: [255, 240, 220], intensity: 1.7, direction: [-3, -8, -3] })
    const sky = new DirectionalLight({ color: [170, 200, 255], intensity: 0.55, direction: [4, 6, -2] })
    return { ambient, sun, effects: [new LightingEffect({ ambient, sun, sky })] }
  }, [])
  lighting.ambient.intensity = 1.05 - 0.4 * storm
  lighting.sun.intensity = 1.7 - 0.9 * storm

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
      data: buildings.mesh,
      _normalize: false,
      extruded: true,
      getFillColor: (_, { index: i }) => {
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
    return { water, roadLayer, bldLayer }
  }, [overlay, showWater, meta, roads, buildings, roadIdx, edgeDepth, bldDepth, access, clearance, buildingMode, resultKey])

  const route = result?.route
  const cur = route?.current
  const { marker, projectMarker } = useRouteMarker(deckRef, cur?.coords)
  const afterRender = () => {
    projectMarker()
    if (openingStage < 2 && nextStage.current === undefined) {
      // Each shader family can block on the driver the first time it links.
      // Give the browser a paint and input opportunity after each group.
      nextStage.current = requestAnimationFrame(() => {
        nextStage.current = undefined
        setOpeningStage(stage => Math.min(2, stage + 1))
      })
    }
  }

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
        fontFamily: '"Source Sans 3 Variable", sans-serif',
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

  const getTooltip = ({ layer, index }: PickingInfo) => {
    if (!layer || index < 0) return null
    const style = {
      background: '#1c2632',
      color: '#d5e0eb',
      border: '1px solid #3e5062',
      borderRadius: '2px',
      padding: '8px 10px',
      fontSize: '12px',
      fontFamily: '"Source Sans 3 Variable", sans-serif',
      lineHeight: '1.45',
      whiteSpace: 'pre-line',
      boxShadow: '0 10px 30px rgba(0,0,0,.4)',
    }
    if (layer.id === 'roads') {
      const d = (edgeDepth?.[index] ?? 0) / 100
      const fii = 1 - Math.exp(-d / 0.25)
      const state = d > clearance ? '⛔ impassable' : d >= 0.03 ? '⚠️ wet, slow' : '✓ dry'
      return {
        text: [
          `${roads.name[index] ?? 'Unnamed road'}${roads.bridge[index] ? ' · bridge' : ''}`,
          `${meta.road_classes[roads.cls[index]]} · ${Math.round(roads.len[index])} m`,
          `Water depth ${Math.round(d * 100)} cm · Flood index ${fii.toFixed(2)}`,
          state,
        ].join('\n'),
        style,
      }
    }
    if (layer.id === 'buildings') {
      const d = (bldDepth?.[index] ?? 0) / 100
      const a = access?.[index]
      const acc = a === undefined ? '' : a === CUT_OFF ? 'Cut off from ER' : `ER response ${(a / 10).toFixed(1)} min`
      return {
        text: [
          buildings.name[index] ?? buildings.kind[index].replace(/_/g, ' '),
          `${Math.round(buildings.h[index])} m tall`,
          `Water at lowest wall ${Math.round(d * 100)} cm`,
          acc,
        ].filter(Boolean).join('\n'),
        style,
      }
    }
    return null
  }

  return (
    <><div className="sim-deck-surface" onPointerDownCapture={startGroundTap} onPointerMoveCapture={moveGroundTap} onPointerUpCapture={finishGroundTap} onPointerCancelCapture={() => { pointers.current.clear(); groundTap.current = null }} onContextMenuCapture={() => { groundTap.current = null }}><DeckGL
      ref={deckRef}
      viewState={view}
      onViewStateChange={({ viewState }) => setView(viewState as ViewState)}
      controller={{ inertia: 250 }}
      onInteractionStateChange={({ isDragging }) => { if (isDragging) groundTap.current = null }}
      onAfterRender={afterRender}
      layers={[
        openingStage > 0 && baseLayers.water,
        openingStage > 0 && baseLayers.roadLayer,
        baseLayers.bldLayer,
        openingStage > 1 && routeLayers,
        openingStage > 1 && markerLayers,
      ]}
      effects={lighting.effects}
      getTooltip={getTooltip}
    >
      <Map reuseMaps mapStyle={BASEMAP} onError={() => setImageryWarning(true)} attributionControl={{ compact: false, customAttribution: 'USDA / USGS · 2017–2021 aerial archive' }}>
        <ScaleControl position="bottom-left" unit="metric" maxWidth={100} />
      </Map>
    </DeckGL><span ref={marker} className="sim-route-dot" aria-hidden="true" /></div>
    {imageryWarning && <p className="sim-imagery-warning" role="status">Some imagery could not load. Scenario geometry remains visible.</p>}
    <div className="sim-map-controls" ref={controlsRef} role="group" aria-label="Map camera controls">
      <button type="button" aria-label="Zoom in" onClick={() => setView((current) => ({ ...current, zoom: Math.min(19, current.zoom + 0.5) }))}><Plus size={18} /></button>
      <button type="button" aria-label="Zoom out" onClick={() => setView((current) => ({ ...current, zoom: Math.max(1, current.zoom - 0.5) }))}><Minus size={18} /></button>
      <button type="button" ref={viewButton} aria-label="Map view options" aria-expanded={viewOptions} aria-controls="map-view-options" onClick={() => setViewOptions((value) => !value)}>View <ChevronDown size={14} /></button>
      {viewOptions && <div className="sim-view-options" id="map-view-options">
        <button type="button" onClick={() => setView((current) => ({ ...current, bearing: 0 }))}>Face north</button>
        <button type="button" aria-pressed={view.pitch === 0} onClick={() => setView((current) => ({ ...current, pitch: current.pitch === 0 ? meta.region.view.pitch : 0 }))}>{view.pitch === 0 ? 'Angled view' : 'Top-down view'}</button>
        <button type="button" onClick={() => { setView(meta.region.view); setViewOptions(false) }}>Reset region view</button>
      </div>}
    </div></>
  )
}

// Slider labels can render without reconciling the entire map.
export default memo(MapView)
