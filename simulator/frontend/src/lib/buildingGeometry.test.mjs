import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareBuildings } from './buildingGeometry.ts'

test('closed wall strips, concave roofs and picking rows preserve the source footprints', () => {
  const open = [[0,0], [2,0], [2,1], [1,1], [1,2], [0,2]]
  const closed = [[4,0], [4,1], [5,1], [5,0], [4,0]]
  const source = { polys: [open, closed], h: [5.5, 16], name: ['First', null], kind: ['office', 'house'] }
  const { mesh, h, name, kind } = prepareBuildings(source)
  assert.equal(mesh.length, 2)
  assert.deepEqual([...mesh.startIndices], [0, 7, 12])
  assert.deepEqual(h, source.h)
  assert.deepEqual(name, source.name)
  assert.deepEqual(kind, source.kind)
  const { getPolygon, indices, elevations, instanceVertexValid, rowIndexes } = mesh.attributes
  const position = index => getPolygon.value.subarray(index * 3, index * 3 + 2)
  const area = [0, 0]
  for (let row = 0; row < mesh.length; row++) {
    const start = mesh.startIndices[row], end = mesh.startIndices[row + 1]
    assert.deepEqual(position(start), position(end - 1))
    assert.ok(elevations.value.subarray(start, end).every(height => height === h[row]))
    assert.ok(rowIndexes.value.subarray(start, end).every(sourceIndex => sourceIndex === row))
    assert.ok(instanceVertexValid.value.subarray(start, end - 1).every(valid => valid === 1))
    assert.equal(instanceVertexValid.value[end - 1], 0)
  }
  for (let i = 0; i < indices.value.length; i += 3) {
    const [a, b, c] = indices.value.subarray(i, i + 3)
    const row = rowIndexes.value[a]
    assert.equal(rowIndexes.value[b], row)
    assert.equal(rowIndexes.value[c], row)
    const [ax, ay] = position(a), [bx, by] = position(b), [cx, cy] = position(c)
    area[row] += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2
  }
  assert.deepEqual(area, [3, 1])
})
