import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { WebMercatorViewport } from '@math.gl/web-mercator'
import { chromium } from 'playwright'

// Run against the integrated atlas and the prepared Downtown simulator.
const zone = 'downtown-buffalo-bayou'
const atlas = process.env.QA_ATLAS_URL ?? 'http://127.0.0.1:5173/'
const simulator = process.env.QA_SIMULATOR_URL ?? 'http://127.0.0.1:5174/'
const metaResponse = await fetch(new URL(`api/regions/${zone}/meta`, simulator))
assert.ok(metaResponse.ok, 'Downtown region unavailable')
const meta = await metaResponse.json()
const chrome = process.env.QA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({ ...(existsSync(chrome) && { executablePath: chrome }) })
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce',
    })
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(45_000)
      const sent = [], errors = []
      const endpoint = `/api/regions/${zone}/simulate`
      page.on('pageerror', e => errors.push(e.message))
      page.on('request', request => { if (request.url().endsWith(endpoint)) sent.push(request.postDataJSON()) })
      const waitForModel = predicate => page.waitForResponse(r =>
        r.url().endsWith(endpoint) && r.ok() && predicate(r.request().postDataJSON()),
      )
      const tap = locator => mobile ? locator.tap() : locator.click()
      await page.goto(new URL(`#/zone/${zone}`, atlas).href)
      const frame = page.frameLocator('.sim iframe')
      const map = frame.locator('#deckgl-overlay')
      await map.waitFor()
      const button = name => frame.getByRole('button', { name, exact: true })
      const storm = button('Storm controls')
      const openStorm = async () => {
        if (await storm.getAttribute('aria-expanded') !== 'true') await tap(storm)
      }
      await openStorm()
      const preset = meta.presets.memorial
      await Promise.all([waitForModel(r => r.rain === preset.rain && !r.event), tap(button(preset.label))])

      const beginDrawing = async () => {
        await openStorm()
        await tap(frame.locator('.storm-event summary'))
        await tap(button('Draw a path on the map'))
        await frame.getByText('Tap the map to place the storm origin.', { exact: true }).waitFor()
      }
      const status = (count) => frame.getByText(`${count} ${count === 1 ? 'point' : 'points'} placed.`, { exact: false }).waitFor()
      const box = await map.boundingBox()
      const camera = new WebMercatorViewport({ ...meta.region.view, width: box.width, height: box.height })
      const points = [[0.43, 0.45], [0.62, 0.55], [0.5, 0.58]].map(([x, y]) => {
        const local = [Math.round(x * box.width), Math.round(y * box.height)]
        const [west, south, east, north] = meta.region.bbox
        const ll = camera.unproject(local)
        assert.ok(ll[0] > west && ll[0] < east && ll[1] > south && ll[1] < north)
        return { x: box.x + local[0], y: box.y + local[1], ll }
      })
      const pick = ({ x, y }) => mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y, { delay: 75 })
      const comparePoint = (received, expected) => assert.ok(
        Math.hypot(received[0] - expected[0], received[1] - expected[1]) < 0.0005,
        'A picked ground coordinate differs by more than about 55 m',
      )

      await beginDrawing()
      await pick(points[0]); await status(1)
      await pick(points[1]); await status(2)
      await tap(button('Undo point')); await status(1)
      await tap(button('Cancel'))
      await frame.locator('.storm-draw').waitFor({ state: 'hidden' })
      assert.ok(!sent.some(r => r.event || r.dest_lonlat), 'Draft or cancellation changed the simulation or routing pin')

      await beginDrawing()
      await pick(points[0]); await status(1)
      await pick(points[1]); await status(2)
      const [applied] = await Promise.all([
        waitForModel(r => r.event?.track.length === 2), tap(button('Apply path')),
      ])
      const appliedRequest = applied.request().postDataJSON()
      assert.ok(!appliedRequest.dest_lonlat)
      appliedRequest.event.track.forEach((ll, i) => comparePoint(ll, points[i].ll))
      const impact = await applied.json()
      assert.ok(impact.spatial?.flow_paths.length, 'The rain event returned no downhill traces')
      assert.ok(impact.stats.roads.flooded_km > 0)

      const [pinned] = await Promise.all([waitForModel(r => r.dest_lonlat), pick(points[2])])
      const pinRequest = pinned.request().postDataJSON()
      assert.deepEqual(pinRequest.event, appliedRequest.event)
      comparePoint(pinRequest.dest_lonlat, points[2].ll)
      const { route } = await pinned.json()
      assert.ok(route.current?.coords.length > 1 && route.current.length_m > 100, 'Expected a modeled route to the hospital')
      await frame.getByRole('heading', { name: 'Impact & routing' }).waitFor()
      await frame.getByRole('option', { name: /Dropped pin/ }).waitFor({ state: 'attached' })
      assert.equal(sent.filter(r => r.dest_lonlat).length, 1, 'One ground gesture sent duplicate pin requests')
      assert.deepEqual(errors, [])
      console.log(`PASS ${mobile ? 'emulated touch' : 'desktop mouse'}: draw, undo, cancel, apply, separate ${route.status} route`)
    } finally { await context.close() }
  }
} finally { await browser.close() }
