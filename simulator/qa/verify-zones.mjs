import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { WebMercatorViewport } from '@math.gl/web-mercator'

const atlas = process.env.QA_ATLAS_URL ?? 'http://127.0.0.1:5173/'
const simulator = process.env.QA_SIMULATOR_URL ?? 'http://127.0.0.1:5174/'
const output = process.env.QA_OUTPUT_DIR ?? join(tmpdir(), `earthlab-zone-qa-${Date.now()}`)
const zones = (process.env.QA_ZONES ?? 'downtown-buffalo-bayou,medical-center-brays,meyerland,ship-channel,kingwood-lake-houston').split(',').filter(Boolean)
const viewports = (process.env.QA_VIEWPORTS ?? 'desktop,mobile').split(',').map(name => {
  assert.ok(['desktop', 'mobile'].includes(name), `Unknown viewport: ${name}`)
  return { name, width: name === 'desktop' ? 1440 : 390, height: name === 'desktop' ? 900 : 844 }
})
const suppliedPins = JSON.parse(await readFile(process.env.QA_PINS_FILE ?? new URL('./verified-pins.json', import.meta.url), 'utf8'))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const inBounds = (point, bbox) => point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3]
async function json(url, init) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000), ...init })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${await response.text()}`)
  return response.json()
}
async function until(check, message, timeout = 60_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (check()) return; await sleep(100) }
  throw new Error(message)
}
function fingerprint(result) {
  const hash = createHash('sha256')
  for (const values of [result.edges, result.buildings]) hash.update(Buffer.from(Uint16Array.from(values).buffer))
  return hash.digest('hex')
}
function summary(result, request) {
  return { request, scenario: result.scenario, fingerprint: fingerprint(result), stats: result.stats, route: result.route, timingMs: result.timing_ms }
}
async function choosePin(region, meta) {
  const supplied = suppliedPins[region]
  assert.ok(supplied?.hospitalId && supplied?.lonlat, `${region}: no reviewed pin/destination in QA_PINS_FILE`)
  const hospital = meta.hospitals.find(h => h.id === supplied.hospitalId)
  assert.ok(hospital, `${region}: reviewed hospital ID ${supplied.hospitalId} is missing from the new dataset; revalidate the fixture instead of substituting another destination`)
  assert.ok(inBounds(supplied.lonlat, meta.region.bbox), `${region}: reviewed pin left the prepared region`)
  assert.ok(meta.presets[supplied.routePreset], `${region}: reviewed route preset ${supplied.routePreset} is missing`)
  assert.ok(meta.vehicles[supplied.vehicle], `${region}: reviewed vehicle ${supplied.vehicle} is missing`)
  const { rain, duration, surge, clog } = meta.presets[supplied.routePreset]
  const request = { rain, duration, surge, clog, hospital: hospital.id, vehicle: supplied.vehicle, dest_lonlat: supplied.lonlat }
  const result = await json(new URL(`api/regions/${region}/simulate`, simulator), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
  assert.ok(result.route.current?.coords.length > 1 && result.route.current.length_m > 100 && result.route.status !== 'blocked', `${region}: reviewed pin no longer has a meaningful model route; revalidate the dataset/fixture`)
  return { point: supplied.lonlat, hospital, vehicle: supplied.vehicle, expectedRoute: result.route.status, routePreset: supplied.routePreset }
}
async function tap(page, locator, mobile) { if (mobile) await locator.tap(); else await locator.click() }
// A visible canvas can still be an empty basemap. Observe deck.gl's actual
// instanced draw for the sides of elevated polygons on its WebGL canvas.
function observeBuildingDraw() {
  if (window.top === window || !window.WebGL2RenderingContext) return
  const proto = WebGL2RenderingContext.prototype
  const draw = proto.drawArraysInstanced
  proto.drawArraysInstanced = function (mode, first, count, instances) {
    draw.call(this, mode, first, count, instances)
    if (this.canvas.id !== 'deckgl-overlay' || mode !== this.TRIANGLE_STRIP || count !== 4 || instances <= 0) return
    const program = this.getParameter(this.CURRENT_PROGRAM)
    if (program && this.getAttribLocation(program, 'elevations') >= 0 && this.getAttribLocation(program, 'nextVertexPositions') >= 0) {
      window.__earthlabBuildingSides = instances
      proto.drawArraysInstanced = draw
    }
  }
}
async function pickOnMap(page, context, location, mobile) {
  if (!mobile) {
    await page.mouse.move(location.x, location.y)
    await sleep(200)
    await page.mouse.click(location.x, location.y, { delay: 100 })
    return
  }
  const input = await context.newCDPSession(page)
  try {
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...location, id: 1, radiusX: 4, radiusY: 4, force: 0.5 }] })
    await sleep(100)
    await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally { await input.detach() }
}
async function screenshot(page, name) { await page.screenshot({ path: join(output, `${name}.png`), timeout: 25_000 }) }
async function closeBrowser(server, browser) {
  let timer
  await Promise.race([(async () => { await browser.close().catch(() => {}); await server.close() })(), new Promise(resolve => { timer = setTimeout(() => server.kill().then(resolve), 10_000) })])
  clearTimeout(timer)
}

await mkdir(output, { recursive: true })
const catalog = await json(new URL('api/regions', simulator))
for (const id of zones) assert.ok(catalog.find(region => region.id === id)?.built, `${id} is not prepared; refusing to pass a fallback region`)
const reports = []
for (const id of zones) {
  const meta = await json(new URL(`api/regions/${id}/meta`, simulator))
  assert.equal(meta.region.id, id)
  const pin = await choosePin(id, meta)
  const stormKey = suppliedPins[id]?.stormPreset ?? ['memorial', 'thunderstorm', 'taxday', 'harvey'].find(key => meta.presets[key]) ?? Object.keys(meta.presets).find(key => meta.presets[key].rain > 0)
  assert.ok(stormKey, `${id}: no nonzero storm preset`)
  for (const viewport of viewports) {
    const mobile = viewport.name === 'mobile'
    const label = `${id}-${viewport.name}`
    console.log(`START ${label}`)
    const chrome = process.env.QA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    const server = await chromium.launchServer({
      headless: process.env.QA_HEADED !== '1',
      ...(existsSync(chrome) ? { executablePath: chrome } : {}),
      args: process.env.QA_SOFTWARE_GL === '1' ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [],
    })
    const browser = await chromium.connect(server.wsEndpoint())
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1, reducedMotion: 'reduce' })
    await context.addInitScript(observeBuildingDraw)
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)
    const errors = [], requests = [], responses = [], wrongRegions = [], pending = new Set(), blockedRemote = []
    const regionAssets = new Set()
    const report = { id, viewport, input: mobile ? 'emulated touch; not a physical phone' : 'desktop mouse', hospital: { id: pin.hospital.id, name: pin.hospital.name, note: pin.hospital.note ?? 'No provenance note supplied by API', suppliedProvenance: suppliedPins[id]?.hospitalProvenance ?? null }, pin: pin.point, model: { model: meta.model.model, teacher: meta.model.teacher }, counts: meta.counts, status: 'failed' }
    const step = name => { report.step = name; console.log(`STEP ${label}: ${name}`) }
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (new URL(request.url()).pathname.match(/^\/api\/regions\/[^/]+\/simulate$/)) requests.push(request.postDataJSON())
    })
    page.on('response', response => {
      const match = new URL(response.url()).pathname.match(/^\/api\/regions\/([^/]+)\/(meta|roads|buildings|simulate)$/)
      if (!match) return
      if (match[1] !== id) wrongRegions.push(match[1])
      if (match[2] !== 'simulate') {
        if (response.ok()) regionAssets.add(match[2])
        return
      }
      const task = response.json().then(result => {
        assert.equal(response.status(), 200, `Simulation HTTP ${response.status()}: ${JSON.stringify(result)}`)
        responses.push(summary(result, response.request().postDataJSON()))
      }).catch(error => errors.push(error.message)).finally(() => pending.delete(task))
      pending.add(task)
    })
    if (process.env.QA_ALLOW_REMOTE !== '1') await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (!url.protocol.startsWith('http') || [new URL(atlas).origin, new URL(simulator).origin].includes(url.origin)) route.continue()
      else { blockedRemote.push(url.origin); route.abort() }
    })
    try {
      step('product-landing-area-simulator')
      await page.goto(atlas, { waitUntil: 'domcontentloaded' })
      await tap(page, page.getByRole('link', { name: 'Open EarthLab', exact: true }), mobile)
      await page.waitForURL(url => url.hash === '#/simulate')
      const areas = page.getByRole('navigation', { name: 'Houston simulation areas' })
      await tap(page, areas.locator(`a[href="#/zone/${id}"]`), mobile)
      await page.waitForURL(url => url.hash === `#/zone/${id}`, { timeout: 60_000 })
      const iframe = page.locator('.sim iframe')
      await iframe.waitFor()
      const frame = page.frameLocator('.sim iframe')
      await frame.locator('.sim-map').waitFor({ timeout: 90_000 })
      const regionName = meta.region.name.replace(/^Houston:\s*/, '')
      await page.getByRole('heading', { name: regionName, exact: true }).waitFor()
      report.renderedRegion = { name: regionName, mapLabel: await frame.locator('.sim-map').getAttribute('aria-label'), frameUrl: await iframe.getAttribute('src') }
      assert.equal(new URL(await iframe.getAttribute('src')).searchParams.get('zone'), id)
      assert.equal(await frame.locator('.sim-zone-note').count(), 0, 'Fallback notice appeared')
      await until(() => responses.length > 0, 'Initial model response missing')
      await frame.locator('.sim-map canvas').first().waitFor()
      const regionFrame = await (await iframe.elementHandle()).contentFrame()
      const sideDraw = await regionFrame.waitForFunction(() => window.__earthlabBuildingSides > 0 && window.__earthlabBuildingSides)
      report.buildingWallInstances = await sideDraw.jsonValue()
      assert.deepEqual([...regionAssets].sort(), ['buildings', 'meta', 'roads'], 'Selected region assets missing')
      report.renderer = await frame.locator('.sim-map').evaluate(element => {
        const canvas = element.querySelector('#deckgl-overlay')
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
        const extension = gl?.getExtension('WEBGL_debug_renderer_info')
        return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'Renderer details unavailable'
      })
      await frame.locator('.sim-map').evaluate(() => document.fonts.ready)
      await screenshot(page, `${label}-opening`)
      step('storm-preset')
      await tap(page, frame.getByRole('button', { name: 'Storm controls', exact: true }), mobile)
      const beforePreset = responses.length
      await tap(page, frame.getByRole('button', { name: meta.presets[stormKey].label, exact: true }), mobile)
      await until(() => responses.length > beforePreset, 'Storm preset response missing')
      await tap(page, frame.getByRole('button', { name: 'Collapse storm controls', exact: true }), mobile)
      const beforePlay = responses.length
      step('playback-model-changes')
      await tap(page, frame.getByRole('button', { name: 'Play storm hour by hour', exact: true }), mobile)
      await until(() => responses.slice(beforePlay).length >= 3 && new Set(responses.slice(beforePlay).map(result => result.fingerprint)).size > 1, 'Playback did not change model outputs', 90_000)
      const elapsed = await frame.locator('.sim-time strong').innerText()
      assert.match(elapsed, /^T\+/)
      if (await frame.getByRole('button', { name: 'Stop storm playback', exact: true }).count()) await tap(page, frame.getByRole('button', { name: 'Stop storm playback', exact: true }), mobile)
      await sleep(300)
      report.playback = { preset: stormKey, elapsed, frames: responses.slice(beforePlay).map(result => ({ scenario: result.scenario, fingerprint: result.fingerprint, floodedRoadKm: result.stats.roads.flooded_km, floodedBuildings: result.stats.buildings.flooded })) }
      step('clear-scenario-and-route-inputs')
      await tap(page, frame.getByRole('button', { name: 'Storm controls', exact: true }), mobile)
      const clearKey = pin.routePreset
      const beforeClear = responses.length
      await tap(page, frame.getByRole('button', { name: meta.presets[clearKey].label, exact: true }), mobile)
      await until(() => responses.length > beforeClear && responses.at(-1).scenario.rain === meta.presets[clearKey].rain, 'Reviewed route scenario response missing')
      await tap(page, frame.getByRole('button', { name: 'Collapse storm controls', exact: true }), mobile)
      await tap(page, frame.getByRole('button', { name: 'Impact and routing', exact: true }), mobile)
      const destination = frame.getByRole('combobox', { name: 'Destination hospital', exact: true })
      if (await destination.inputValue() !== pin.hospital.id) {
        const beforeHospital = responses.length
        await destination.selectOption(pin.hospital.id)
        await until(() => responses.slice(beforeHospital).some(result => result.request.hospital === pin.hospital.id), 'Hospital selection response missing')
      }
      const vehicleLabel = pin.vehicle === 'ambulance' ? 'Ambulance' : pin.vehicle === 'sedan' ? 'Car' : 'Rescue'
      const selectedVehicle = frame.getByRole('button', { name: new RegExp(`^${vehicleLabel}(?:\\s|$)`) })
      if (await selectedVehicle.getAttribute('aria-pressed') !== 'true') {
        const beforeVehicle = responses.length
        await tap(page, selectedVehicle, mobile)
        await until(() => responses.slice(beforeVehicle).some(result => result.request.vehicle === pin.vehicle), 'Vehicle selection response missing')
      }
      await tap(page, frame.getByRole('button', { name: 'Collapse impact panel', exact: true }), mobile)
      let zoom = meta.region.view.zoom
      let location
      for (let attempt = 0; attempt < 5; attempt++) {
        const box = await frame.locator('.sim-map').boundingBox()
        const projected = new WebMercatorViewport({ ...meta.region.view, width: box.width, height: box.height, zoom }).project(pin.point)
        if (projected[0] > 24 && projected[0] < box.width - 24 && projected[1] > 90 && projected[1] < box.height - 100) { location = { x: box.x + projected[0], y: box.y + projected[1] }; break }
        await tap(page, frame.getByRole('button', { name: 'Zoom out', exact: true }), mobile); zoom -= 0.5
      }
      assert.ok(location, 'Validated pin is outside the visible map after bounded zoom changes')
      const beforePin = responses.length
      const beforePinRequests = requests.length
      step('map-pin-route')
      report.pinScreen = location
      await frame.locator('.sim-map').evaluate(element => {
        window.__earthlabQAInput = []
        for (const type of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend']) element.addEventListener(type, event => {
          window.__earthlabQAInput.push({ type, pointerType: event.pointerType, x: event.clientX, y: event.clientY, target: event.target.id || event.target.tagName })
        }, { capture: true, passive: true })
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
      await pickOnMap(page, context, location, mobile)
      try {
        await until(() => requests.slice(beforePinRequests).some(request => request.dest_lonlat), 'Native map input did not send a pin request', 15_000)
        await until(() => responses.slice(beforePin).some(result => result.request.dest_lonlat), 'Pin request did not receive a successful model response')
      }
      finally { report.inputEvents = await frame.locator('.sim-map').evaluate(() => window.__earthlabQAInput) }
      const picked = responses.slice(beforePin).find(result => result.request.dest_lonlat)
      assert.equal(picked.request.hospital, pin.hospital.id)
      assert.equal(picked.request.vehicle, pin.vehicle)
      assert.ok(inBounds(picked.request.dest_lonlat, meta.region.bbox))
      assert.ok(Math.hypot(picked.request.dest_lonlat[0] - pin.point[0], picked.request.dest_lonlat[1] - pin.point[1]) < 0.002, 'Map projection/pick drift exceeded roughly200m')
      assert.notEqual(picked.route.status, 'blocked')
      assert.ok(picked.route.current?.coords.length > 1 && picked.route.current.length_m > 100)
      await frame.getByRole('heading', { name: 'Impact & routing', exact: true }).waitFor()
      assert.match(await frame.locator('.sim-panel-host').innerText(), /From[\s\S]*To/)
      assert.ok((await frame.locator('.sim-panel-host').innerText()).includes(picked.route.hospital.name))
      await screenshot(page, `${label}-pin-route`)
      report.pinRequestCount = requests.slice(beforePinRequests).filter(request => request.dest_lonlat).length
      assert.equal(report.pinRequestCount, 1, 'One ground gesture emitted duplicate pin requests')
      await Promise.allSettled(pending)
      assert.deepEqual(wrongRegions, [], 'A different region rendered a simulation response')
      assert.deepEqual(errors, [], 'Uncaught browser/API errors')
      report.route = { request: picked.request, status: picked.route.status, hospital: picked.route.hospital, origin: picked.route.dest, current: { lengthM: picked.route.current.length_m, timeSeconds: picked.route.current.time_s, vertices: picked.route.current.coords.length } }
      report.blockedRemoteOrigins = [...new Set(blockedRemote)]
      report.status = 'passed'
      console.log(`PASS ${label}`)
    } catch (error) {
      report.error = error.stack ?? String(error)
      report.browserErrors = errors
      report.requests = requests
      await screenshot(page, `${label}-failure`).catch(capture => { report.captureError = capture.message })
      console.error(`FAIL ${label}: ${error.message}`)
    } finally {
      reports.push(report)
      await writeFile(join(output, 'results.json'), JSON.stringify(reports, null, 2))
      await closeBrowser(server, browser)
    }
  }
}
console.log(`Results and captures: ${output}`)
if (reports.some(report => report.status !== 'passed')) process.exitCode = 1
