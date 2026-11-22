import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeClosures, directionMarks, isRoadClosed, streetWater, streetWidth } from './floodMapGeometry.ts'

test('ponded streets fill their own carriageways and closure markings follow vehicle clearance', () => {
  // Only edge 9 closed at its unrounded depth. Both are shown as 30 cm in the UI.
  const closures = decodeClosures(btoa(String.fromCharCode(0, 2)))
  assert.deepEqual(streetWater(2, false), [0, 0])
  assert.deepEqual(streetWater(30, isRoadClosed(closures, 8, 30, 0.30)), [0.3, 0])
  assert.deepEqual(streetWater(30, isRoadClosed(closures, 9, 30, 0.30)), [0.3, 1])
  assert.deepEqual(streetWater(31, isRoadClosed(undefined, 9, 31, 0.30)), [0.31, 1])
  assert.deepEqual(streetWater(31, isRoadClosed(undefined, 9, 31, 0.75)), [0.31, 0])
  assert.ok(streetWidth(3, 6, true) < streetWidth(3, 15, true))
  assert.equal(streetWidth(3, 15, true), streetWidth(3, 100, true))
  assert.ok(streetWidth(3, 60, true) > streetWidth(6, 60, true))
  assert.ok(streetWidth(3, 60, false) < streetWidth(3, 60, true))
})

test('direction marks follow local geographic direction through a turn', () => {
  const route = [[-95.30, 30], [-95.29, 30], [-95.29, 30.01]]
  const arrows = directionMarks(route, 750, 3)
  assert.equal(arrows.length, 2)
  assert.ok(Math.abs(arrows[0].angle + 90) < 0.001)
  assert.equal(arrows[0].position[1], 30)
  assert.ok(Math.abs(arrows[1].angle) < 0.001)
  assert.equal(arrows[1].position[0], -95.29)
  assert.deepEqual(directionMarks([route[0], route[0], ...route], 750, 3), arrows)
})

test('a tapped point or tiny segment cannot invent a downstream direction', () => {
  for (const line of [[], [[0, 0]], [[0, 0], [0, 0]], [[0, 0], [0, 0.00005]]]) {
    assert.deepEqual(directionMarks(line, 500, 3), [])
  }
})
