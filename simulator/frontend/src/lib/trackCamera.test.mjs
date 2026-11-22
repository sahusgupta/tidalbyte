import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WebMercatorViewport } from '@math.gl/web-mercator'
import { fitEventTrack } from './trackCamera.ts'

test('fitting a committed track keeps all points in the accessible map area on touch and desktop', () => {
  const view = { longitude: -95.37, latitude: 29.76, zoom: 14, pitch: 55, bearing: -28 }
  const points = [[-95.39845, 29.79769], [-95.43194, 29.73121]]
  for (const [width, height, rail] of [[390, 650, 0], [1440, 740, 332]]) {
    const next = fitEventTrack(view, points, width, height, rail, 100)
    assert.equal(next.pitch, view.pitch)
    assert.equal(next.bearing, view.bearing)
    const camera = new WebMercatorViewport({ width, height, ...next })
    for (const p of points) {
      const [x, y] = camera.project(p)
      assert.ok(x >= 24 && x <= width - rail - 44)
      assert.ok(y >= 100 && y <= height - 60)
    }
    assert.equal(fitEventTrack(next, points, width, height, rail, 100), next)
  }
})
