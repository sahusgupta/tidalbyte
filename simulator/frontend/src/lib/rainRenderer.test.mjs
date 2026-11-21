import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startRain } from './rainRenderer.ts'

test('rain keeps scheduling, eases storm edits, resizes, honors reduced motion and stops', () => {
  let frame, cancelled, lines = 0
  const originalRAF = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (fn) => { frame = fn; return 42 }
  globalThis.cancelAnimationFrame = (id) => { cancelled = id }
  const ctx = { setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() { lines++ }, stroke() {}, fillRect() {} }
  const canvas = { width: 0, height: 0, getContext: () => ctx }
  let state = { rain: 0, wind: 0, severity: 0, width: 800, height: 600, dpr: 1, reduce: false }
  try {
    const stop = startRain(canvas, () => state)
    let time = performance.now()
    frame(time += 16)
    assert.equal(lines, 0)
    state = { ...state, rain: 200, wind: 1 }
    frame(time += 16)
    assert.ok(lines > 0 && lines < 1100, 'density eases toward new rainfall instead of jumping')
    const before = lines
    frame(time += 16)
    assert.ok(lines > before, 'animation continues between weather messages')
    state = { ...state, width: 400, height: 300, dpr: 1.5, reduce: true }
    lines = 0
    frame(time += 16)
    assert.equal(lines, 0)
    assert.equal(canvas.width, 600)
    assert.equal(canvas.height, 450)
    stop()
    assert.equal(cancelled, 42)
  } finally {
    globalThis.requestAnimationFrame = originalRAF
    globalThis.cancelAnimationFrame = originalCancel
  }
})
