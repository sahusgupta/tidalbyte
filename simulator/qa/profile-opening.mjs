// Cold browser, warm local services. Run from simulator/qa alongside verify-zones.mjs.
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const site = process.env.QA_ATLAS_URL ?? 'http://127.0.0.1:5173/'
const region = process.env.QA_ZONE ?? 'downtown-buffalo-bayou'
const chrome = process.env.QA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const samples = []

function instrument() {
  const stats = window.openingProfile = { heading: 0, walls: 0, buildingDraws: 0, longTasks: [] }
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) stats.longTasks.push({ start: entry.startTime, ms: entry.duration })
  }).observe({ type: 'longtask', buffered: true })
  if (window === window.top) {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.landing-intro h1')) return
      observer.disconnect()
      requestAnimationFrame(() => { stats.heading = performance.now() })
    })
    observer.observe(document, { subtree: true, childList: true })
    return
  }
  const proto = WebGL2RenderingContext.prototype
  const draw = proto.drawArraysInstanced
  proto.drawArraysInstanced = function (mode, first, count, instances) {
    draw.call(this, mode, first, count, instances)
    if (this.canvas.id !== 'deckgl-overlay' || mode !== this.TRIANGLE_STRIP || count !== 4 || !instances) return
    if (stats.walls) {
      if (instances === stats.wallInstances) stats.buildingDraws++
      return
    }
    const program = this.getParameter(this.CURRENT_PROGRAM)
    if (!program || this.getAttribLocation(program, 'elevations') < 0 || this.getAttribLocation(program, 'nextVertexPositions') < 0) return
    stats.walls = performance.now()
    stats.wallInstances = instances
    stats.buildingDraws++
  }
}

for (let run = 0; run < Number(process.env.QA_TRIALS ?? 3); run++) {
  const browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}) })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript(instrument)
    // External imagery latency varies between runs. Exercise the bundled Houston imagery.
    await context.route(/^https:/, route => route.abort())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto(site, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.openingProfile.heading > 0)
    const intro = await page.evaluate(() => ({
      ms: Math.round(window.openingProfile.heading),
      jsBytes: performance.getEntriesByType('resource').filter(r => /\.js(?:\?|$)/.test(r.name) && r.responseEnd <= window.openingProfile.heading).reduce((total, r) => total + r.decodedBodySize, 0),
    }))
    await page.getByRole('link', { name: /skip introduction/i }).focus()
    await page.keyboard.press('Enter')
    const link = page.locator('dialog a[href="#/zone/' + region + '"]')
    await link.evaluate(a => a.addEventListener('click', () => { window.openingProfile.click = performance.timeOrigin + performance.now() }, { once: true }))
    await link.click()
    const click = await page.evaluate(() => window.openingProfile.click)
    const iframe = page.locator('iframe.sim-frame')
    await iframe.waitFor()
    const frame = await (await iframe.elementHandle()).contentFrame()
    await frame.waitForFunction(() => window.openingProfile?.walls > 0, null, { timeout: 90_000 })
    await frame.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.endsWith('/simulate')))
    await frame.waitForTimeout(800)
    const controls = frame.getByRole('button', { name: 'Map view options' })
    await controls.click()
    await frame.getByRole('button', { name: 'Top-down view' }).waitFor()
    await controls.click()
    const sample = await frame.evaluate(async ({ intro, click }) => {
      const { walls, longTasks } = window.openingProfile
      const times = []
      const start = performance.now()
      const drawsBefore = window.openingProfile.buildingDraws
      await new Promise(done => {
        let last
        const tick = t => {
          if (last !== undefined) times.push(t - last)
          last = t
          if (t - start < 1800) requestAnimationFrame(tick)
          else done()
        }
        requestAnimationFrame(tick)
      })
      times.sort((a, b) => a - b)
      const resources = performance.getEntriesByType('resource')
      return {
        headingMs: intro.ms, headingJsBytes: intro.jsBytes,
        buildingsMs: Math.round(performance.timeOrigin + walls - click),
        openingLongestTaskMs: Math.max(0, ...longTasks.filter(t => t.start <= walls).map(t => t.ms)),
        idleFrameP95Ms: Math.round(times[Math.floor(times.length * 0.95)]),
        idleBuildingDraws: window.openingProfile.buildingDraws - drawsBefore,
        regionRequests: resources.filter(r => /\/api\/regions/.test(r.name)).map(r => ({ path: new URL(r.name).pathname.split('/').pop(), start: Math.round(r.startTime), ms: Math.round(r.duration) })),
      }
    }, { intro, click })
    await frame.getByRole('button', { name: 'Storm controls', exact: true }).click()
    const storm = frame.getByRole('button', { name: /memorial/i }).first()
    const selected = page.waitForResponse(r => r.url().endsWith('/simulate') && r.request().method() === 'POST')
    await storm.click()
    await selected
    await frame.getByRole('button', { name: 'Collapse storm controls' }).click()
    await frame.getByRole('button', { name: 'Play storm hour by hour' }).click()
    const playback = await frame.evaluate(async () => {
      const frames = []
      const start = performance.now()
      await new Promise(done => {
        let last
        const tick = t => {
          if (last !== undefined) frames.push(t - last)
          last = t
          if (t - start < 3500) requestAnimationFrame(tick)
          else done()
        }
        requestAnimationFrame(tick)
      })
      const complete = performance.getEntriesByType('resource').filter(r => r.startTime >= start && r.name.endsWith('/simulate')).length
      return { playbackFramesCompleted: complete, playbackFrameP95Ms: Math.round(frames.sort((a, b) => a - b)[Math.floor(frames.length * 0.95)]) }
    })
    Object.assign(sample, playback)
    if (errors.length) throw new Error(errors.join('\n'))
    samples.push(sample)
    console.log(JSON.stringify(sample))
  } finally { await browser.close() }
}
if (samples.length) {
  const median = key => samples.map(s => s[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]
  console.log('Median', JSON.stringify(Object.fromEntries(['headingMs', 'headingJsBytes', 'buildingsMs', 'openingLongestTaskMs', 'idleFrameP95Ms', 'idleBuildingDraws', 'playbackFramesCompleted', 'playbackFrameP95Ms'].map(key => [key, median(key)]))))
}
