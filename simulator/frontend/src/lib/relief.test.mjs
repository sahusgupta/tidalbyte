import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assignBuildings, parseAmount, reasons, reliefPlan, splitDollars, tractNeeds, vulnerabilityWeight } from './relief.ts'

const square = (x0, y0) => [[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]]
const tract = (geoid, x0, extra = {}) => ({
  geoid, label: `Tract ${geoid}`, name: null, population: 1000, svi: 0.5, poverty: 10, noVehicle: 10, age65: 10,
  disability: 10, uninsured: 5, limitedEnglish: 2, anchor: [x0 + 0.5, 0.5], outline: square(x0, 0), ...extra,
})

test('buildings are matched to the tract that contains them', () => {
  const points = [[0.5, 0.5], [1.5, 0.5], [5, 5]]
  const assign = assignBuildings((i) => points[i], points.length, [tract('a', 0), tract('b', 1)])
  assert.deepEqual([...assign], [0, 1, -1])
})

test('residents are counted from the share of a tract\'s buildings that flood', () => {
  const tracts = [tract('a', 0)]
  const assign = Int16Array.from([0, 0, 0, 0])
  const [n] = tractNeeds(tracts, assign, [60, 20, 0, 0], [65535, 10, 10, 10])
  assert.equal(n.flooded, 500) // 2 of 4 buildings above 15 cm
  assert.equal(n.deep, 250) // 1 of 4 above 50 cm
  assert.equal(n.noCar, 50) // 10% of flooded residents
  assert.equal(n.cutOff, 50) // 1 of 4 cut off x (10% + 10%) older or disabled
})

test('vulnerability shifts weight only as far as the priority allows', () => {
  assert.equal(vulnerabilityWeight(0.9, 0), 1)
  assert.equal(vulnerabilityWeight(1, 1), 2)
  assert.equal(vulnerabilityWeight(0, 1), 0)
})

test('the budget is split exactly in $100 steps across the neediest places', () => {
  const parts = splitDollars(1_000_000, [1, 1, 1])
  assert.equal(parts.reduce((a, b) => a + b, 0), 1_000_000)
  assert.ok(parts.every((p) => p % 100 === 0))
  const tracts = [tract('a', 0, { svi: 0.95 }), tract('b', 1, { svi: 0.05 }), tract('c', 2)]
  const needs = [
    { flooded: 300, deep: 0, noCar: 30, cutOff: 0 },
    { flooded: 400, deep: 0, noCar: 40, cutOff: 0 },
    { flooded: 0, deep: 0, noCar: 0, cutOff: 0 },
  ]
  const most = reliefPlan(tracts, needs, 100_000, 0)
  assert.deepEqual(most.places.map((p) => p.tract.geoid), ['b', 'a'])
  assert.equal(most.places.reduce((a, p) => a + p.dollars, 0), 100_000)
  assert.equal(reliefPlan(tracts, needs, 100_000, 1).places[0].tract.geoid, 'a')
})

test('reasons are plain words backed by the data', () => {
  const t = tract('a', 0, { noVehicle: 31, poverty: 52 })
  assert.deepEqual(reasons(t, { flooded: 100, deep: 5, noCar: 31, cutOff: 0 }), ['low incomes', 'many households have no car'])
})

test('custom amounts accept commas, dollar signs and k/m shorthand', () => {
  assert.equal(parseAmount('$1,250,000'), 1_250_000)
  assert.equal(parseAmount('750k'), 750_000)
  assert.equal(parseAmount(' 2.5M '), 2_500_000)
  assert.ok(Number.isNaN(parseAmount('lots')))
  assert.ok(Number.isNaN(parseAmount('-5')))
})
