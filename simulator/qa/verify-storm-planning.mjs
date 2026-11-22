import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const atlas = process.env.QA_ATLAS_URL ?? 'http://127.0.0.1:5173/'
const zone = 'downtown-buffalo-bayou'
const output = process.env.QA_OUTPUT_DIR ?? join(tmpdir(), `earthlab-storm-planning-${Date.now()}`)
const chrome = process.env.QA_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  args: process.env.QA_SOFTWARE_GL === '1' ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [],
})
try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const touch = width < 500
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)
    const click = locator => touch ? locator.tap() : locator.click()
    const requests = []
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (request.url().endsWith('/adaptation')) requests.push(request.postDataJSON())
    })
    await page.goto(atlas)
    await click(page.getByRole('link', { name: 'Open flŭd', exact: true }))
    await click(page.getByRole('navigation', { name: 'Houston simulation areas' }).locator(`a[href="#/zone/${zone}"]`))
    const frame = page.frameLocator('.sim iframe')
    await click(frame.getByRole('button', { name: 'Storm controls', exact: true }))
    await click(frame.getByRole('button', { name: '100-Yr NOAA Atlas', exact: true }))
    await click(frame.locator('.storm-event summary'))
    const origin = frame.getByLabel('Storm origin')
    await origin.selectOption({ index: 1 })
    const waypoint = frame.getByLabel('Extend path through')
    const twoPoints = page.waitForResponse(r => r.url().endsWith('/simulate') && r.request().postDataJSON()?.event?.track?.length === 2)
    await waypoint.selectOption({ index: 1 })
    const storm = await twoPoints
    assert.equal(storm.status(), 200)
    const event = storm.request().postDataJSON().event
    await click(frame.getByRole('button', { name: 'Collapse storm controls' }))
    await click(frame.getByRole('button', { name: 'Impact and routing' }))
    await click(frame.locator('.storm-planning > summary'))
    const run = frame.getByRole('button', { name: 'Compare agency plans' })
    const calculate = async () => {
      const response = page.waitForResponse(r => r.url().endsWith('/allocation/storm/compare'))
      await click(run)
      const reply = await response
      assert.equal(reply.status(), 200, await reply.text())
      const { data } = await reply.json()
      await frame.locator('.planning-result table').waitFor()
      assert.equal(data.strategies.length, 3)
      return { data, input: reply.request().postDataJSON() }
    }
    const first = await calculate()
    assert.equal(requests[0].phase, 'mitigation')
    assert.deepEqual(requests[0].scenario.event, event)
    const coordinated = first.data.strategies.find(s => s.id === 'coordinated')
    assert.ok(coordinated.funded.length > 0, 'The prepared demonstration should fund a project')
    assert.ok(coordinated.outcome.delay_minutes <= first.input.measurements.outcomes[0].delay_minutes)
    assert.ok(coordinated.outcome.impaired_km < first.input.measurements.outcomes[0].impaired_km)
    const scope = frame.locator('.storm-planning')
    for (const plan of first.data.strategies) {
      await frame.getByLabel('Agency strategy').selectOption(plan.id)
      assert.equal(await scope.locator('.planning-actions li').count(), plan.funded.length)
      for (const action of plan.funded) assert.ok((await scope.innerText()).includes(first.input.measurements.corridors[action.corridor].name))
    }
    await frame.getByLabel('Agency strategy').selectOption('coordinated')
    await scope.locator('.planning-actions').scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(output, `${width}-planning.png`) })
    assert.ok(await scope.evaluate(el => el.scrollWidth <= el.clientWidth + 2), 'Panel overflowed horizontally')
    await click(frame.getByText('Budget, crews and agency priorities', { exact: true }))
    await frame.getByLabel('Shared budget (units)').fill('0')
    const zero = await calculate()
    assert.equal(requests.length, 1, 'Changing resources should reuse the paired network runs')
    for (const plan of zero.data.strategies) {
      assert.equal(plan.funded.length, 0)
      assert.deepEqual(plan.outcome, zero.input.measurements.outcomes[0])
    }
    await frame.getByLabel('Shared budget (units)').fill('36')
    await frame.getByLabel('Available crews').fill('1')
    await frame.getByLabel('Health budget', { exact: true }).fill('0')
    await frame.getByLabel('Information available').selectOption('full_model')
    await frame.getByLabel('Planning phase').selectOption('response')
    const after = await calculate()
    assert.equal(requests[1].phase, 'response')
    assert.deepEqual(requests[1].scenario.event, event)
    assert.equal(after.input.measurements.offset_cm, 10)
    for (const plan of after.data.strategies) {
      assert.ok(plan.crews <= 1 && plan.spend <= 24)
      assert.ok(plan.funded.every(a => a.agency === 'Public works'))
    }
    assert.deepEqual(errors, [])
    await writeFile(join(output, `${width}-results.json`), JSON.stringify({ zone, event, first, zero, after }, null, 2))
    console.log(`PASS ${width}×${height} ${touch ? 'emulated touch' : 'mouse'} — ${coordinated.funded.length} coordinated projects, both phases and binding limits`)
    await context.close()
  }
} finally { await browser.close() }
console.log(output)
