import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startRain } from './rainRenderer.ts'

test('rain eases into and out of storms, sleeps when clear and stops for reduced motion', () => {
  let frame, cancelled, lines = 0, idle = 0
  const originalRAF = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (fn) => { frame = fn; return 42 }
  globalThis.cancelAnimationFrame = (id) => { cancelled = id }
  const ctx = { setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() { lines++ }, stroke() {}, fillRect() {} }
  const canvas = { width: 0, height: 0, getContext: () => ctx }
  let state = { rain: 200, wind: 1, severity: 0, width: 800, height: 600, dpr: 1, reduce: false }
  try {
    let time = performance.now()
    const tick = () => {
      const callback = frame
      frame = undefined
      callback(time += 16)
    }
    const start = () => startRain(canvas, () => state, () => { idle++ })
    start()
    tick()
    assert.ok(lines > 0 && lines < 1100, 'density eases toward new rainfall instead of jumping')
    const before = lines
    tick()
    assert.ok(lines > before, 'animation continues between weather messages')
    state = { ...state, rain: 0 }
    lines = 0
    tick()
    assert.ok(lines > 0, 'existing particles fade out when a storm ends')
    for (let i = 0; i < 200 && frame; i++) tick()
    assert.equal(frame, undefined, 'no animation or canvas clears scheduled once dry')
    assert.equal(idle, 1)

    state = { ...state, rain: 60, width: 400, height: 300, dpr: 1.5 }
    const stop = start()
    tick()
    assert.equal(canvas.width, 600)
    assert.equal(canvas.height, 450)
    state = { ...state, reduce: true }
    lines = 0
    tick()
    assert.equal(lines, 0)
    assert.equal(frame, undefined)
    assert.equal(idle, 2)
    stop()
    assert.equal(cancelled, 42)
  } finally {
    globalThis.requestAnimationFrame = originalRAF
    globalThis.cancelAnimationFrame = originalCancel
  }
})
