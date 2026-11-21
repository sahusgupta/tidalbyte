import { earcut, modifyPolygonWindingDirection, WINDING } from '@math.gl/polygon'
import { lngLatToWorld } from '@math.gl/web-mercator'
import type { Buildings } from './api'

/** Preserve the source row for every wall, roof, tooltip and simulation result. */
export function prepareBuildings({ polys, h, name, kind }: Buildings) {
  const startIndices = new Uint32Array(polys.length + 1)
  for (let i = 0; i < polys.length; i++) {
    const ring = polys[i]
    const last = ring.at(-1)
    const open = last && (last[0] !== ring[0][0] || last[1] !== ring[0][1])
    startIndices[i + 1] = startIndices[i] + ring.length + (open ? 1 : 0)
  }

  const count = startIndices[polys.length]
  const positions = new Float64Array(count * 3)
  const triangles = new Uint32Array(count * 3)
  const valid = new Uint16Array(count)
  const rows = new Uint32Array(count)
  const elevations = new Float32Array(count)
  let indexCount = 0

  for (let i = 0; i < polys.length; i++) {
    const ring = polys[i]
    const start = startIndices[i]
    const end = startIndices[i + 1]
    if (end === start) continue
    const coordinates = positions.subarray(start * 3, end * 3)
    for (let vertex = 0; vertex < end - start; vertex++) {
      const point = ring[vertex] ?? ring[0]
      coordinates[vertex * 3] = point[0]
      coordinates[vertex * 3 + 1] = point[1]
    }
    // SolidPolygonLayer expects a closed clockwise exterior. The wire format
    // supplies one exterior per building. Match deck.gl's Mercator roof plane.
    modifyPolygonWindingDirection(coordinates, WINDING.CLOCKWISE, { size: 3, isClosed: true })
    const projected: number[] = []
    for (let v = 0; v < coordinates.length; v += 3) {
      const [x, y] = lngLatToWorld([coordinates[v], coordinates[v + 1]])
      projected.push(x, y)
    }
    for (const vertex of earcut(projected)) triangles[indexCount++] = start + vertex
    // The closing vertex is also the break between two buildings' wall strips.
    valid.fill(1, start, end - 1)
    rows.fill(i, start, end)
    elevations.fill(h[i], start, end)
  }

  const mesh = {
    length: polys.length,
    startIndices,
    attributes: {
      getPolygon: { value: positions, size: 3 },
      indices: { value: triangles.subarray(0, indexCount), size: 1 },
      instanceVertexValid: { value: valid, size: 1 },
      rowIndexes: { value: rows, size: 1 },
      elevations: { value: elevations, size: 1 },
    },
  }
  return { mesh, h, name, kind }
}

export type PreparedBuildings = ReturnType<typeof prepareBuildings>
